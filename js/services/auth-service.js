/* services/auth-service.js — authentication, sessions, RBAC, rate limiting (use case layer) */
"use strict";
import { pwPolicy, makeSalt, hashPassword, randomToken } from "../core/sha256.js";
import { createUserEntity, validateUsername } from "../domain/entities.js";

const ROLE_HIERARCHY = { VIEWER: 1, ANALYST: 2, ADMIN: 3 };

export class AuthService {
  /** @param {{users: UsersRepo, log: LogService, settings: SettingsService, clock: Clock, ids: IdProvider, session: SessionStore}} deps */
  constructor(deps) {
    this.repo = deps.users;
    this.log = deps.log;
    this.settings = deps.settings;
    this.clock = deps.clock;
    this.ids = deps.ids;
    this.session = deps.session;
    this._attempts = {}; // username -> [timestamps]
  }

  /* ---------- seeding ---------- */
  seedDefaults() {
    if (this.repo.all().length) return;
    const mk = (username, pw, role, fullname, must) => {
      const salt = makeSalt();
      return Object.assign(createUserEntity({
        username, fullname, role, salt,
        passwordHash: hashPassword(pw, salt), mustChangePw: must
      }), { id: this.ids.next(), created: this.clock.nowISO(), lastLogin: null, active: true });
    };
    this.repo.save([
      mk("admin", "admin123", "ADMIN", "System Administrator", true),
      mk("analyst", "Analyst#123", "ANALYST", "Demo Analyst", false),
      mk("viewer", "Viewer#123", "VIEWER", "Demo Viewer", false)
    ]);
    this.log.add("SECURITY", "system", "USER_SEED", "Seeded default users (admin/analyst/viewer)");
  }

  /* ---------- registration ---------- */
  register(username, pw, fullname) {
    const name = String(username || "").trim();
    const nameErr = validateUsername(name);
    if (nameErr) return { ok: false, msg: nameErr };
    if (this.repo.byName(name)) return { ok: false, msg: "Username is already taken." };
    const pol = pwPolicy(pw);
    if (!pol.ok) return { ok: false, msg: "Password too weak: " + pol.msg.join(", ") + "." };
    const salt = makeSalt();
    const u = Object.assign(createUserEntity({
      username: name, fullname: String(fullname || "").trim() || name,
      role: "ANALYST", salt, passwordHash: hashPassword(pw, salt), mustChangePw: false
    }), { id: this.ids.next() });
    const list = this.repo.all();
    list.push(u);
    this.repo.save(list);
    this.log.add("SECURITY", u.id, "USER_REGISTER", "New account created: " + name, { role: "ANALYST" });
    return { ok: true, user: u };
  }

  /* ---------- rate limiting: 5 attempts / minute per username ---------- */
  _rateOK(name) {
    const now = this.clock.nowMs();
    const arr = (this._attempts[name] || []).filter(t => now - t < 60000);
    this._attempts[name] = arr;
    return arr.length < 5;
  }
  _rateRemaining(name) {
    const now = this.clock.nowMs();
    return Math.max(0, 5 - (this._attempts[name] || []).filter(t => now - t < 60000).length);
  }

  /* ---------- login / logout ---------- */
  login(name, pw) {
    const u = this.repo.byName(name);
    if (!u) return { ok: false, msg: "Invalid username or password." };
    if (!this._rateOK(u.username)) return { ok: false, msg: "Too many failed attempts. Wait 60 seconds.", locked: true };
    if (!u.active) return { ok: false, msg: "Account is disabled. Contact an administrator." };
    if (hashPassword(pw, u.salt) !== u.passwordHash) {
      if (!this._attempts[u.username]) this._attempts[u.username] = [];
      this._attempts[u.username].push(this.clock.nowMs());
      this.log.add("WARNING", u.id, "LOGIN_FAIL", "Failed login attempt for " + u.username);
      const left = this._rateRemaining(u.username);
      return { ok: false, msg: "Invalid username or password." + (left < 5 ? " " + left + " attempts remaining." : "") };
    }
    delete this._attempts[u.username];
    u.lastLogin = this.clock.nowISO();
    this.repo.save(this.repo.all().map(x => (x.id === u.id ? u : x)));
    const idle = this.settings.get("idleTimeoutMin") * 60000;
    this.session.set("gpb_session", {
      token: randomToken(), userId: u.id, loginAt: this.clock.nowISO(),
      expireAt: new Date(this.clock.nowMs() + idle).toISOString(), lastActivity: this.clock.nowMs()
    });
    this.log.add("SECURITY", u.id, "LOGIN", "Successful login for " + u.username);
    return { ok: true, user: u, mustChangePw: !!u.mustChangePw };
  }
  logout(reason) {
    const u = this.current();
    this.session.remove("gpb_session");
    if (u) this.log.add("SECURITY", u.id, "LOGOUT", "Signed out" + (reason ? " (" + reason + ")" : ""));
  }

  /* ---------- session ---------- */
  current() {
    const raw = this.session.getRaw("gpb_session");
    if (!raw) return null;
    let sess = null;
    try { sess = JSON.parse(raw); } catch (e) { return null; }
    if (this.clock.nowMs() > new Date(sess.expireAt).getTime()) {
      this.session.remove("gpb_session");
      return null;
    }
    const u = this.repo.byId(sess.userId);
    return u && u.active ? u : null;
  }
  touch() {
    const raw = this.session.getRaw("gpb_session");
    if (!raw) return;
    try {
      const sess = JSON.parse(raw);
      sess.expireAt = new Date(this.clock.nowMs() + this.settings.get("idleTimeoutMin") * 60000).toISOString();
      sess.lastActivity = this.clock.nowMs();
      this.session.set("gpb_session", sess);
    } catch (e) { /* ignore */ }
  }

  /* ---------- RBAC ---------- */
  can(role, action) {
    if (role === "ADMIN") return true;
    if (role === "ANALYST") return action !== "admin";
    if (role === "VIEWER") return ["view", "export", "report"].indexOf(action) >= 0;
    return false;
  }
  /** Returns user object if authenticated, false if authenticated-but-forbidden, null if guest. */
  guard(action) {
    const u = this.current();
    if (!u) return null;
    return this.can(u.role, action) ? u : false;
  }

  /* ---------- password ---------- */
  changePassword(u, pw) {
    const pol = pwPolicy(pw);
    if (!pol.ok) return { ok: false, msg: "Password too weak: " + pol.msg.join(", ") + "." };
    const salt = makeSalt();
    this.repo.save(this.repo.all().map(x => {
      if (x.id === u.id) { x.salt = salt; x.passwordHash = hashPassword(pw, salt); x.mustChangePw = false; }
      return x;
    }));
    this.log.add("SECURITY", u.id, "PASSWORD_CHANGE", "Password changed for " + u.username);
    return { ok: true };
  }

  /* ---------- admin user management ---------- */
  adminCreateUser(actor, username, pw, role, fullname) {
    const pol = pwPolicy(pw);
    if (!pol.ok) return { ok: false, msg: "Password too weak: " + pol.msg.join(", ") + "." };
    const nameErr = validateUsername(username);
    if (nameErr) return { ok: false, msg: nameErr };
    if (this.repo.byName(username)) return { ok: false, msg: "Username taken." };
    const salt = makeSalt();
    const u = Object.assign(createUserEntity({
      username: String(username).trim(), fullname: fullname || String(username).trim(),
      role, salt, passwordHash: hashPassword(pw, salt), mustChangePw: false
    }), { id: this.ids.next() });
    const list = this.repo.all();
    list.push(u);
    this.repo.save(list);
    this.log.add("SECURITY", actor ? actor.id : "system", "USER_CREATE",
      "Admin created user " + u.username + " with role " + role);
    return { ok: true };
  }
  adminUpdateUser(actor, id, patch) {
    if (!actor || actor.role !== "ADMIN") return { ok: false, msg: "Admin only." };
    const u = this.repo.byId(id);
    if (!u) return { ok: false, msg: "User not found." };
    if (id === actor.id && patch.role && patch.role !== "ADMIN") return { ok: false, msg: "You cannot demote your own account." };
    if (patch.role) u.role = patch.role;
    if (patch.active !== undefined) u.active = !!patch.active;
    if (patch.fullname !== undefined) u.fullname = patch.fullname;
    if (patch.resetPw) {
      u.salt = makeSalt();
      u.passwordHash = hashPassword(patch.resetPw, u.salt);
      u.mustChangePw = true;
    }
    this.repo.save(this.repo.all().map(x => (x.id === id ? u : x)));
    this.log.add("SECURITY", actor.id, "USER_UPDATE",
      "Admin updated user " + u.username + (patch.role ? " → " + patch.role : ""));
    return { ok: true };
  }
  adminDeleteUser(actor, id) {
    if (!actor || actor.role !== "ADMIN") return { ok: false, msg: "Admin only." };
    const u = this.repo.byId(id);
    if (!u) return { ok: false, msg: "Not found." };
    if (u.id === actor.id) return { ok: false, msg: "You cannot delete your own account." };
    this.repo.save(this.repo.all().filter(x => x.id !== id));
    this.log.add("SECURITY", actor.id, "USER_DELETE", "Admin deleted user " + u.username);
    return { ok: true };
  }
  auditList() { return this.log.query({ level: "SECURITY" }); }

  roleRank(role) { return ROLE_HIERARCHY[role] || 0; }
}

/* js/app/redirect.js — root index boot: route by session state */
"use strict";
import { buildContainer } from "./container.js";

const c = buildContainer();
const u = c.auth.current();
if (u && u.mustChangePw) {
  location.replace("pages/dashboard.html"); // forced change modal is shown on first app page
} else if (u) {
  location.replace("pages/dashboard.html");
} else {
  location.replace("pages/login.html");
}

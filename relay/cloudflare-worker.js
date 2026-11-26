/* Cloudflare Worker — tiny CORS relay for Yahoo Finance.
 *
 * Why: browsers cannot call query1.finance.yahoo.com directly (no CORS header),
 * and the free public proxies are unreliable or now require paid keys. This
 * worker is ~30 lines, free (100k requests/day), and needs no server to manage.
 *
 * Deploy (about 2 minutes, no CLI):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file, Deploy
 *   3. StrategyLab → Settings → Market data source → Yahoo relay URL:
 *        https://<your-worker>.<subdomain>.workers.dev/?url={url}
 *      (keep the {url} placeholder — the app substitutes the encoded Yahoo URL)
 */
export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type"
    };
    const json = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: Object.assign({ "Content-Type": "application/json" }, cors)
    });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return json(400, { error: "missing ?url=<encoded yahoo url>" });

    let u;
    try { u = new URL(target); } catch (e) { return json(400, { error: "invalid url" }); }
    if (!/(^|\.)finance\.yahoo\.com$/i.test(u.hostname)) return json(403, { error: "host not allowed" });

    const upstream = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StrategyLab relay)", Accept: "application/json" },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: Object.assign({
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }, cors)
    });
  }
};

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var UPSTREAM = "https://us.i.posthog.com/batch/";
var PROJECT_KEY = "phc_uD2banhuSNmNhc496TXp3yDo7RkVpUmfPCbSBzzEXwNT";
var PATH = "/v1/punk";
var MAX_BYTES = 1e6;
var MAX_EVENTS = 500;
var MAX_LOGGED_NAMES = 20;
var EVENT_NAME = /^blp_[a-z0-9_]{1,64}$/;
var REJECTED_EVENT = "blp_relay_rejected";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var reply = /* @__PURE__ */ __name((status, body = null, headers = {}) => new Response(body, { status, headers: { ...CORS, ...headers } }), "reply");
var RATE_LIMITED = { "Retry-After": "60" };
var withinRateLimit = /* @__PURE__ */ __name((request, env) => {
  if (!env?.PER_IP) return Promise.resolve(true);
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return env.PER_IP.limit({ key }).then(({ success }) => success, () => true);
}, "withinRateLimit");
var parse = /* @__PURE__ */ __name((text) => {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}, "parse");
var isObject = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null && !Array.isArray(value), "isObject");
var EVENT_CHECKS = [
  ["event_name", (item) => EVENT_NAME.test(item.event)],
  ["timestamp", (item) => typeof item.timestamp === "string"],
  ["properties", (item) => isObject(item.properties)],
  ["distinct_id", (item) => typeof item.properties.distinct_id === "string"],
  ["person_profile", (item) => item.properties.$process_person_profile === false],
  ["geoip", (item) => item.properties.$geoip_disable === true]
];
var eventProblem = /* @__PURE__ */ __name((item) => isObject(item) ? EVENT_CHECKS.find(([, ok]) => !ok(item))?.[0] : "not_object", "eventProblem");
var batchProblems = /* @__PURE__ */ __name(({ batch }) => {
  if (!Array.isArray(batch)) return ["batch_not_array"];
  if (batch.length === 0) return ["batch_empty"];
  if (batch.length > MAX_EVENTS) return ["too_many_events"];
  return [...new Set(batch.map(eventProblem).filter(Boolean))];
}, "batchProblems");
var readCapped = /* @__PURE__ */ __name(async (stream) => {
  if (!stream) return { chunks: [], bytes: 0, truncated: false };
  const reader = stream.getReader();
  const step = /* @__PURE__ */ __name(async (chunks, bytes) => {
    const { done, value } = await reader.read();
    if (done) return { chunks, bytes, truncated: false };
    const total = bytes + value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return { chunks: [...chunks, value], bytes: total, truncated: true };
    }
    return step([...chunks, value], total);
  }, "step");
  return step([], 0);
}, "readCapped");
var declaredBytes = /* @__PURE__ */ __name((request) => Number(request.headers.get("Content-Length") ?? 0), "declaredBytes");
var field = /* @__PURE__ */ __name((text, name) => text.match(new RegExp(`"${name}"\\s*:\\s*"([^"]{1,128})"`))?.[1] ?? null, "field");
var nameCounts = /* @__PURE__ */ __name((batch) => Object.fromEntries(Object.entries(
  batch.reduce((counts, item) => {
    const name = String(item?.event ?? "").slice(0, 64);
    return { ...counts, [name]: (counts[name] ?? 0) + 1 };
  }, {})
).slice(0, MAX_LOGGED_NAMES)), "nameCounts");
var rejectionBatch = /* @__PURE__ */ __name(({ reason, problems, bytes, text, payload }) => {
  const batch = Array.isArray(payload?.batch) ? payload.batch : null;
  return {
    api_key: PROJECT_KEY,
    batch: [{
      event: REJECTED_EVENT,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      properties: {
        distinct_id: field(text, "distinct_id") ?? "blp-vega",
        reason,
        problems,
        bytes,
        events: batch?.length ?? null,
        event_names: batch ? nameCounts(batch) : null,
        app_version: field(text, "app_version"),
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: "blp-vega"
      }
    }]
  };
}, "rejectionBatch");
var sendUpstream = /* @__PURE__ */ __name((body) => fetch(UPSTREAM, { method: "POST", headers: { "Content-Type": "application/json" }, body }), "sendUpstream");
var relay = /* @__PURE__ */ __name((body) => sendUpstream(body).then(async (response) => reply(response.status, await response.text())).catch(() => reply(502)), "relay");
var reject = /* @__PURE__ */ __name((ctx, status, rejection) => {
  ctx.waitUntil(sendUpstream(JSON.stringify(rejectionBatch(rejection))).catch(() => null));
  return reply(status);
}, "reject");
var forward = /* @__PURE__ */ __name(async (request, env, ctx) => {
  if (!await withinRateLimit(request, env)) return reply(429, null, RATE_LIMITED);
  const { chunks, bytes, truncated } = await readCapped(request.body);
  const text = await new Blob(chunks).text();
  if (truncated) {
    if (field(text, "api_key") !== PROJECT_KEY) return reply(413);
    return reject(ctx, 413, { reason: "too_large", problems: [], bytes: Math.max(bytes, declaredBytes(request)), text });
  }
  const payload = parse(text);
  if (!isObject(payload)) return reply(400);
  if (payload.api_key !== PROJECT_KEY) return reply(403);
  const problems = batchProblems(payload);
  if (problems.length) return reject(ctx, 400, { reason: "invalid_batch", problems, bytes, text, payload });
  return relay(text);
}, "forward");
var ROUTES = {
  OPTIONS: /* @__PURE__ */ __name(() => reply(204), "OPTIONS"),
  POST: forward
};
var worker_default = {
  fetch: /* @__PURE__ */ __name((request, env, ctx) => {
    if (new URL(request.url).pathname !== PATH) return reply(404);
    return (ROUTES[request.method] ?? (() => reply(405)))(request, env, ctx);
  }, "fetch")
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map

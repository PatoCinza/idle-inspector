const UPSTREAM = 'https://us.i.posthog.com/batch/';
const PROJECT_KEY = 'phc_uD2banhuSNmNhc496TXp3yDo7RkVpUmfPCbSBzzEXwNT';
const PATH = '/v1/punk';
const MAX_BYTES = 1_000_000;
const MAX_EVENTS = 500;
const MAX_LOGGED_NAMES = 20;
const EVENT_NAME = /^blp_[a-z0-9_]{1,64}$/;
const REJECTED_EVENT = 'blp_relay_rejected';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const reply = (status, body = null) => new Response(body, { status, headers: CORS });

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const EVENT_CHECKS = [
  ['event_name', (item) => EVENT_NAME.test(item.event)],
  ['timestamp', (item) => typeof item.timestamp === 'string'],
  ['properties', (item) => isObject(item.properties)],
  ['distinct_id', (item) => typeof item.properties.distinct_id === 'string'],
  ['person_profile', (item) => item.properties.$process_person_profile === false],
  ['geoip', (item) => item.properties.$geoip_disable === true],
];

const eventProblem = (item) => (isObject(item) ? EVENT_CHECKS.find(([, ok]) => !ok(item))?.[0] : 'not_object');

const batchProblems = ({ batch }) => {
  if (!Array.isArray(batch)) return ['batch_not_array'];
  if (batch.length === 0) return ['batch_empty'];
  if (batch.length > MAX_EVENTS) return ['too_many_events'];
  return [...new Set(batch.map(eventProblem).filter(Boolean))];
};

const readCapped = async (stream) => {
  if (!stream) return { chunks: [], bytes: 0, truncated: false };
  const reader = stream.getReader();
  const step = async (chunks, bytes) => {
    const { done, value } = await reader.read();
    if (done) return { chunks, bytes, truncated: false };
    const total = bytes + value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return { chunks: [...chunks, value], bytes: total, truncated: true };
    }
    return step([...chunks, value], total);
  };
  return step([], 0);
};

const declaredBytes = (request) => Number(request.headers.get('Content-Length') ?? 0);

const field = (text, name) => text.match(new RegExp(`"${name}"\\s*:\\s*"([^"]{1,128})"`))?.[1] ?? null;

const nameCounts = (batch) => Object.fromEntries(Object.entries(
  batch.reduce((counts, item) => {
    const name = String(item?.event ?? '').slice(0, 64);
    return { ...counts, [name]: (counts[name] ?? 0) + 1 };
  }, {}),
).slice(0, MAX_LOGGED_NAMES));

const rejectionBatch = ({ reason, problems, bytes, text, payload }) => {
  const batch = Array.isArray(payload?.batch) ? payload.batch : null;
  return {
    api_key: PROJECT_KEY,
    batch: [{
      event: REJECTED_EVENT,
      timestamp: new Date().toISOString(),
      properties: {
        distinct_id: field(text, 'distinct_id') ?? 'blp-vega',
        reason,
        problems,
        bytes,
        events: batch?.length ?? null,
        event_names: batch ? nameCounts(batch) : null,
        app_version: field(text, 'app_version'),
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: 'blp-vega',
      },
    }],
  };
};

const sendUpstream = (body) => fetch(UPSTREAM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

const relay = (body) => sendUpstream(body)
  .then(async (response) => reply(response.status, await response.text()))
  .catch(() => reply(502));

const reject = (ctx, status, rejection) => {
  ctx.waitUntil(sendUpstream(JSON.stringify(rejectionBatch(rejection))).catch(() => null));
  return reply(status);
};

const forward = async (request, ctx) => {
  const { chunks, bytes, truncated } = await readCapped(request.body);
  const text = await new Blob(chunks).text();
  if (truncated) {
    if (field(text, 'api_key') !== PROJECT_KEY) return reply(413);
    return reject(ctx, 413, { reason: 'too_large', problems: [], bytes: Math.max(bytes, declaredBytes(request)), text });
  }
  const payload = parse(text);
  if (!isObject(payload)) return reply(400);
  if (payload.api_key !== PROJECT_KEY) return reply(403);
  const problems = batchProblems(payload);
  if (problems.length) return reject(ctx, 400, { reason: 'invalid_batch', problems, bytes, text, payload });
  return relay(text);
};

const ROUTES = {
  OPTIONS: () => reply(204),
  POST: forward,
};

export default {
  fetch: (request, env, ctx) => {
    if (new URL(request.url).pathname !== PATH) return reply(404);
    return (ROUTES[request.method] ?? (() => reply(405)))(request, ctx);
  },
};

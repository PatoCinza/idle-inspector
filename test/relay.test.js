import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import relay from '../relay/worker.js';
import { POSTHOG, batchOf } from '../src/posthog.js';

const UPSTREAM = 'https://us.i.posthog.com/batch/';
const PROJECT_KEY = POSTHOG.key;
const ORIGIN = 'https://blp-vega.example.workers.dev';
const PATH = '/v1/punk';
const MAX_BYTES = 1_000_000;
const MAX_EVENTS = 500;

const realFetch = globalThis.fetch;
let calls = [];
let pending = [];
let upstreamFails = false;

beforeEach(() => {
  calls = [];
  pending = [];
  upstreamFails = false;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (upstreamFails) throw new TypeError('network');
    return new Response('{"status":"Ok"}', { status: 200 });
  };
});

afterEach(() => { globalThis.fetch = realFetch; });

const ctx = { waitUntil: (promise) => pending.push(promise) };
const settled = () => Promise.all(pending);
const call = (request) => relay.fetch(request, {}, ctx);

const validBody = (events = [{ event: 'blp_usage', properties: { tabs: {} } }]) => batchOf({ events, installId: 'install-1', version: '0.1.0', now: 0 });

const withEvent = (change) => {
  const body = validBody();
  body.batch[0] = change(body.batch[0]);
  return body;
};

const post = (body, { path = PATH, headers = {} } = {}) => call(new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain', 'X-Forwarded-For': '203.0.113.7', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));

const request = (method, path = PATH) => call(new Request(`${ORIGIN}${path}`, { method }));

const rejections = () => calls.map(({ body }) => body.batch[0]).filter(({ event }) => event === 'blp_relay_rejected');

test('repassa o lote do projeto para o PostHog sem cabeçalhos do jogador', async () => {
  const body = validBody();
  const response = await post(body);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"status":"Ok"}');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, UPSTREAM);
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(calls[0].body, body);
});

test('aceita os eventos que a extensão monta', async () => {
  const events = ['blp_usage', 'blp_hunt_window', 'blp_drop_sample'].map((event) => ({ event, properties: {} }));
  assert.equal((await post(validBody(events))).status, 200);
});

test('responde 502 com CORS quando o PostHog não responde', async () => {
  upstreamFails = true;
  const response = await post(validBody());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('recusa outro projeto, corpo inválido, outro caminho e outro método sem registrar nada', async () => {
  assert.equal((await post({ ...validBody(), api_key: 'phc_outro' })).status, 403);
  assert.equal((await post('não é json')).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post(`{"api_key":"phc_outro","x":"${'x'.repeat(MAX_BYTES)}"}`)).status, 413);
  assert.equal((await post(validBody(), { path: '/e' })).status, 404);
  assert.equal((await request('GET')).status, 405);
  await settled();
  assert.equal(calls.length, 0);
});

test('lote grande do projeto é recusado e registrado com a instalação e a versão', async () => {
  const body = validBody([{ event: 'blp_hunt_window', properties: { pad: 'é'.repeat(MAX_BYTES / 2) } }]);
  assert.equal((await post(body)).status, 413);
  await settled();
  const [rejected] = rejections();
  assert.equal(calls.length, 1);
  assert.equal(rejected.properties.reason, 'too_large');
  assert.equal(rejected.properties.distinct_id, 'install-1');
  assert.equal(rejected.properties.app_version, '0.1.0');
  assert.ok(rejected.properties.bytes > MAX_BYTES);
  assert.equal(rejected.properties.$process_person_profile, false);
  assert.equal(rejected.properties.$geoip_disable, true);
});

test('lote do projeto fora do formato é recusado e registrado com o motivo', async () => {
  const tooMany = validBody(Array.from({ length: MAX_EVENTS + 1 }, () => ({ event: 'blp_usage', properties: {} })));
  const cases = [
    [{ ...validBody(), batch: [] }, ['batch_empty']],
    [{ ...validBody(), batch: {} }, ['batch_not_array']],
    [tooMany, ['too_many_events']],
    [withEvent((item) => ({ ...item, event: '$pageview' })), ['event_name']],
    [withEvent((item) => ({ ...item, event: 'blp_' })), ['event_name']],
    [withEvent((item) => ({ ...item, event: 'BLP_USAGE' })), ['event_name']],
    [withEvent(({ timestamp, ...item }) => item), ['timestamp']],
    [withEvent((item) => ({ ...item, properties: null })), ['properties']],
    [withEvent((item) => ({ ...item, properties: { ...item.properties, distinct_id: 42 } })), ['distinct_id']],
    [withEvent((item) => ({ ...item, properties: { ...item.properties, $process_person_profile: true } })), ['person_profile']],
    [withEvent((item) => ({ ...item, properties: { ...item.properties, $geoip_disable: false } })), ['geoip']],
  ];
  const statuses = await Promise.all(cases.map(([body]) => post(body).then((response) => response.status)));
  assert.deepEqual(statuses, cases.map(() => 400));
  await settled();
  const logged = rejections();
  assert.equal(calls.length, cases.length);
  assert.deepEqual(logged.map(({ properties }) => properties.problems), cases.map(([, problems]) => problems));
  assert.ok(logged.every(({ properties }) => properties.reason === 'invalid_batch'));
  assert.deepEqual(logged[3].properties.event_names, { $pageview: 1 });
  assert.equal(logged[2].properties.events, MAX_EVENTS + 1);
});

test('preflight responde 204 com CORS em cache', async () => {
  const response = await request('OPTIONS');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Max-Age'), '86400');
});

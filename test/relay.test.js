import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import relay from '../relay/worker.js';
import { POSTHOG } from '../src/posthog.js';

const UPSTREAM = 'https://us.i.posthog.com/batch/';
const PROJECT_KEY = POSTHOG.key;
const PATH = '/e';
const MAX_BYTES = 1_000_000;

const realFetch = globalThis.fetch;
let calls = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('{"status":"Ok"}', { status: 200 });
  };
});

afterEach(() => { globalThis.fetch = realFetch; });

const post = (body, path = PATH) => relay.fetch(new Request(`https://blp-relay.example.workers.dev${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.7' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));

test('repassa o lote do projeto para o PostHog sem cabeçalhos do jogador', async () => {
  const body = { api_key: PROJECT_KEY, batch: [{ event: 'blp_usage', properties: { distinct_id: 'x' } }] };
  const response = await post(body);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"status":"Ok"}');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, UPSTREAM);
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
});

test('recusa outro projeto, corpo inválido, corpo grande, outro caminho e outro método', async () => {
  assert.equal((await post({ api_key: 'phc_outro', batch: [] })).status, 403);
  assert.equal((await post('não é json')).status, 403);
  assert.equal((await post('x'.repeat(MAX_BYTES + 1))).status, 413);
  assert.equal((await post({ api_key: PROJECT_KEY, batch: [] }, '/batch/')).status, 404);
  assert.equal((await relay.fetch(new Request(`https://r.workers.dev${PATH}`))).status, 405);
  assert.equal((await relay.fetch(new Request(`https://r.workers.dev${PATH}`, { method: 'OPTIONS' }))).status, 204);
  assert.equal(calls.length, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, STORAGE_KEY } from '../src/bridge.js';
import { TAG } from '../src/capture/protocol.js';
import { initialApp, reduceApp } from '../src/app-state.js';
import { windowOf } from '../src/session.js';

const MIN = 60000;

const fakeWindow = () => {
  const handlers = [];
  const win = { addEventListener: (type, handler) => type === 'message' && handlers.push(handler) };
  const post = (event, { source = win, tag = TAG } = {}) => handlers.forEach((h) => h({ source, data: { source: tag, event } }));
  return { win, post };
};

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, get: async (key) => data[key], set: async (items) => Object.assign(data, JSON.parse(JSON.stringify(items))) };
};

const snapshot = (t, troll, coins) => ({ type: 'snapshot', t, bestiary: { 'h:troll-cave': 0, troll }, loot: { 'gold coin': { n: coins, g: coins } } });
const setup = (storage = fakeStorage()) => {
  const { win, post } = fakeWindow();
  const bridge = createBridge({ win, storage, now: () => 0, schedule: (task) => task() });
  return { bridge, post, storage };
};

test('eventos do hook alimentam o estado e são persistidos', async () => {
  const { bridge, post, storage } = setup();
  await bridge.ready;
  post(snapshot(0, 10, 0));
  post(snapshot(6 * MIN, 70, 50));
  await bridge.flush();
  const window = windowOf(storage.data[STORAGE_KEY].session);
  assert.deepEqual(window.kills, { troll: 60 });
  assert.equal(window.minutes, 6);
});

test('eventos que chegam antes do storage carregar não se perdem', async () => {
  const { bridge, post } = setup();
  post(snapshot(0, 10, 0));
  post(snapshot(MIN, 15, 5));
  await bridge.ready;
  assert.deepEqual(windowOf(bridge.getState().session).kills, { troll: 5 });
});

test('mensagens de outra origem ou sem a tag são ignoradas', async () => {
  const { bridge, post } = setup();
  await bridge.ready;
  post(snapshot(0, 10, 0), { source: {} });
  post(snapshot(0, 10, 0), { tag: 'outra' });
  post({ type: 'party', members: [{ name: 'x', lootPct: 99 }], t: 0 });
  assert.equal(bridge.getState().session.last, null);
  assert.equal(bridge.getState().party, null);
});

test('reload: estado salvo volta e o tempo fora fica de fora da janela', async () => {
  const saved = [snapshot(0, 10, 0), snapshot(10 * MIN, 110, 100)].reduce(reduceApp, initialApp());
  const { bridge, post } = setup(fakeStorage({ [STORAGE_KEY]: saved }));
  await bridge.ready;
  post(snapshot(60 * MIN, 900, 800));
  post(snapshot(65 * MIN, 950, 850));
  const window = windowOf(bridge.getState().session);
  assert.equal(window.minutes, 15);
  assert.deepEqual(window.kills, { troll: 150 });
  assert.deepEqual(window.loot, { 'gold coin': 150 });
});

test('estado salvo de versão antiga é descartado', async () => {
  const { bridge } = setup(fakeStorage({ [STORAGE_KEY]: { v: 0, session: 'lixo' } }));
  await bridge.ready;
  assert.equal(bridge.getState().session.last, null);
});

test('falha ao gravar no storage não derruba o bridge', async () => {
  const storage = { ...fakeStorage(), set: async () => { throw new Error('quota'); } };
  const { bridge, post } = setup(storage);
  await bridge.ready;
  post(snapshot(0, 1, 0));
  await bridge.flush();
  assert.ok(bridge.getState().session.last);
});

test('dispatch aplica eventos internos como a party lida', async () => {
  const { bridge } = setup();
  await bridge.dispatch({ type: 'party', members: [{ name: 'Pato Mago', lootPct: 9.8 }] });
  assert.equal(bridge.getState().party.members[0].lootPct, 9.8);
});

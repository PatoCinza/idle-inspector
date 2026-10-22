import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REFRESH, renderedState, waitBeforeRender } from '../src/overlay/refresh.js';

const app = { session: {}, huntRates: {}, party: null, charmSlots: null, dropLog: {}, lootConfig: null, codex: {}, xpTrack: {}, xp: 0 };

test('primeira renderização ou troca de aba renderiza já', () => {
  assert.equal(waitBeforeRender({ tab: 'drops', app, last: null, now: 0 }), 0);
  const last = renderedState({ tab: 'drops', app, now: 0 });
  assert.equal(waitBeforeRender({ tab: 'codex', app, last, now: 1 }), 0);
});

test('sem mudança no que a aba lê, não renderiza de novo', () => {
  const last = renderedState({ tab: 'codex', app, now: 0 });
  assert.equal(waitBeforeRender({ tab: 'codex', app: { ...app, combat: {} }, last, now: 60000 }), null);
});

test('mudança no que a aba lê espera o intervalo da aba', () => {
  const last = renderedState({ tab: 'hunts', app, now: 0 });
  const next = { ...app, session: {} };
  assert.equal(waitBeforeRender({ tab: 'hunts', app: next, last, now: 4000 }), REFRESH.hunts.everyMs - 4000);
  assert.equal(waitBeforeRender({ tab: 'hunts', app: next, last, now: 20000 }), 0);
});

test('aba com relógio renderiza no intervalo mesmo sem dados novos', () => {
  const last = renderedState({ tab: 'xp', app, now: 0 });
  assert.equal(waitBeforeRender({ tab: 'xp', app, last, now: 300 }), REFRESH.xp.everyMs - 300);
});

test('toda aba do painel tem intervalo', () => {
  ['welcome', 'xp', 'hunts', 'drops', 'bestiary', 'codex', 'charms', 'rotation', 'check', 'sample']
    .forEach((tab) => assert.ok(REFRESH[tab].everyMs > 0, tab));
});

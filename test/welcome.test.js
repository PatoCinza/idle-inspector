import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWelcome, welcomeChecklist } from '../src/overlay/welcome-view.js';
import { initialApp } from '../src/app-state.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const emptyPlan = { live: { huntId: null, minutes: 0 } };

test('sem dados, todos os passos ficam pendentes e a leitura da party tem botão', () => {
  const checklist = welcomeChecklist({ dataset, app: initialApp(), plan: emptyPlan });
  assert.ok(checklist.every((item) => !item.done));
  const html = renderWelcome({ checklist });
  assert.match(html, /7 pendente\(s\)/);
  assert.match(html, /data-action="read-party"/);
});

test('com hunt, medição, party, charms, combate e Codex, tudo fica pronto', () => {
  const app = {
    ...initialApp(),
    session: { ...initialApp().session, last: { t: 0 } },
    party: { members: [{ name: 'x' }], readAt: Date.UTC(2026, 9, 1, 15) },
    charmSlots: {},
    combat: { members: { knight: { hits: 1, dealt: 1 } }, foes: {}, taken: {} },
    codex: { done: [], prog: {} },
  };
  const checklist = welcomeChecklist({ dataset, app, plan: { live: { huntId: 'infernalmdemon-cave', minutes: 3 } } });
  assert.ok(checklist.every((item) => item.done));
  assert.match(renderWelcome({ checklist }), /tudo pronto/);
});

test('explica cada aba com atalho e cada botão do painel', () => {
  const html = renderWelcome({ checklist: [] });
  ['drops', 'bestiary', 'codex', 'charms', 'sample'].forEach((tab) => assert.match(html, new RegExp(`data-tab="${tab}"`)));
  ['Ler party e charms', 'Dados', '▾', 'Planejar'].forEach((label) => assert.ok(html.includes(`<b>${label}</b>`), label));
});

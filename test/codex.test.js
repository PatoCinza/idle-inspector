import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codexTable } from '../src/codex.js';
import { renderCodex } from '../src/overlay/plans-view.js';
import { initialApp, reduceApp } from '../src/app-state.js';
import { createCapture } from '../src/capture/hook.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => dataset.codexHunts?.[h.id]?.length);
const base = dataset.codexHunts[hunt.id];
const rows = base.map((req) => ({ item: req.item, perHour: 10 }));

test('codex sem hunt não fica pronto', () => {
  assert.equal(codexTable({ dataset, hunt: null }).ready, false);
});

test('entradas usam o progresso salvo e o drops/h da tabela', () => {
  const entryId = `hunt-${hunt.id}`;
  const codex = { done: [], prog: { [entryId]: base.map(() => 1) } };
  const [first] = codexTable({ dataset, hunt, rows, codex }).entries;
  assert.equal(first.id, entryId);
  assert.equal(first.items[0].have, 1);
  assert.equal(first.items[0].perHour, 10);
  assert.equal(first.items[0].hours, (first.items[0].need - 1) / 10);
});

test('entrada concluída conta tudo como obtido', () => {
  const entryId = `hunt-${hunt.id}`;
  const [first] = codexTable({ dataset, hunt, rows, codex: { done: [entryId], prog: {} } }).entries;
  assert.ok(first.complete && first.items.every((i) => i.remaining === 0));
});

test('render avisa quando o progresso não foi lido e escapa o nome da hunt', () => {
  const table = codexTable({ dataset, hunt: { ...hunt, name: '<i>x</i>' }, rows });
  const html = renderCodex(table);
  assert.ok(html.includes('ainda não lido'));
  assert.ok(!html.includes('<i>x</i>'));
});

test('reducer guarda só o codex das hunts', () => {
  const app = reduceApp(initialApp(), { type: 'codex', codex: { done: ['hunt-a', 'other'], prog: { 'hunt-a': [1], skill: [2] } } });
  assert.deepEqual(app.codex, { done: ['hunt-a'], prog: { 'hunt-a': [1] } });
});

test('hook emite o evento codex quando o inventário chega', () => {
  const events = [];
  const capture = createCapture({ emit: (e) => events.push(e), now: () => 1 });
  const json = JSON.stringify({ gear: [], codex: { done: [], prog: {} } });
  const bytes = Uint8Array.from([14, ...new TextEncoder().encode(json)]);
  capture.incoming(bytes);
  assert.ok(events.some((e) => e.type === 'codex'));
});

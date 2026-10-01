import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codexTable, codexSection, chainProgress, bossChains, gearChains, huntChains } from '../src/codex.js';
import { bossCodex, gearCodex } from '../src/extract.js';
import { renderCodex, renderCodexSection, renderCodexNav } from '../src/overlay/plans-view.js';
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

test('reducer guarda o codex de hunts, bosses e sets', () => {
  const codex = { done: ['hunt-a', 'boss-ahau-1', 'set-leather-0', 'other'], prog: { 'hunt-a': [1], 'boss-ahau-2': [3], 'set-plate-1': [1, 0], skill: [2] } };
  const app = reduceApp(initialApp(), { type: 'codex', codex });
  assert.deepEqual(app.codex, {
    done: ['hunt-a', 'boss-ahau-1', 'set-leather-0'],
    prog: { 'hunt-a': [1], 'boss-ahau-2': [3], 'set-plate-1': [1, 0] },
  });
});

test('hook emite o evento codex quando o inventário chega', () => {
  const events = [];
  const capture = createCapture({ emit: (e) => events.push(e), now: () => 1 });
  const json = JSON.stringify({ gear: [], codex: { done: [], prog: {} } });
  const bytes = Uint8Array.from([14, ...new TextEncoder().encode(json)]);
  capture.incoming(bytes);
  assert.ok(events.some((e) => e.type === 'codex'));
});

const RARITIES = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário', 'Mítico'];

const bundleBosses = [
  { id: 'boss-ahau-2', cat: 'boss', monster: 'ahau', mname: 'Ahau', step: 1, el: 'energy', req: [{ item: 'amber', qty: 200 }, { item: 'bag you covet', qty: 3, anyOf: ['sanguine blade', 'sanguine legs'], tier: 1 }] },
  { id: 'boss-ahau-1', cat: 'boss', monster: 'ahau', mname: 'Ahau', step: 0, el: 'energy', req: [{ item: 'amber', qty: 100 }, { item: 'bag you covet', qty: 2, anyOf: ['sanguine blade', 'sanguine legs'], anyTier: true }] },
  { id: 'boss-ahau-3', cat: 'boss', monster: 'ahau', mname: 'Ahau', step: 2, el: 'energy', req: [{ item: 'amber', qty: 1000 }] },
  { id: 'boss-brokul-1', cat: 'boss', monster: 'brokul', mname: 'Brokul', step: 0, el: null, req: [{ item: 'deepling scales', qty: 50 }] },
  { id: 'boss-brokul-2', cat: 'boss', monster: 'brokul', mname: 'Brokul', step: 1, el: null, req: [{ item: 'deepling scales', qty: 100 }] },
  { id: 'boss-brokul-3', cat: 'boss', monster: 'brokul', mname: 'Brokul', step: 2, el: null, req: [{ item: 'deepling scales', qty: 500 }] },
];

const bundleGear = [
  { id: 'leather', name: 'Leather', pieces: ['leather helmet', 'leather armor'], base: { armorFlat: 0.2 } },
  { id: 'plate', name: 'Plate', pieces: ['steel helmet', 'plate armor'], base: { armorFlat: 0.5 } },
];

const codexData = { codexBosses: bossCodex(bundleBosses), codexGear: gearCodex(bundleGear), rarities: RARITIES };

test('extração agrupa o Codex de boss por monstro e ordena as etapas', () => {
  const [ahau] = codexData.codexBosses;
  assert.equal(ahau.name, 'Ahau');
  assert.deepEqual(ahau.steps.map((s) => s.id), ['boss-ahau-1', 'boss-ahau-2', 'boss-ahau-3']);
  assert.deepEqual(ahau.steps[1].req[1], { item: 'bag you covet', qty: 3, anyOf: ['sanguine blade', 'sanguine legs'], tier: 1 });
  assert.deepEqual(codexData.codexGear[0], { id: 'leather', name: 'Leather', pieces: ['leather helmet', 'leather armor'] });
});

test('sets de equipamento têm uma etapa por raridade, de Comum a Épico', () => {
  const [leather] = gearChains(codexData);
  assert.deepEqual(leather.steps.map((s) => [s.id, s.label]), [['set-leather-0', 'Comum'], ['set-leather-1', 'Incomum'], ['set-leather-2', 'Raro'], ['set-leather-3', 'Épico']]);
  assert.deepEqual(leather.steps[2].req, [{ item: 'leather helmet', qty: 1, tier: 2 }, { item: 'leather armor', qty: 1, tier: 2 }]);
});

test('etapa atual é a primeira não concluída, com o que já foi entregue', () => {
  const [ahau] = bossChains(codexData);
  const row = chainProgress(ahau, { done: ['boss-ahau-1'], prog: { 'boss-ahau-2': [50, 9] } });
  assert.equal(row.completed, 1);
  assert.equal(row.current.label, 'Troféu II');
  assert.deepEqual(row.current.items.map((i) => [i.have, i.remaining]), [[50, 150], [3, 0]]);
  assert.equal(row.current.progress, 53 / 203);
  assert.equal(chainProgress(ahau, { done: ['boss-ahau-1', 'boss-ahau-2', 'boss-ahau-3'], prog: {} }).current, null);
});

test('seção ordena em andamento primeiro, depois não iniciados e completos por último', () => {
  const codex = { done: ['set-plate-0', 'set-plate-1', 'set-plate-2', 'set-plate-3'], prog: { 'set-leather-0': [1, 0] } };
  const table = codexSection({ dataset: codexData, section: 'gear', codex });
  assert.deepEqual(table.rows.map((r) => r.name), ['Leather', 'Plate']);
  assert.equal(table.started, 1);
  assert.equal(table.complete, 1);
  const bosses = codexSection({ dataset: codexData, section: 'boss', codex: { done: [], prog: { 'boss-brokul-1': [10] } } });
  assert.deepEqual(bosses.rows.map((r) => r.name), ['Brokul', 'Ahau']);
});

test('render da seção lista o que falta com raridade e quantidade, e escapa nomes', () => {
  const data = { ...codexData, codexBosses: bossCodex([{ ...bundleBosses[1], mname: '<b>Ahau</b>' }]) };
  const html = renderCodexSection(codexSection({ dataset: data, section: 'boss', codex: { done: [], prog: { 'boss-ahau-1': [40] } } }), RARITIES);
  assert.match(html, /amber ×60/);
  assert.match(html, /bag you covet \(qualquer raridade, 2 opções\) ×2/);
  assert.ok(!html.includes('<b>Ahau</b>'));
  const gear = renderCodexSection(codexSection({ dataset: codexData, section: 'gear', codex: null }), RARITIES);
  assert.match(gear, /ainda não lido/);
  assert.match(gear, /leather helmet \(Comum\)/);
});

test('sem dados extraídos a seção pede para rodar o extract', () => {
  const html = renderCodexSection(codexSection({ dataset: {}, section: 'boss', codex: null }), RARITIES);
  assert.match(html, /npm run extract/);
});

test('navegação do Codex marca a seção ativa', () => {
  const html = renderCodexNav('boss');
  assert.match(html, /class="tab active" data-codex="boss">Bosses/);
  assert.match(html, /data-codex="gear">Equipamento/);
});

test('linha fica em destaque quando a hunt escolhida dropa um item que falta', () => {
  const hunt = dataset.hunts.find((h) => h.id === 'troll-cave');
  const trollItem = dataset.monsters.troll.loot.find((entry) => entry.name !== 'gold coin').name;
  const data = {
    ...codexData,
    codexBosses: bossCodex([
      { id: 'boss-a-1', monster: 'a', mname: 'A', step: 0, req: [{ item: 'amber', qty: 10 }, { item: 'grupo', qty: 1, anyOf: ['nada', trollItem] }] },
      { id: 'boss-b-1', monster: 'b', mname: 'B', step: 0, req: [{ item: 'amber', qty: 10 }] },
    ]),
  };
  const table = codexSection({ dataset: { ...dataset, ...data }, section: 'boss', codex: { done: [], prog: {} }, hunt });
  assert.deepEqual(table.rows.map((r) => [r.name, r.deliverable]), [['A', true], ['B', false]]);
  assert.equal(table.deliverable, 1);
  const html = renderCodexSection(table, RARITIES);
  assert.match(html, /<tr class="deliverable">/);
  assert.match(html, /<b class="drop">grupo \(2 opções\) ×1<\/b>/);
  assert.match(html, /1 com itens que Troll Cave dropa/);
  const delivered = codexSection({ dataset: { ...dataset, ...data }, section: 'boss', codex: { done: [], prog: { 'boss-a-1': [0, 1] } }, hunt });
  assert.equal(delivered.rows.find((r) => r.name === 'A').deliverable, false);
});

test('seção Hunts lista o domínio de todas as hunts com Codex', () => {
  const table = codexSection({ dataset, section: 'hunt', codex: null, hunt });
  assert.equal(table.rows.length, Object.values(dataset.codexHunts).filter((list) => list.length).length);
  const own = table.rows.find((r) => r.key === hunt.id);
  assert.equal(own.current.label, 'Domínio I');
  assert.ok(own.deliverable);
  assert.equal(table.rows[0].deliverable, true);
});

test('Codex de hunts ordena pelas mais completas, com as concluídas no fim', () => {
  const [a, b, c] = huntChains(dataset).slice(0, 3);
  const codex = {
    done: [a.steps[0].id, a.steps[1].id, a.steps[2].id, b.steps[0].id],
    prog: { [c.steps[0].id]: c.steps[0].req.map((r) => r.qty) },
  };
  const rows = codexSection({ dataset, section: 'hunt', codex, hunt: null }).rows;
  assert.deepEqual(rows.slice(0, 2).map((r) => r.key), [c.key, b.key]);
  assert.equal(rows.at(-1).key, a.key);
});

test('itens que faltam mostram primeiro os que a hunt escolhida dropa', () => {
  const data = { ...dataset, codexBosses: bossCodex([{ id: 'boss-a-1', monster: 'a', mname: 'A', step: 0, req: [{ item: 'amber', qty: 10 }, { item: 'fish', qty: 5 }] }]) };
  const html = renderCodexSection(codexSection({ dataset: data, section: 'boss', codex: null, hunt }), RARITIES);
  assert.ok(html.indexOf('fish ×5') < html.indexOf('amber ×10'));
});

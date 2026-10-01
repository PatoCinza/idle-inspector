import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropsTable } from '../src/drops.js';
import { renderBody, sortRows, nextSort, escapeHtml, DEFAULT_SORT } from '../src/overlay/view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const session = JSON.parse(readFileSync(new URL('./fixtures/rotten-golem-session.json', import.meta.url)));
const window = {
  huntId: 'rottengolem-cave',
  minutes: session.minutes,
  kills: session.kills,
  rooms: 41,
  loot: session.observed,
  since: { reason: 'analyzer', t: Date.UTC(2026, 8, 30, 15, 4) },
};
const party = session.lootPcts.map((lootPct, i) => ({ name: `p${i}`, lootPct }));
const iconUrl = (id) => `chrome-extension://x/img/items/${id}.png`;
const render = (overrides = {}) => renderBody({ table: dropsTable({ dataset, window, party }), window, iconUrl, dataVersion: 'v1', ...overrides });

test('tabela mostra as sete colunas e uma linha por item', () => {
  const html = render();
  ['Item', 'Criaturas', 'Chance/kill', 'Drops/h', 'Valor/h', '1 a cada', 'Caiu'].forEach((label) => assert.ok(html.includes(`>${label}`), label));
  assert.ok(html.includes('crystal coin'));
  assert.ok((html.match(/<tr>/g) ?? []).length > 10);
});

test('ícone aponta para o arquivo empacotado e cai num placeholder sem id', () => {
  assert.ok(render().includes(`img/items/${dataset.itemIds['crystal coin']}.png`));
  assert.ok(render({ iconUrl: () => null }).includes('icon empty'));
});

test('texto vindo dos dados é escapado', () => {
  assert.equal(escapeHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
  const table = dropsTable({ dataset, window, party });
  const hostile = { ...table, rows: [{ ...table.rows[0], item: '<script>alert(1)</script>' }] };
  assert.ok(!renderBody({ table: hostile, window, iconUrl }).includes('<script>'));
});

test('ordenação alterna o sentido ao clicar de novo e respeita o padrão da coluna', () => {
  assert.deepEqual(nextSort(DEFAULT_SORT, 'valuePerHour'), { key: 'valuePerHour', dir: 1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'item'), { key: 'item', dir: 1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'everyHours'), { key: 'everyHours', dir: 1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'creatures'), DEFAULT_SORT);
});

test('linhas sem valor ou sem previsão ficam sempre no fim', () => {
  const rows = [{ valuePerHour: null }, { valuePerHour: 5 }, { valuePerHour: 9 }];
  assert.deepEqual(sortRows(rows, { key: 'valuePerHour', dir: -1 }).map((r) => r.valuePerHour), [9, 5, null]);
  assert.deepEqual(sortRows(rows, { key: 'valuePerHour', dir: 1 }).map((r) => r.valuePerHour), [5, 9, null]);
});

test('aviso de party não lida aparece só quando falta a leitura', () => {
  assert.ok(!render().includes('Bônus de loot da party não lido'));
  assert.ok(render({ table: dropsTable({ dataset, window, party: null }) }).includes('Bônus de loot da party não lido'));
});

test('sem dados suficientes mostra o motivo em vez da tabela', () => {
  const empty = { huntId: null, minutes: 0, kills: {}, rooms: 0, loot: {}, since: null };
  assert.ok(renderBody({ table: dropsTable({ dataset, window: empty }), window: empty, iconUrl }).includes('Aguardando dados'));
  const short = { ...window, minutes: 0.5 };
  const html = renderBody({ table: dropsTable({ dataset, window: short, party }), window: short, iconUrl });
  assert.ok(html.includes('Medindo'));
  assert.ok(!html.includes('<table>'));
});

test('status mostra hunt, minutos medidos, kills e desde quando', () => {
  const html = render();
  assert.ok(html.includes('Rotten Golem'));
  assert.ok(html.includes('Hunt Analyzer zerado'));
});

test('aviso da última leitura aparece e é escapado', () => {
  const html = render({ notice: { ok: false, message: 'Falhou <b>tudo</b>' } });
  assert.ok(html.includes('class="notice warn"'));
  assert.ok(html.includes('Falhou &lt;b&gt;tudo&lt;/b&gt;'));
  assert.ok(render({ notice: { ok: true, message: 'ok' } }).includes('class="notice ok"'));
  assert.ok(!render().includes('class="notice'));
});

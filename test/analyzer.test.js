import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClock, charmStatsFrom, readCharmAnalyzer } from '../src/dom/analyzer.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const idOf = (name) => dataset.charms.find((c) => c.name === name).id;

const rows = [
  { name: 'Freeze', procs: '3', value: '7.084' },
  { name: 'Adrenaline Burst', procs: '0', value: '—' },
  { name: 'Savage Blow', procs: '—', value: '3.199' },
  { name: 'Charm Desconhecido', procs: '1', value: '10' },
];

test('relógio da sessão vira milissegundos', () => {
  assert.equal(parseClock('00:02:30'), 150000);
  assert.equal(parseClock('1:00:00'), 3600000);
  assert.equal(parseClock('—'), 0);
});

test('linhas viram procs e dano por id de charm, ignorando nomes desconhecidos e traços', () => {
  assert.deepEqual(charmStatsFrom(dataset, { clock: '00:15:00', rows }), {
    ms: 900000,
    rows: [
      { id: idOf('Freeze'), n: 3, v: 7084 },
      { id: idOf('Adrenaline Burst'), n: 0, v: 0 },
      { id: idOf('Savage Blow'), n: 0, v: 3199 },
    ],
  });
});

const element = (text, children = {}) => ({ textContent: text, querySelector: (selector) => children[selector] ?? null });

test('lê o painel do jogo pelo DOM e devolve null quando ele não existe', () => {
  const row = (name, procs, value) => element('', {
    '.charman-name': element(name), '.charman-procs': element(procs), '.charman-value': element(value),
  });
  const panel = {
    querySelector: (selector) => (selector === '#charman-session' ? element('00:10:00') : null),
    querySelectorAll: () => [row('Freeze', '3', '7.084')],
  };
  const doc = { getElementById: (id) => (id === 'panel-charman' ? panel : null) };
  assert.deepEqual(readCharmAnalyzer({ doc, dataset }), { ms: 600000, rows: [{ id: idOf('Freeze'), n: 3, v: 7084 }] });
  assert.equal(readCharmAnalyzer({ doc: { getElementById: () => null }, dataset }), null);
});

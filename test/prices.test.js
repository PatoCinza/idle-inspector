import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceTables, itemValue } from '../src/extract.js';
import { unitValue } from '../src/model.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));

const bundle = 'const Ab={"magic sword":5e3,coal:0},Bc={coal:20,"darklight core":4100},Cd={"rusted shield":30};for(const e of n){Ce[e]={value:a?.value||Ab[e]||Bc[e]||Cd[e]||0,color:"#fff"}}';

test('preço segue a cadeia do cliente: valor do item, depois cada tabela na ordem, pulando zero', () => {
  const valueOf = itemValue({ 'crystal coin': { value: 1e4 } }, priceTables(bundle));
  assert.equal(valueOf('crystal coin'), 1e4);
  assert.equal(valueOf('magic sword'), 5e3);
  assert.equal(valueOf('coal'), 20);
  assert.equal(valueOf('darklight core'), 4100);
  assert.equal(valueOf('rusted shield'), 30);
  assert.equal(valueOf('nada'), null);
});

test('sem a cadeia de valores no bundle a extração falha alto', () => {
  assert.throws(() => priceTables('const x={}'), /tabelas de preço/);
});

test('loot da Wandering Pillar com os preços extraídos bate com o Gold value do Loot Analyser (16/10, 1.230 kills)', () => {
  const observed = { 'crystal coin': 753, 'darklight core': 1230, 'white gem': 291, 'basalt core': 327, 'red gem': 939, 'basalt crumbs': 579, 'blue gem': 291, 'dark obsidian splinter': 301, 'magma coat': 111, 'zaoan armor': 82, 'green gem': 855, 'lightning legs': 44, 'focus cape': 64, 'amber staff': 47, 'zaoan shoes': 75, 'fire sword': 78, 'yellow gem': 311, 'wand of starstorm': 79, 'ultimate health potion': 840, 'onyx chip': 496, 'ultimate mana potion': 893, 'magma amulet': 126, 'magma clump': 327, 'small emerald': 608, 'small ruby': 577, 'magma boots': 52, 'small topaz': 536, 'sulphurous stone': 327, 'might ring': 68, coal: 793, 'darklight obsidian axe': 1230, 'darklight heart': 3 };
  const total = Object.entries(observed).reduce((sum, [item, n]) => sum + n * unitValue(dataset, item), 0);
  assert.equal(total, 31623510);
});

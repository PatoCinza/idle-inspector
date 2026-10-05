import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { elementOf, toSpell, spellRange, spellAverage, hookSpells } from '../src/spells.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));

test('elemento vem das palavras da magia', () => {
  assert.equal(elementOf('exevo mort ora'), 'death');
  assert.equal(elementOf('exevo gran mas tera'), 'earth');
  assert.equal(elementOf('utori pox'), 'earth');
  assert.equal(elementOf('adori mas vis'), 'energy');
  assert.equal(elementOf('exori amp kor'), 'physical');
  assert.equal(elementOf('exevo mas san'), 'holy');
});

test('fórmula linear de level e magic level vira coeficientes; a de skill fica nula', () => {
  const echo = toSpell({ words: 'exevo mort ora', name: 'Death Echo', vocs: ['sorcerer'], level: 120, mana: 155, cd: 6000, type: 'area', radius: 2, echo: { delayMs: 2000 }, dmg: (e, t) => [e / 5 + t * 2.2 + 8, e / 5 + t * 4 + 16] });
  assert.deepEqual(echo.formula, { min: [0.2, 2.2, 8], max: [0.2, 4, 16] });
  assert.equal(echo.echoMs, 2000);
  assert.equal(echo.element, 'death');
  const winter = toSpell({ words: 'exevo gran mas frigo', dmg: (e, t) => [(e / 3.1 + t * 12) * 1.25, (e / 3.1 + t * 16) * 1.25] });
  assert.deepEqual(winter.formula, { min: [0.403226, 15, 0], max: [0.403226, 20, 0] });
  assert.equal(toSpell({ words: 'exori amp kor', dmg: (e, t, a, n) => [a * n, e + t] }).formula, null);
  assert.equal(toSpell({ words: 'x', dmg: (e, t) => [e * t, e] }).formula, null);
  assert.equal(toSpell({ words: 'x', dmg: (e, t) => missing(e, t) }).formula, null);
});

test('faixa e média da magia pelo level e magic level do personagem', () => {
  const echo = dataset.spells.find((spell) => spell.words === 'exevo mort ora');
  assert.deepEqual(spellRange(echo, { level: 1000, magicLevel: 100 }).map(Math.round), [428, 616]);
  assert.equal(spellAverage(echo, { level: 1000, magicLevel: 100 }), 522);
  assert.equal(spellAverage(echo, { level: 1000 }), null);
});

test('game.json traz as magias de ataque e o hook recebe só o necessário', () => {
  const words = dataset.spells.map((spell) => spell.words);
  ['exevo mort ora', 'adori mas vis', 'exevo fur frigo', 'exori amp kor', 'exevo gran mas frigo'].forEach((w) => assert.ok(words.includes(w), w));
  assert.ok(dataset.spells.every((spell) => spell.type !== 'heal'));
  const slim = JSON.parse(readFileSync(new URL('../data/spells.json', import.meta.url)));
  assert.equal(slim.version, dataset.version);
  assert.deepEqual(slim.spells, hookSpells(dataset.spells));
});

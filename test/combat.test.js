import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combatFromLog, mergeCombat, withCombat, dealtPerHour, MIN_CRIT_HITS } from '../src/combat.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'bloatedmanmaggot-cave');

const dealt = (voc, amount, crit = false, name = 'Bloated Man-Maggot') => ({ k: 'dealt', voc, foe: { kind: 'mob', name }, amount, el: 'ice', crit, fatal: false, killed: false });

const log = [
  dealt('druid', 20000, true),
  dealt('druid', 10000),
  dealt('knight', 7, false, 'Oozing Corpus'),
  { k: 'taken', voc: 'knight', foe: { kind: 'mob', name: 'Oozing Corpus' }, el: 'earth', mana: 0, hp: 3114, crit: false },
  { k: 'potion', voc: 'druid', amount: 800, mana: true },
  { k: 'healOther', voc: 'druid', target: 'PatoCinza', amount: 2072 },
];

test('combatlog soma só o dano causado, por vocação e por criatura', () => {
  assert.deepEqual(combatFromLog(log), {
    members: { druid: { hits: 2, dealt: 30000, crits: 1, critDealt: 20000 }, knight: { hits: 1, dealt: 7, crits: 0, critDealt: 0 } },
    foes: { 'Bloated Man-Maggot': 30000, 'Oozing Corpus': 7 },
  });
  assert.deepEqual(combatFromLog(undefined), { members: {}, foes: {} });
});

test('mergeCombat acumula lotes', () => {
  const a = combatFromLog(log);
  const merged = mergeCombat(a, combatFromLog([dealt('sorcerer', 500, true), dealt('druid', 1000)]));
  assert.deepEqual(merged.members.druid, { hits: 3, dealt: 31000, crits: 1, critDealt: 20000 });
  assert.deepEqual(merged.members.sorcerer, { hits: 1, dealt: 500, crits: 1, critDealt: 500 });
  assert.equal(merged.foes['Bloated Man-Maggot'], 31500);
  assert.deepEqual(mergeCombat(null, a), a);
});

test('withCombat preenche dano, golpe médio e fração do dano em crítico; crítico só com golpes suficientes', () => {
  const many = combatFromLog(Array.from({ length: MIN_CRIT_HITS }, (_, i) => dealt('druid', i % 3 === 0 ? 300 : 100, i % 3 === 0)));
  const party = [{ name: 'Pato Druida', vocation: 'druid' }, { name: 'PatoCinza', vocation: 'knight' }];
  assert.deepEqual(withCombat(party, many)[0], { name: 'Pato Druida', vocation: 'druid', hits: 30, dealt: 5000, avgHit: 167, critShare: 60 });
  assert.deepEqual(withCombat(party, many)[1], party[1]);
  assert.equal(withCombat(party, combatFromLog(log))[0].critShare, undefined);
  assert.equal(withCombat(party, null), party);
  assert.equal(withCombat(null, many), null);
});

test('duas vocações iguais dividem o dano medido', () => {
  const party = [{ name: 'a', vocation: 'knight' }, { name: 'b', vocation: 'knight' }];
  const [a, b] = withCombat(party, combatFromLog([dealt('knight', 100), dealt('knight', 300)]));
  assert.equal(a.dealt, 200);
  assert.equal(b.hits, 1);
});

test('dealtPerHour mapeia o nome da criatura, junta o boss na criatura dele e ignora o que não é da hunt', () => {
  const combat = combatFromLog([dealt('druid', 600), dealt('druid', 100, false, 'Bloated Man-Maggot Boss'), dealt('druid', 300, false, 'Oozing Corpus'), dealt('druid', 999, false, 'Dragon Lord')]);
  assert.deepEqual(dealtPerHour({ dataset, hunt, combat, minutes: 30 }), { bloated_man_maggot: 1400, oozing_corpus: 600 });
  assert.equal(dealtPerHour({ dataset, hunt, combat, minutes: 0 }), null);
  assert.equal(dealtPerHour({ dataset, hunt, combat: null, minutes: 30 }), null);
});

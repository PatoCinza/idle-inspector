import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { charmTable } from '../src/charm-plan.js';
import { renderCharms } from '../src/overlay/plans-view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'bloatedmanmaggot-cave');
const idOf = (key) => dataset.charms.find((c) => c.key === key).id;
const kills = Object.fromEntries(hunt.monsters.map((key) => [key, 600]));
const window = { huntId: hunt.id, minutes: 30, kills, rooms: 100, loot: {}, since: null };
const member = { name: 'm', level: 900, maxHp: 5000, maxMana: 30000, critChance: 25, critDmg: 150, lootPct: 5 };
const party = [member, { ...member, name: 'k' }, { ...member, name: 'd' }];
const slots = {
  [idOf('freeze')]: { tier: 3, monsterKey: hunt.monsters[0] },
  [idOf('divine_wrath')]: { tier: 3 },
  [idOf('gut')]: { tier: 3, monsterKey: hunt.monsters[1] },
  [idOf('scavenge')]: { tier: 3 },
};
const base = { dataset, window, party, charmSlots: slots, charmStats: null, bestiary: null };

test('sem party, sem charms ou sem janela o plano diz o que falta', () => {
  assert.equal(charmTable({ ...base, party: null }).reason, 'party');
  assert.equal(charmTable({ ...base, charmSlots: null }).reason, 'charms');
  assert.equal(charmTable({ ...base, window: { ...window, minutes: 1 } }).reason, 'window');
  assert.equal(charmTable({ ...base, window: { ...window, huntId: null, kills: {} } }).reason, 'hunt');
});

test('plano tem uma linha por criatura, usa os charms que o jogador tem e marca o equipado', () => {
  const table = charmTable(base);
  assert.ok(table.ready);
  assert.deepEqual(table.rows.map((r) => r.monster).sort(), [...new Set([...hunt.monsters, hunt.bossKey])].sort());
  const majors = table.rows.map((r) => r.majorName).filter(Boolean);
  assert.ok(majors.every((name) => ['Freeze', 'Divine Wrath'].includes(name)));
  assert.deepEqual(table.rows.find((r) => r.monster === hunt.monsters[0]).equipped, ['Freeze']);
  assert.ok(table.lootPlans.length > 0);
});

test('bestiário incompleto bloqueia o major da criatura', () => {
  const key = hunt.monsters[0];
  const row = charmTable({ ...base, bestiary: { [key]: 1 } }).rows.find((r) => r.monster === key);
  assert.equal(row.major, null);
  assert.ok(row.locked.remaining > 0);
});

test('dano medido dos charms entra na calibração e tira o aviso de golpe estimado', () => {
  const stats = { ms: 1800000, rows: [{ id: idOf('freeze'), n: 120, v: 900000 }] };
  const table = charmTable({ ...base, charmStats: stats });
  assert.equal(table.measuredCharms, 1);
  assert.equal(table.estimatedHit, false);
  assert.equal(charmTable(base).estimatedHit, true);
});

test('render escapa nomes e mostra a mensagem de bloqueio', () => {
  assert.ok(renderCharms({ ready: false, reason: 'party' }).includes('Ler party e charms'));
  const table = charmTable(base);
  const html = renderCharms({ ...table, rows: [{ ...table.rows[0], name: '<b>x</b>' }] });
  assert.ok(!html.includes('<b>x</b>'));
});

test('tempo em avatar medido entra no plano e aparece no resumo', () => {
  const procs = { ms: 60000, avatar: [{ name: 'm', vocation: 'sorcerer', ms: 30000 }] };
  const without = charmTable(base);
  const withProcs = charmTable({ ...base, procs });
  assert.deepEqual(withProcs.members.map((m) => m.avatarUptime), [50, null, null]);
  assert.match(renderCharms(withProcs), /m · avatar 50%/);
  assert.match(renderCharms(without), /Combate ainda não medido/);
});

test('avatar medido aumenta o ganho previsto do Savage Blow', () => {
  const procs = { ms: 60000, avatar: party.map(({ name }) => ({ name, ms: 30000 })) };
  const charmSlots = { ...slots, [idOf('savage_blow')]: { tier: 3 } };
  const without = charmTable({ ...base, charmSlots });
  const withProcs = charmTable({ ...base, charmSlots, procs });
  assert.ok(withProcs.damageTotal > without.damageTotal);
});

test('combate medido entra no plano: fração de dano, golpe, crítico e dano por criatura', () => {
  const party3 = [{ ...member, name: 'm', vocation: 'sorcerer' }, { ...member, name: 'k', vocation: 'knight' }, { ...member, name: 'd', vocation: 'druid' }];
  const combat = {
    members: { sorcerer: { hits: 100, dealt: 600000, crits: 60, critDealt: 480000 }, knight: { hits: 100, dealt: 100000, crits: 10, critDealt: 25000 }, druid: { hits: 100, dealt: 300000, crits: 40, critDealt: 180000 } },
    foes: { [dataset.monsters[hunt.monsters[0]].name]: 900000, [dataset.monsters[hunt.monsters[1]].name]: 100000 },
  };
  const table = charmTable({ ...base, party: party3, combat });
  assert.deepEqual(table.members.map((m) => [m.name, m.share, m.avgHit, m.critShare]), [['m', 0.6, 6000, 80], ['k', 0.1, 1000, 25], ['d', 0.3, 3000, 60]]);
  assert.ok(table.damageMeasured);
  assert.equal(table.estimatedHit, false);
  const weight = (key) => table.rows.find((r) => r.monster === key).weight;
  assert.ok(weight(hunt.monsters[0]) > weight(hunt.monsters[1]));
  assert.match(renderCharms(table), /m · 60% do dano · golpe 6\.000 · 80% do dano em crítico · avatar —/);
  assert.match(renderCharms(table), /medido no combate/);
});

test('Scavenge medido aparece ao lado do previsto pelo modelo de loot', () => {
  const stats = { ms: 3600000, rows: [{ id: idOf('scavenge'), n: 0, v: 500000 }] };
  const table = charmTable({ ...base, charmSlots: { ...slots, [idOf('scavenge')]: { tier: 3, monsterKey: hunt.monsters[0] } }, charmStats: stats });
  assert.equal(table.scavenge.monster, dataset.monsters[hunt.monsters[0]].name);
  assert.equal(table.scavenge.measured, 500000);
  assert.ok(table.scavenge.predicted > 0);
  assert.match(renderCharms(table), /Scavenge em .+: medido .+\/h · previsto .+\/h/);
  assert.equal(charmTable(base).scavenge, null);
});

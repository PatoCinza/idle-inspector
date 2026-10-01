import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEvents, emptyUsage, countUsage, initialCursor, anonymousMember, batchOf, POSTHOG } from '../src/telemetry.js';
import { initialApp, reduceApp } from '../src/app-state.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const MIN = 60000;
const idOf = (key) => dataset.charms.find((c) => c.key === key).id;
const gutId = idOf('gut');

const loot = (counts) => Object.fromEntries(Object.entries(counts).map(([item, n]) => [item, { n, g: n }]));
const snapshot = (t, kills, counts, supply = null) => ({ type: 'snapshot', t, bestiary: { 'h:infernalmdemon-cave': 0, ...kills }, loot: loot(counts), supply });
const members = [
  { name: 'PatoCinza', vocation: 'knight', level: 972, lootPct: 0, critChance: 10, critDmg: 50 },
  { name: 'Pato Druida', vocation: 'druid', level: 951, lootPct: 9.8 },
  { name: 'Pato Mago', vocation: 'sorcerer', level: 956, lootPct: 4 },
];

const hunting = () => [
  { type: 'party', t: 0, members },
  { type: 'charms', t: 0, slots: { [gutId]: { tier: 3, monsterKey: 'infernal_phantom' }, [idOf('savage_blow')]: { tier: 3, monsterKey: 'infernal_demon' }, [idOf('parry')]: { tier: 3, monsterKey: 'infernal_phantom' } } },
  snapshot(0, { infernal_phantom: 10 }, { 'crystal coin': 0 }),
  snapshot(MIN, { infernal_phantom: 11 }, { 'crystal coin': 1, 'ultimate health potion': 3 }),
  { type: 'combat', t: MIN, combat: { members: { knight: { hits: 10, dealt: 5000, crits: 2, critDealt: 2000 } }, foes: { 'Infernal Phantom': 5000 }, taken: { 'Infernal Phantom': { knight: { hits: 3, hp: 900, mana: 0 } } } } },
  { type: 'xp', t: MIN, xp: 36000 },
  { type: 'phase', t: MIN, ms: 41000 },
  snapshot(3 * MIN, { infernal_phantom: 30 }, { 'crystal coin': 20, 'ultimate health potion': 50 }, { 'ultimate mana potion': { n: 10, g: 4880 } }),
].reduce((app, event) => reduceApp(app, event, { dataset }), initialApp());

test('evento da hunt não leva nomes e arredonda o level', () => {
  const { events } = buildEvents({ dataset, app: hunting() });
  const json = JSON.stringify(events);
  members.forEach(({ name }) => assert.ok(!json.includes(name), name));
  const window = events.find((e) => e.event === 'blp_hunt_window').properties;
  assert.equal(window.hunt, 'infernalmdemon-cave');
  assert.deepEqual(window.party.map((m) => m.level_bucket), [950, 950, 950]);
  const charms = Object.fromEntries(window.charms.map((c) => [c.charm, c]));
  assert.deepEqual(charms.gut, { charm: 'gut', tier: 3, monster: 'infernal_phantom' });
  assert.ok(charms.savage_blow.predicted_creature_gain > 0);
  assert.ok(Math.abs(charms.parry.predicted_avoided_per_hour - (0.11 * 900 * 20) / 0.89) < 1);
  assert.ok(window.loot_value_observed_per_hour > 0 && window.loot_value_predicted_per_hour > 0);
  assert.deepEqual(window.phase_ms, [41000]);
  assert.deepEqual(window.phase_charms, ['gut,parry,savage_blow']);
  assert.equal(window.loot_observed['crystal coin'], 20);
  assert.ok(window.loot_predicted['crystal coin'] > 0);
  assert.equal(window.taken_per_hour.infernal_phantom, 900 * 20);
  assert.equal(window.supply_per_hour['ultimate mana potion'], 4880 * 20);
  assert.equal(window.data_version, dataset.version);
});

test('janela só é reenviada quando a medição avança um minuto, e a amostra de drops vai em deltas', () => {
  const app = hunting();
  const first = buildEvents({ dataset, app });
  const drop = first.events.find((e) => e.event === 'blp_drop_sample').properties;
  assert.equal(drop.monster, 'infernal_phantom');
  assert.equal(drop.kills, 1);
  assert.deepEqual(drop.items['ultimate health potion'], { drops: 1, qty: { 3: 1 }, chance_predicted: 1, quantity_predicted: 2.5, max: 4 });
  assert.equal(drop.items['terra rod'].drops, 0);
  assert.equal(drop.items['terra rod'].chance_predicted, 1);
  const tableSize = dataset.monsters.infernal_phantom.loot.length;
  assert.equal(Object.keys(drop.items).length, tableSize);
  assert.deepEqual(buildEvents({ dataset, app, cursor: first.cursor }).events, []);
  const later = [
    snapshot(4 * MIN, { infernal_phantom: 31 }, { 'crystal coin': 21, 'ultimate health potion': 52 }),
  ].reduce((state, event) => reduceApp(state, event, { dataset }), app);
  const next = buildEvents({ dataset, app: later, cursor: first.cursor });
  assert.deepEqual(next.events.map((e) => e.event).sort(), ['blp_drop_sample', 'blp_hunt_window']);
  const nextPotion = next.events.find((e) => e.event === 'blp_drop_sample').properties.items['ultimate health potion'];
  assert.deepEqual([nextPotion.drops, nextPotion.qty], [1, { 2: 1 }]);
});

test('uso da extensão é somado e enviado num evento só', () => {
  const usage = [{ type: 'tab', tab: 'charms' }, { type: 'tab', tab: 'charms' }, { type: 'readParty' }, { type: 'planner' }, { type: 'nada' }].reduce(countUsage, emptyUsage());
  const { events } = buildEvents({ dataset, app: null, cursor: initialCursor(), usage });
  assert.deepEqual(events, [{ event: 'blp_usage', properties: { tabs: { charms: 2 }, planner_changes: 1, read_party: 1, objective_changes: 0, options_opened: 0, data_version: dataset.version } }]);
  assert.deepEqual(buildEvents({ dataset, app: null, usage: emptyUsage() }).events, []);
});

test('membro anônimo só tem campos de jogo', () => {
  assert.deepEqual(Object.keys(anonymousMember({ name: 'x', vocation: 'druid', level: 49 })).includes('name'), false);
  assert.equal(anonymousMember({ level: 49 }).level_bucket, 0);
});

test('lote do PostHog é anônimo, sem perfil e sem GeoIP', () => {
  const body = batchOf({ events: [{ event: 'blp_usage', properties: { tabs: {} } }], installId: 'abc', version: '0.2.0', now: Date.UTC(2026, 9, 1) });
  assert.equal(body.api_key, POSTHOG.key);
  assert.deepEqual(body.batch[0].properties, { tabs: {}, distinct_id: 'abc', $process_person_profile: false, $geoip_disable: true, $lib: 'baiak-loot-planner', app_version: '0.2.0' });
  assert.equal(body.batch[0].timestamp, '2026-10-01T00:00:00.000Z');
});

test('cada sala leva os charms equipados quando ela terminou, para o A/B', () => {
  const adrenalineId = idOf('adrenaline_burst');
  const app = [
    { type: 'charms', t: 0, slots: { [adrenalineId]: { tier: 3, monsterKey: 'infernal_phantom' } } },
    snapshot(0, { infernal_phantom: 1 }, { 'crystal coin': 0 }),
    { type: 'phase', t: MIN, ms: 40000 },
    { type: 'charms', t: MIN, slots: { [adrenalineId]: { tier: 3, monsterKey: null } } },
    { type: 'phase', t: 2 * MIN, ms: 43000 },
    snapshot(3 * MIN, { infernal_phantom: 9 }, { 'crystal coin': 8 }),
  ].reduce((state, event) => reduceApp(state, event, { dataset }), initialApp());
  const withLegacy = { ...app, phases: [39000, ...app.phases] };
  const window = buildEvents({ dataset, app: withLegacy }).events.find((e) => e.event === 'blp_hunt_window').properties;
  assert.deepEqual(window.phase_ms, [39000, 40000, 43000]);
  assert.deepEqual(window.phase_charms, [null, 'adrenaline_burst', '']);
});

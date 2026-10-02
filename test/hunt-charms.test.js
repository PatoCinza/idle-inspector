import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEvents } from '../src/telemetry.js';
import { initialApp, reduceApp } from '../src/app-state.js';
import { isHuntCreature } from '../src/model.js';
import { blockStats, splitBlock } from '../src/experiment.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const MIN = 60000;
const HUNT = 'infernalmdemon-cave';
const idOf = (key) => dataset.charms.find((c) => c.key === key).id;
const ADRENALINE = idOf('adrenaline_burst');
const GUT = idOf('gut');

const snapshot = (t, kills) => ({ type: 'snapshot', t, bestiary: { [`h:${HUNT}`]: 0, ...kills }, loot: { 'crystal coin': { n: t / MIN, g: t / MIN } } });
const charms = (t, adrenaline) => ({ type: 'charms', t, slots: { [GUT]: { tier: 3, monsterKey: 'infernal_phantom' }, [ADRENALINE]: { tier: 3, monsterKey: adrenaline } } });
const phase = (t) => ({ type: 'phase', t, ms: 40000 });

const huntWindow = (events) => {
  const app = [snapshot(0, { infernal_phantom: 1 }), ...events, snapshot(5 * MIN, { infernal_phantom: 20 })]
    .reduce((state, event) => reduceApp(state, event, { dataset }), initialApp());
  return buildEvents({ dataset, app }).events.find((e) => e.event === 'blp_hunt_window').properties;
};

const adrenalineIn = (window) => window.charms.find((c) => c.charm === 'adrenaline_burst');

test('criaturas da hunt incluem o boss, mesmo quando ele não está na lista de monstros', () => {
  assert.ok(isHuntCreature(dataset, HUNT)('infernal_demon'));
  assert.ok(isHuntCreature(dataset, 'thalassara-surroundings')('moonspawn_juggernaut'));
  assert.equal(isHuntCreature(dataset, HUNT)('troll'), false);
});

test('Adrenaline numa criatura da hunt conta na sala', () => {
  const window = huntWindow([charms(0, 'infernal_phantom'), phase(MIN)]);
  assert.deepEqual(window.phase_charms, ['adrenaline_burst,gut']);
  assert.equal(adrenalineIn(window).in_hunt, true);
  assert.equal(window.phase_charms_scope, 'hunt');
});

test('Adrenaline no boss da sala conta na sala', () => {
  assert.deepEqual(huntWindow([charms(0, 'infernal_demon'), phase(MIN)]).phase_charms, ['adrenaline_burst,gut']);
});

test('Adrenaline numa criatura de outra hunt não conta na sala, mas continua listada na janela', () => {
  const window = huntWindow([charms(0, 'troll'), phase(MIN)]);
  assert.deepEqual(window.phase_charms, ['gut']);
  assert.deepEqual(adrenalineIn(window), { charm: 'adrenaline_burst', tier: 3, monster: 'troll', in_hunt: false });
});

test('Adrenaline trocada no meio da janela vale por sala', () => {
  const window = huntWindow([charms(0, 'infernal_phantom'), phase(MIN), charms(MIN, 'troll'), phase(2 * MIN), charms(2 * MIN, null), phase(3 * MIN)]);
  assert.deepEqual(window.phase_charms, ['adrenaline_burst,gut', 'gut', 'gut']);
});

test('sem Adrenaline a sala fica no grupo sem', () => {
  const window = huntWindow([{ type: 'charms', t: 0, slots: { [GUT]: { tier: 3, monsterKey: 'infernal_phantom' } } }, phase(MIN)]);
  assert.deepEqual(window.phase_charms, ['gut']);
  assert.equal(adrenalineIn(window), undefined);
});

test('salas gravadas no formato antigo, sem a criatura de cada charm, ficam sem grupo', () => {
  const app = [snapshot(0, { infernal_phantom: 1 }), charms(0, 'troll'), snapshot(5 * MIN, { infernal_phantom: 20 })]
    .reduce((state, event) => reduceApp(state, event, { dataset }), initialApp());
  const legacy = { ...app, phases: [{ ms: 40000, charms: [ADRENALINE, GUT] }] };
  const window = buildEvents({ dataset, app: legacy }).events.find((e) => e.event === 'blp_hunt_window').properties;
  assert.deepEqual(window.phase_charms, [null]);
});

const ROOM_MS = 30000;
const block = ({ rooms, charms: marks, label = null }) => {
  const times = Array.from({ length: rooms }, (_, i) => (i + 1) * ROOM_MS);
  return {
    v: 6,
    label,
    signature: marks.at(-1)[1],
    huntId: HUNT,
    minutes: (rooms * ROOM_MS + 1000) / MIN,
    rooms,
    kills: { infernal_phantom: rooms * 10 },
    timeline: {
      waves: times.map((t) => [t - 100, 3, 3]),
      engages: [],
      idle: [],
      rooms: times.map((t) => [t, 1]),
      kills: times.map((t) => [t - 100, 10]),
      phases: times.map((t) => [t - 100, ROOM_MS - 200]),
      charms: marks,
    },
  };
};

const keep = isHuntCreature(dataset, HUNT);
const sig = (...parts) => parts.sort().join(',');
const inside = sig(`${ADRENALINE}>infernal_phantom`, `${GUT}>infernal_phantom`);
const outside = sig(`${ADRENALINE}>troll`, `${GUT}>infernal_phantom`);
const absent = sig(`${GUT}>infernal_phantom`);

test('signature do bloco só tem charms em criaturas da hunt', () => {
  assert.equal(blockStats(block({ rooms: 10, charms: [[0, inside]] }), keep).signature, inside);
  assert.equal(blockStats(block({ rooms: 10, charms: [[0, outside]] }), keep).signature, absent);
  assert.equal(blockStats(block({ rooms: 10, charms: [[0, absent]] }), keep).signature, absent);
});

test('mexer num charm fora da hunt não divide nem marca o bloco como misto', () => {
  const payload = block({ rooms: 10, charms: [[0, outside], [5 * ROOM_MS + 5000, sig(`${ADRENALINE}>orc`, `${GUT}>infernal_phantom`)]] });
  assert.equal(blockStats(payload, keep).mixedCharms, false);
  assert.equal(splitBlock(payload, keep).length, 1);
});

test('Adrenaline trocada no meio do bloco divide as salas pela signature de cada trecho', () => {
  const payload = block({ rooms: 10, label: 'A', charms: [[0, inside], [5 * ROOM_MS + 5000, outside]] });
  assert.equal(blockStats(payload, keep).mixedCharms, true);
  const parts = splitBlock(payload, keep);
  assert.deepEqual(parts.map((p) => p.signature), [inside, absent]);
  assert.deepEqual(parts.map((p) => p.label), ['A', 'A']);
  assert.deepEqual(parts.map((p) => p.roomTimes.length), [4, 4]);
  assert.deepEqual(parts.map((p) => p.phaseTimes.length), [5, 4]);
  assert.deepEqual(parts.map((p) => p.kills), [50, 50]);
});

test('troca que dura menos que uma sala é ignorada', () => {
  const payload = block({ rooms: 10, charms: [[0, inside], [3 * ROOM_MS + 1000, absent], [3 * ROOM_MS + 5000, inside]] });
  const parts = splitBlock(payload, keep);
  assert.deepEqual(parts.map((p) => p.signature), [inside]);
  assert.equal(parts[0].roomTimes.length, 9);
});

test('o tempo antes do primeiro charm visto fica com a primeira signature que durou uma sala', () => {
  const payload = block({ rooms: 10, charms: [[4 * ROOM_MS + 1000, absent], [4 * ROOM_MS + 5000, inside]] });
  const parts = splitBlock(payload, keep);
  assert.deepEqual(parts.map((p) => p.signature), [inside]);
  assert.equal(parts[0].roomTimes.length, 9);
});

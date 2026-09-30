import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockStats, compareGroups, engageDelays, groupBlocks, idleTime, phaseDurations, pool, roomDurations, signatureDiff, tCritical, verdict, waveGaps, withoutPauses,
} from '../src/experiment.js';
import { decodePayload } from '../src/payload.js';

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const WAVES = 3;

const syntheticBlock = ({ seed, rooms, speed = 1, label, signature }) => {
  const random = mulberry32(seed);
  const jitter = (ms) => ms * speed * (0.9 + 0.2 * random());
  const timeline = { waves: [], engages: [], rooms: [], kills: [], charms: [[0, signature]] };
  let t = 0;
  for (let room = 0; room < rooms; room++) {
    const roomStart = t;
    for (let n = 1; n <= WAVES; n++) {
      t += jitter(n === 1 ? 4000 : 1500);
      timeline.engages.push(t);
      t += jitter(8000);
      timeline.kills.push([t, 4]);
      timeline.waves.push([t, n, WAVES]);
    }
    timeline.phases = [...(timeline.phases ?? []), [t, Math.round(t - roomStart)]];
    t += 200;
    timeline.rooms.push([t, 1]);
  }
  return {
    v: 4,
    label,
    signature,
    huntId: 'infernalmdemon-cave',
    minutes: t / 60000,
    rooms,
    kills: { infernal_demon: rooms * WAVES * 4 },
    timeline,
  };
};

const encode = (payload) => `BLP1.${Buffer.from(JSON.stringify(payload)).toString('base64')}`;

test('room durations come from consecutive room events', () => {
  assert.deepEqual(roomDurations({ rooms: [[1000, 1], [4000, 1], [9000, 1]] }), [3000, 5000]);
});

test('wave gaps and engage delays are split at room boundaries', () => {
  const timeline = { waves: [[1000, 1, 10], [3000, 2, 10], [7000, 1, 10]], rooms: [[3500, 1]], engages: [1400, 3900, 7100] };
  assert.deepEqual(waveGaps(timeline), [{ ms: 2000, crossesRoom: false }, { ms: 4000, crossesRoom: true }]);
  assert.deepEqual(engageDelays(timeline), [
    { ms: 400, crossesRoom: false },
    { ms: 900, crossesRoom: true },
    { ms: 100, crossesRoom: false },
  ]);
});

test('an engage is only paired with the wave right before it', () => {
  assert.deepEqual(engageDelays({ waves: [[1000, 1, 3], [2000, 2, 3]], engages: [2500] }), [{ ms: 500, crossesRoom: false }]);
});

test('phase durations come from the game timer and skip voided runs', () => {
  assert.deepEqual(phaseDurations({ phases: [[1000, 9500], [2000, 0], [3000, 9700]] }), [9500, 9700]);
});

test('idle time is split between waves and inside a wave', () => {
  const timeline = { waves: [[10000, 1, 10]], idle: [[12000, 4000], [20000, 3000], [30000, 1800], [90000, 30000]] };
  assert.deepEqual(idleTime(timeline), { total: 7000, betweenWaves: 4000, measured: true });
});

test('long rooms are dropped as pauses', () => {
  assert.deepEqual(withoutPauses([10, 11, 9, 12, 60]), { kept: [10, 11, 9, 12], dropped: 1 });
});

test('t critical value shrinks toward 1.96', () => {
  assert.equal(tCritical(1), 12.71);
  assert.ok(Math.abs(tCritical(7) - 2.38) < 0.01);
  assert.equal(tCritical(1e6), 1.96);
});

test('verdict compares the interval with both break-evens', () => {
  const breakEven = [0.006, 0.019];
  assert.equal(verdict({ low: 0.02, high: 0.04 }, breakEven), 'compensa');
  assert.equal(verdict({ low: -0.02, high: 0.004 }, breakEven), 'não compensa');
  assert.equal(verdict({ low: 0.01, high: 0.03 }, breakEven), 'compensa se a hunt for limitada por movimento');
  assert.equal(verdict({ low: 0, high: 0.03 }, breakEven), 'inconclusivo');
});

test('ABAB blocks recover a 3% faster room time', () => {
  const base = 'burst>infernal_phantom,freeze>brachiodemon';
  const faster = 'burst>infernal_demon,freeze>brachiodemon';
  const payloads = [
    syntheticBlock({ seed: 1, rooms: 150, label: 'A', signature: base }),
    syntheticBlock({ seed: 2, rooms: 150, speed: 0.97, label: 'B', signature: faster }),
    syntheticBlock({ seed: 3, rooms: 150, label: 'A', signature: base }),
    syntheticBlock({ seed: 4, rooms: 150, speed: 0.97, label: 'B', signature: faster }),
  ];
  const blocks = payloads.map((p) => blockStats(decodePayload(encode(p))));
  const groups = groupBlocks(blocks, (b) => b.label);
  const result = compareGroups(pool(groups.A), pool(groups.B), [0.006, 0.019]);

  assert.ok(Math.abs(result.rooms.change - 1 / 0.97 + 1) < 0.01, `room change ${result.rooms.change}`);
  assert.ok(result.rooms.low > 0.019);
  assert.equal(result.verdict, 'compensa');
  assert.ok(Math.abs(result.phases.change - 1 / 0.97 + 1) < 0.01, `phase change ${result.phases.change}`);
  assert.ok(result.engageTransition.diff < 0);
  assert.equal(pool(groups.A).roomTimes.length, 298);
});

test('signature diff lists what moved', () => {
  assert.deepEqual(signatureDiff('1>a,2>b', '1>a,2>c'), { removed: ['2>b'], added: ['2>c'] });
});

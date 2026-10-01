import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procsFromStats, avatarUptime, withAvatar } from '../src/avatar.js';

const procstats = {
  ms: 60000,
  party: 3,
  rows: [
    { k: 'momentum', n: 5, v: 13283, by: [{ name: 'Pato Mago', vocation: 'sorcerer', n: 4, v: 12891 }] },
    {
      k: 'transcendence',
      n: 6,
      v: 90000,
      by: [
        { name: 'Pato Mago', vocation: 'sorcerer', n: 2, v: 30000, c: 5.13 },
        { name: 'PatoCinza', vocation: 'knight', n: 1, v: 15000, c: 5.13 },
        { name: 'Pato Druida', vocation: 'druid', n: 3 },
      ],
    },
  ],
};

test('procstats vira o tempo em avatar de cada membro', () => {
  assert.deepEqual(procsFromStats(procstats), {
    ms: 60000,
    avatar: [
      { name: 'Pato Mago', vocation: 'sorcerer', ms: 30000 },
      { name: 'PatoCinza', vocation: 'knight', ms: 15000 },
      { name: 'Pato Druida', vocation: 'druid', ms: 45000 },
    ],
  });
});

test('procstats sem tempo ou sem Transcendence não gera medição', () => {
  assert.equal(procsFromStats({ ...procstats, ms: 0 }), null);
  assert.equal(procsFromStats({ ms: 1000, rows: [procstats.rows[0]] }), null);
  assert.equal(procsFromStats(undefined), null);
});

test('uptime é o tempo em avatar sobre o tempo do Proc Analyzer, limitado a 100%', () => {
  const procs = procsFromStats(procstats);
  assert.equal(avatarUptime(procs, { name: 'Pato Mago' }), 50);
  assert.equal(avatarUptime(procs, { name: 'PatoCinza' }), 25);
  assert.equal(avatarUptime({ ms: 10000, avatar: [{ name: 'a', ms: 30000 }] }, { name: 'a' }), 100);
});

test('membro sem nome igual cai na vocação; sem medição fica indefinido', () => {
  const procs = procsFromStats(procstats);
  assert.equal(avatarUptime(procs, { name: 'Outro', vocation: 'druid' }), 75);
  assert.equal(avatarUptime(procs, { name: 'Outro', vocation: 'paladin' }), undefined);
  assert.equal(avatarUptime(null, { name: 'Pato Mago' }), undefined);
});

test('withAvatar preenche avatarUptime sem apagar o que já foi lido', () => {
  const procs = procsFromStats(procstats);
  const party = [{ name: 'Pato Mago', level: 900 }, { name: 'Sem Dados', avatarUptime: 7 }];
  assert.deepEqual(withAvatar(party, procs), [{ name: 'Pato Mago', level: 900, avatarUptime: 50 }, { name: 'Sem Dados', avatarUptime: 7 }]);
  assert.equal(withAvatar(null, procs), null);
  assert.equal(withAvatar(party, null)[0].avatarUptime, undefined);
});

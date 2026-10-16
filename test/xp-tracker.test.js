import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXpTip, parseMemberCard } from '../src/dom/party-xp.js';
import { expForLevel, totalXp, reduceXpTrack, xpAnalysis, initialXpTrack, RECENT_ROOMS } from '../src/xp-tracker.js';
import { renderXp } from '../src/overlay/xp-view.js';

const card = (name, line, tip, dead = false) => parseMemberCard({ text: `DPS\n${name}\n${line}\n7.373/7.373\n45.622/47.104\n93%\n2\n4`, tip, dead });

test('cartão da party vira nome, vocação, level e XP que falta', () => {
  assert.deepEqual(card('Pato Mago', 'Sorcerer · lvl 1299', 'Experiência 93% — Faltam 5.239.395 XP para o nível 1300'), {
    name: 'Pato Mago', vocation: 'sorcerer', level: 1299, left: 5239395, dead: false,
  });
  assert.equal(card('PatoCinza', 'Knight · lvl 1194', 'Experiência 48% — Faltam 36.876.120 XP para o nível 1195', true).dead, true);
  assert.equal(parseMemberCard({ text: 'Pato\nSorcerer · lvl 10', tip: 'sem número' }), null);
  assert.deepEqual(parseXpTip('Experience 10% — 1.234 XP to level 20'), { left: 1234, nextLevel: 20 });
});

test('a curva de level é a do Tibia e bate com a XP total do painel de status', () => {
  assert.ok(expForLevel(1300) <= 36450339199 && 36450339199 < expForLevel(1301));
  assert.ok(expForLevel(1194) <= 28230145915 && 28230145915 < expForLevel(1195));
  assert.ok(expForLevel(1205) <= 29022268251 && 29022268251 < expForLevel(1206));
  assert.equal(totalXp({ level: 1299, left: 5239395 }), expForLevel(1300) - 5239395);
});

const party = (lefts, levels = [1299, 1194, 1205], dead = [false, false, false]) => [
  { name: 'Pato Mago', vocation: 'sorcerer', level: levels[0], left: lefts[0], dead: dead[0] },
  { name: 'PatoCinza', vocation: 'knight', level: levels[1], left: lefts[1], dead: dead[1] },
  { name: 'Pato Druida', vocation: 'druid', level: levels[2], left: lefts[2], dead: dead[2] },
];

test('XP creditada numa sala é a diferença das barras antes e depois (sala real de 16/10)', () => {
  const before = reduceXpTrack(initialXpTrack(), { members: party([5239395, 19559951, 18970798]), room: true, t: 0 }, 0);
  const after = reduceXpTrack(before, { members: party([2669803, 17856428, 17020552]), room: true, t: 100000 }, 6223361);
  const analysis = xpAnalysis({ track: after, pendingTeamXp: 0, now: 100000 });
  assert.equal(analysis.ready, true);
  assert.equal(analysis.rooms, 1);
  assert.equal(analysis.team.perRoom, 6223361);
  const [ms, ek, ed] = analysis.members;
  assert.equal(Math.round(ms.sessionPerHour / 36), 2569592);
  assert.equal(Math.round(ek.sessionPerHour / 36), 1703523);
  assert.equal(Math.round(ed.sessionPerHour / 36), 1950246);
  assert.equal(analysis.team.sessionPerHour, 6223361 * 36);
});

const ROOM_MS = 100000;
const perRoom = [2.5e6, 1.7e6, 1.9e6];

const rooms = (count, { deadAt = null } = {}) => Array.from({ length: count + 1 }, (_, i) => i).reduce((track, i) => {
  const xp = [expForLevel(1300) + 1e6, expForLevel(1194) + 1e6, expForLevel(1205) + 1e6].map((base, m) => base + perRoom[m] * i);
  const members = party(xp.map((total, m) => expForLevel([1300, 1194, 1205][m] + 1) - total), [1300, 1194, 1205], [false, deadAt === i, false]);
  return reduceXpTrack(track, { members, room: true, t: i * ROOM_MS }, i * 6.1e6);
}, initialXpTrack());

test('XP/h real da equipe e de cada um, parte, tempo para o level e XP ao vivo com a XP Stack', () => {
  const track = rooms(12, { deadAt: 5 });
  const now = 12 * ROOM_MS + 50000;
  const analysis = xpAnalysis({ track, pendingTeamXp: 3.05e6, now });
  assert.equal(analysis.rooms, 12);
  assert.equal(analysis.team.sessionPerHour, 6.1e6 * 36);
  assert.equal(analysis.team.recentPerHour, 6.1e6 * 36);
  const [ms, ek] = analysis.members;
  assert.equal(Math.round(ms.recentPerHour), 2.5e6 * 36);
  assert.equal(Math.round(ms.share * 1000), Math.round((2.5 / 6.1) * 1000));
  assert.equal(Math.round(ms.hoursToLevel * 1000), Math.round((ms.toLevel / (2.5e6 * 36)) * 1000));
  assert.equal(Math.round(analysis.team.livePerHour), Math.round(((6.1e6 * 12 + 3.05e6) * 3600000) / now));
  assert.equal(ek.deaths, 1);
  assert.equal(ms.deaths, 0);
});

test('com menos de 3 salas recentes o tempo para o level usa a sessão', () => {
  const analysis = xpAnalysis({ track: rooms(2), pendingTeamXp: 0, now: 2 * ROOM_MS });
  assert.equal(analysis.members[0].recentPerHour, null);
  assert.ok(analysis.members[0].hoursToLevel > 0);
});

test('leitura fora do fim de sala só atualiza o estado atual', () => {
  const track = rooms(1);
  const updated = reduceXpTrack(track, { members: party([1, 1, 1], [1300, 1194, 1205], [true, false, false]), room: false, t: 999 }, 0);
  assert.equal(updated.rooms.length, track.rooms.length);
  assert.equal(updated.current.members[0].dead, true);
  assert.equal(xpAnalysis({ track: updated, now: 1000 }).members[0].dead, true);
});

test('janela recente cobre as últimas salas', () => {
  const analysis = xpAnalysis({ track: rooms(RECENT_ROOMS + 5), now: (RECENT_ROOMS + 5) * ROOM_MS });
  assert.equal(analysis.rooms, RECENT_ROOMS + 5);
  assert.ok(analysis.team.recentPerHour > 0);
});

test('aba XP mostra a equipe, cada personagem, o próximo level e quem morreu', () => {
  const track = reduceXpTrack(rooms(12), { members: party([1, 1, 1], [1300, 1194, 1205], [true, false, false]), room: false, t: 12 * ROOM_MS + 1 }, 0);
  const html = renderXp(xpAnalysis({ track, pendingTeamXp: 1e6, now: 12 * ROOM_MS + 1000 }));
  assert.match(html, /Equipe: .* real/);
  assert.match(html, /últimas 10 salas/);
  assert.match(html, /Pato Mago/);
  assert.match(html, /pill bad">morto/);
  assert.match(html, /XP Stack/);
  assert.match(renderXp(xpAnalysis({ track: rooms(0), now: 1 })), /2 salas completas/);
  assert.match(renderXp(xpAnalysis({ track: null, now: 1 })), /Aguardando/);
});

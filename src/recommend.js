import { WAVE_SIZES, BOSS_EXP_MULT, monsterDamage, spawnShares } from './run.js';
import { creatures, huntLoot, totals } from './model.js';
import { MIN_MINUTES, rates, perHour, lootPcts } from './drops.js';
import { isEmptyCombat } from './combat.js';
import { charmsFromSlots } from './payload.js';
import { spellAverage } from './spells.js';

export const ELEMENTS = ['physical', 'energy', 'earth', 'fire', 'ice', 'holy', 'death'];
export const PARTY_XP_SHARES = { 1: [1], 2: [4 / 7, 3 / 7], 3: [0.4, 0.3, 0.3] };
export const PARTY_XP_FACTOR = 0.99;
export const MIN_REFERENCE_ROOMS = 2;
export const RISK = { caution: 1.25, risky: 2 };
export const OBJECTIVES = ['xp', 'profit'];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const huntById = (dataset, id) => dataset.hunts.find((hunt) => hunt.id === id) ?? null;
const clampPct = (pct) => Math.min(100, Math.max(-100, pct ?? 0));

export const elementMix = (elements = {}) => {
  const total = sum(Object.values(elements));
  return total > 0 ? Object.fromEntries(Object.entries(elements).map(([element, dealt]) => [element, dealt / total])) : {};
};

export const resistFactor = (monster, mix) => {
  const entries = Object.entries(mix);
  return entries.length ? sum(entries.map(([element, share]) => share * (1 - clampPct(monster?.resist?.[element]) / 100))) : 1;
};

export const roomOf = (dataset, hunt) => {
  const mobs = sum(WAVE_SIZES);
  const hpMult = dataset.bossWave?.hpMult ?? 1;
  return [
    ...spawnShares(hunt).map(([key, share]) => ({ key, kills: mobs * share, hp: dataset.monsters[key]?.hp ?? 0, boss: false })),
    ...(hunt.bossKey ? [{ key: hunt.bossKey, kills: 1, hp: (dataset.monsters[hunt.bossKey]?.hp ?? 0) * hpMult, boss: true }] : []),
  ];
};

export const roomHp = (dataset, hunt) => sum(roomOf(dataset, hunt).map((c) => c.kills * c.hp));

export const effectiveRoomHp = (dataset, hunt, mix) => sum(roomOf(dataset, hunt)
  .map((c) => (c.kills * c.hp) / Math.max(0.05, resistFactor(dataset.monsters[c.key], mix))));

export const roomKills = (dataset, hunt, roomsPerHour) => roomOf(dataset, hunt)
  .reduce((acc, c) => ({ ...acc, [c.key]: (acc[c.key] ?? 0) + c.kills * roomsPerHour }), {});

export const baseXp = (dataset, hunt, killsByMonster, rooms) => sum(Object.entries(killsByMonster).map(([key, kills]) => (dataset.monsters[key]?.exp ?? 0) * kills))
  + (hunt.bossKey ? (dataset.monsters[hunt.bossKey]?.exp ?? 0) * rooms * (BOSS_EXP_MULT - 1) : 0);

const dealtOf = (combat) => sum(Object.values(combat.members).map((member) => member.dealt ?? 0));
const takenOf = (combat) => sum(Object.values(combat.taken ?? {}).flatMap((byMember) => Object.values(byMember).map((s) => (s.hp ?? 0) + (s.mana ?? 0))));

export const referenceOf = ({ dataset, window, combat, xp = 0, t = null }) => {
  const hunt = huntById(dataset, window?.huntId);
  if (!hunt || window.minutes < MIN_MINUTES || window.rooms < MIN_REFERENCE_ROOMS || !combat || isEmptyCombat(combat)) return null;
  const seconds = window.minutes * 60;
  const mix = elementMix(combat.elements);
  const dps = dealtOf(combat) / seconds;
  const hp = roomHp(dataset, hunt);
  const rawDps = (dps * effectiveRoomHp(dataset, hunt, mix)) / hp;
  const roomSeconds = seconds / window.rooms;
  const base = baseXp(dataset, hunt, window.kills, window.rooms);
  return {
    huntId: hunt.id,
    minutes: window.minutes,
    rooms: window.rooms,
    roomSeconds,
    rawDps,
    overheadSeconds: Math.max(0, roomSeconds - hp / dps),
    mix,
    takenPerSecond: takenOf(combat) / seconds,
    xpFactor: xp > 0 && base > 0 ? xp / base : null,
    suppliesPerHour: perHour(sum(Object.values(window.supply ?? {})), window.minutes),
    t,
  };
};

export const partyXpFactor = (party) => {
  const shares = PARTY_XP_SHARES[party?.length];
  return shares && party.every((member) => member.xpPct != null)
    ? sum(party.map((member, i) => shares[i] * PARTY_XP_FACTOR * (1 + member.xpPct / 100)))
    : null;
};

const estimatedRooms = (dataset, hunt, reference) => {
  const refHunt = huntById(dataset, reference.huntId);
  const overhead = reference.overheadSeconds * ((hunt.spawnMs ?? 1) / (refHunt?.spawnMs ?? hunt.spawnMs ?? 1));
  return 3600 / (overhead + effectiveRoomHp(dataset, hunt, reference.mix) / reference.rawDps);
};

export const huntRates = ({ dataset, hunt, live, saved, reference }) => {
  if (live?.huntId === hunt.id && live.minutes >= MIN_MINUTES) {
    return { source: 'live', roomsPerHour: perHour(live.rooms, live.minutes), killsByMonster: rates(hunt, live), suppliesPerHour: perHour(sum(Object.values(live.supply ?? {})), live.minutes) };
  }
  if (saved) return { source: 'saved', roomsPerHour: saved.rooms, killsByMonster: saved.kills, suppliesPerHour: null };
  if (reference?.rawDps > 0) {
    const roomsPerHour = estimatedRooms(dataset, hunt, reference);
    return { source: 'estimated', roomsPerHour, killsByMonster: roomKills(dataset, hunt, roomsPerHour), suppliesPerHour: null };
  }
  return null;
};

const weightedResist = (dataset, hunt) => {
  const room = roomOf(dataset, hunt);
  const total = sum(room.map((c) => c.kills * c.hp)) || 1;
  return Object.fromEntries(ELEMENTS.map((element) => [element,
    sum(room.map((c) => ((c.kills * c.hp) / total) * clampPct(dataset.monsters[c.key]?.resist?.[element])))]));
};

export const castWords = (rotation) => Object.fromEntries(Object.entries(rotation?.members ?? {})
  .map(([vocation, periods]) => [vocation, new Set(Object.values(periods).flatMap((period) => Object.keys(period?.spells ?? {})))]));

const usableSpells = (dataset, member, cast) => (dataset.spells ?? [])
  .filter((spell) => spell.vocs.includes(member.vocation)
    && (member.level == null || (spell.level ?? 0) <= member.level)
    && (!spell.spec || cast[member.vocation]?.has(spell.words)));

const waveSpells = (spells) => {
  const area = spells.filter((spell) => spell.type === 'area');
  const pool = area.length ? area : spells;
  const spellsOnly = pool.filter((spell) => !spell.rune);
  return spellsOnly.length ? spellsOnly : pool;
};

const scoredSpell = (member, resist) => (spell) => ({
  spell,
  score: (spellAverage(spell, member) ?? 1) * (1 - resist[spell.element] / 100),
});

const byScore = (a, b) => b.score - a.score || (b.spell.level ?? 0) - (a.spell.level ?? 0);

const memberOffense = (dataset, resist, cast) => (member) => {
  const ranked = waveSpells(usableSpells(dataset, member, cast)).map(scoredSpell(member, resist)).sort(byScore);
  const element = ranked[0]?.spell.element ?? null;
  return {
    name: member.name ?? member.vocation,
    vocation: member.vocation,
    element,
    resist: element ? resist[element] : null,
    spells: ranked.slice(0, 3).map(({ spell }) => ({ name: spell.name, element: spell.element, resist: resist[spell.element] })),
  };
};

export const offenseOf = ({ dataset, hunt, members, mix, cast = {} }) => {
  const resist = weightedResist(dataset, hunt);
  const ranked = [...ELEMENTS].sort((a, b) => resist[a] - resist[b]);
  const current = Object.keys(mix ?? {}).length ? sum(Object.entries(mix).map(([element, share]) => share * (1 - resist[element] / 100))) : null;
  const best = 1 - resist[ranked[0]] / 100;
  return {
    resist,
    best: ranked.slice(0, 2).map((element) => ({ element, resist: resist[element] })),
    worst: ranked.at(-1) ? { element: ranked.at(-1), resist: resist[ranked.at(-1)] } : null,
    efficiency: current === null || best <= 0 ? null : current / best,
    members: members.map(memberOffense(dataset, resist, cast)),
  };
};

export const partyProtection = (party) => Object.fromEntries(ELEMENTS.map((element) => [element,
  party?.length ? sum(party.map((member) => clampPct(member.protection?.[element]))) / party.length : 0]));

const huntPressure = (dataset, hunt) => {
  const room = roomOf(dataset, hunt).filter((c) => !c.boss);
  const kills = sum(room.map((c) => c.kills)) || 1;
  const alive = hunt.maxAlive ?? 1;
  const byElement = room
    .flatMap((c) => Object.entries(monsterDamage(dataset.monsters[c.key]).byElement).map(([element, dps]) => [element, (dps * c.kills * alive) / kills]))
    .reduce((acc, [element, dps]) => ({ ...acc, [element]: (acc[element] ?? 0) + dps }), {});
  const creaturesDps = room.map((c) => ({ key: c.key, dps: (monsterDamage(dataset.monsters[c.key]).dps * c.kills * alive) / kills }));
  return { byElement, creaturesDps };
};

const mitigated = (byElement, protection) => sum(Object.entries(byElement).map(([element, dps]) => dps * (1 - (protection[element] ?? 0) / 100)));

const riskOf = (ratio) => {
  if (ratio === null) return null;
  if (ratio > RISK.risky) return 'risky';
  if (ratio > RISK.caution) return 'caution';
  return 'ok';
};

export const defenseOf = ({ dataset, hunt, protection, reference }) => {
  const pressure = huntPressure(dataset, hunt);
  const incoming = mitigated(pressure.byElement, protection);
  const refHunt = reference ? huntById(dataset, reference.huntId) : null;
  const refIncoming = refHunt ? mitigated(huntPressure(dataset, refHunt).byElement, protection) : 0;
  const ratio = refIncoming > 0 ? incoming / refIncoming : null;
  const scale = refIncoming > 0 && reference.takenPerSecond > 0 ? reference.takenPerSecond / refIncoming : null;
  const [worst] = Object.entries(pressure.byElement)
    .map(([element, dps]) => ({ element, dps: dps * (1 - (protection[element] ?? 0) / 100), protection: protection[element] ?? 0 }))
    .sort((a, b) => b.dps - a.dps);
  const [hitter] = [...pressure.creaturesDps].sort((a, b) => b.dps - a.dps);
  return {
    raw: sum(Object.values(pressure.byElement)),
    incoming,
    takenPerSecond: scale === null ? null : incoming * scale,
    ratio,
    risk: riskOf(ratio),
    worst: worst ? { ...worst, share: incoming > 0 ? worst.dps / incoming : 0 } : null,
    hitter: hitter ? { key: hitter.key, name: dataset.monsters[hitter.key]?.name ?? hitter.key } : null,
  };
};

const membersOf = (party, combat) => (party?.length
  ? party
  : Object.keys(combat?.members ?? {}).map((vocation) => ({ vocation })));

const partyLevel = (party) => {
  const levels = (party ?? []).map((member) => member.level).filter((level) => level > 0);
  return levels.length ? Math.min(...levels) : null;
};

const GROUP = { ok: 0, caution: 0, unknown: 1, risky: 2, unrated: 3 };

const groupOf = (row) => {
  if (!row.rates) return 'unrated';
  if (row.defense.risk === 'risky') return 'risky';
  return row.defense.risk ?? 'unknown';
};

const valueOf = (row, objective) => (objective === 'xp' ? row.xpPerHour : row.profitPerHour) ?? -Infinity;

export const rankHunts = (rows, objective) => [...rows].sort((a, b) => GROUP[a.group] - GROUP[b.group] || valueOf(b, objective) - valueOf(a, objective));

const liveXpFactor = (dataset, live, xp) => {
  const hunt = live && live.minutes >= MIN_MINUTES && xp > 0 ? huntById(dataset, live.huntId) : null;
  const base = hunt ? baseXp(dataset, hunt, live.kills, live.rooms) : 0;
  return base > 0 ? xp / base : null;
};

export const recommendHunts = ({ dataset, live = null, huntRates: saved = {}, reference = null, party = null, combat = null, rotation = null, charmSlots = null, quantities = {}, skipped = new Set(), objective = 'xp', liveXp = 0 }) => {
  const members = membersOf(party, combat);
  const cast = castWords(rotation);
  const measuredFactor = liveXpFactor(dataset, live, liveXp) ?? reference?.xpFactor ?? null;
  const xpFactor = measuredFactor ?? partyXpFactor(party);
  const xpSource = measuredFactor ? 'measured' : xpFactor ? 'party' : null;
  const protection = partyProtection(party);
  const assigned = charmSlots ? charmsFromSlots(dataset, charmSlots).assigned : {};
  const rows = dataset.hunts
    .filter((hunt) => (hunt.avail ?? 'on') === 'on')
    .map((hunt) => {
      const rates = huntRates({ dataset, hunt, live, saved: saved[hunt.id] ?? null, reference });
      const xpPerHour = rates ? baseXp(dataset, hunt, rates.killsByMonster, rates.roomsPerHour) * (xpFactor ?? 1) : null;
      const lootPerHour = rates
        ? totals(huntLoot({ dataset, hunt, killsByMonster: rates.killsByMonster, roomsPerHour: rates.roomsPerHour, lootPcts: lootPcts(party), charms: assigned, quantities, skipped })).total
        : null;
      const suppliesPerHour = rates ? rates.suppliesPerHour ?? reference?.suppliesPerHour ?? 0 : null;
      const row = {
        hunt,
        rates,
        xpPerHour,
        lootPerHour,
        suppliesPerHour,
        profitPerHour: rates ? lootPerHour - suppliesPerHour : null,
        offense: offenseOf({ dataset, hunt, members, mix: reference?.mix ?? null, cast }),
        defense: defenseOf({ dataset, hunt, protection, reference }),
        belowLevel: (partyLevel(party) ?? Infinity) < (hunt.minLevel ?? 0),
        current: live?.huntId === hunt.id,
        reference: reference?.huntId === hunt.id,
      };
      return { ...row, group: groupOf(row) };
    });
  return {
    objective,
    rows: rankHunts(rows, objective),
    xpFactor,
    xpSource,
    reference,
    referenceHunt: reference ? huntById(dataset, reference.huntId) : null,
    partyRead: Boolean(party?.length),
    protectionRead: Boolean(party?.some((member) => member.protection)),
  };
};

import { tCritical, throughputChange, withoutPauses, mean } from './experiment.js';
import { spellIndex, spellAverage } from './spells.js';
import { rotationOfRoom } from './rotation.js';

export const GCD_MS = 2000;
export const MIN_CASTS = 5;
export const MIN_HITS = 10;
export const MIN_ROOMS = 2;
const CRIT_BASE = 1.5;

export const VOCATION_LABEL = { knight: 'Knight', druid: 'Druid', sorcerer: 'Sorcerer', paladin: 'Paladin', monk: 'Monk' };
export const LOOSE_LABEL = { auto: 'Ataque básico', proc: 'Procs no tick do cast', other: 'Outros (procs e reflexo)' };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const castMoments = ({ casts = 0, dealt = 0, sq = 0 }) => {
  const avg = casts ? dealt / casts : NaN;
  return { n: casts, mean: avg, variance: casts > 1 ? Math.max(0, (sq - casts * avg ** 2) / (casts - 1)) : NaN };
};

export const meanInterval = ({ n, mean: avg, variance }) => {
  if (!(n > 1) || !Number.isFinite(variance)) return null;
  const half = tCritical(n - 1) * Math.sqrt(variance / n);
  return { low: avg - half, high: avg + half };
};

export const welchMoments = (base, test) => {
  if (!(base.n > 1) || !(test.n > 1)) return null;
  const va = base.variance / base.n;
  const vb = test.variance / test.n;
  const se = Math.sqrt(va + vb);
  const df = se ? (va + vb) ** 2 / (va ** 2 / (base.n - 1) + vb ** 2 / (test.n - 1)) : Infinity;
  const diff = test.mean - base.mean;
  const margin = tCritical(df) * se;
  return { diff, low: diff - margin, high: diff + margin };
};

export const monsterLookup = (dataset) => {
  const byName = Object.fromEntries(Object.values(dataset.monsters ?? {}).map((monster) => [monster.name.toLowerCase(), monster]));
  return (name) => byName[String(name ?? '').toLowerCase().replace(/\s+boss$/, '')] ?? null;
};

export const expectedRatio = ({ spell, member, normal = {}, monsterOf }) => {
  const base = spellAverage(spell, member);
  if (!base) return null;
  const perHit = base * (1 + (member.spellDmgPct ?? 0) / 100);
  const rows = Object.entries(normal)
    .map(([foe, stats]) => ({ ...stats, monster: monsterOf(foe) }))
    .filter((row) => row.monster && row.hits > 0)
    .map((row) => ({ ...row, expected: perHit * (1 - (row.monster.resist?.[spell.element] ?? 0) / 100) }));
  const hits = sum(rows.map((row) => row.hits));
  if (hits < MIN_HITS) return null;
  const expected = sum(rows.map((row) => row.hits * row.expected));
  const measured = sum(rows.map((row) => row.dealt));
  const ratio = measured / expected;
  const residual = sum(rows.map((row) => row.sq - 2 * ratio * row.expected * row.dealt + ratio ** 2 * row.expected ** 2 * row.hits));
  const half = 1.96 * Math.sqrt(Math.max(0, residual) * (hits / Math.max(1, hits - 1))) / expected;
  return { base: perHit, expectedPerHit: expected / hits, measuredPerHit: measured / hits, ratio, low: ratio - half, high: ratio + half, hits };
};

const normalTotals = (normal = {}) => Object.values(normal).reduce((acc, row) => ({ hits: acc.hits + row.hits, dealt: acc.dealt + row.dealt }), { hits: 0, dealt: 0 });

const critOf = (stats) => {
  const normal = normalTotals(stats.normal);
  const rate = stats.hits ? stats.crits / stats.hits : null;
  const multiplier = stats.crits && normal.hits ? (stats.critDealt / stats.crits) / (normal.dealt / normal.hits) : null;
  return { rate, multiplier };
};

const spellRow = ({ words, stats, spell, member, monsterOf, total, minutes }) => {
  const moments = castMoments(stats);
  return {
    words,
    name: spell?.name ?? words,
    rune: Boolean(spell?.rune),
    cd: spell?.cd ?? null,
    casts: stats.casts,
    perMinute: minutes > 0 ? stats.casts / minutes : null,
    perCast: moments.mean,
    interval: meanInterval(moments),
    hitsPerCast: stats.casts ? stats.hits / stats.casts : null,
    share: total ? stats.dealt / total : 0,
    echoShare: stats.echo && stats.dealt ? stats.echo / stats.dealt : null,
    crit: critOf(stats),
    expected: member && spell ? expectedRatio({ spell, member, normal: stats.normal, monsterOf }) : null,
    moments,
  };
};

const verdictOf = (interval) => {
  if (interval.low > 0) return 'more';
  if (interval.high < 0) return 'less';
  return 'tie';
};

export const fillerOf = (rows) => rows
  .filter((row) => row.cd !== null && row.cd <= GCD_MS && row.casts >= MIN_CASTS)
  .sort((a, b) => b.casts - a.casts)[0] ?? null;

const pairedMoments = (rooms, voc, words, other) => {
  const shared = rooms.filter((room) => room.spells?.[voc]?.[words] && room.spells[voc][other]);
  const total = (key) => shared.map((room) => room.spells[voc][key]).reduce(
    (acc, stats) => ({ casts: acc.casts + stats.casts, dealt: acc.dealt + stats.dealt, sq: acc.sq + stats.sq }),
    { casts: 0, dealt: 0, sq: 0 },
  );
  return { rooms: shared.length, spell: castMoments(total(words)), filler: castMoments(total(other)) };
};

const compareRow = ({ row, filler, rooms, voc }) => {
  const paired = pairedMoments(rooms, voc, row.words, filler.words);
  const usePaired = paired.spell.n >= MIN_CASTS && paired.filler.n >= MIN_CASTS;
  const base = usePaired ? paired.filler : filler.moments;
  const interval = welchMoments(base, usePaired ? paired.spell : row.moments);
  return interval && { name: row.name, words: row.words, ...interval, pct: interval.diff / base.mean, verdict: verdictOf(interval), rooms: usePaired ? paired.rooms : 0, fillerPerCast: base.mean };
};

const comparisons = (rows, rooms, voc) => {
  const filler = fillerOf(rows);
  if (!filler) return { filler: null, items: [] };
  const items = rows
    .filter((row) => row !== filler && row.cd !== null && row.cd > GCD_MS && row.casts >= MIN_CASTS)
    .map((row) => compareRow({ row, filler, rooms, voc }))
    .filter(Boolean);
  return { filler, items };
};

const looseRows = (loose = {}, total) => Object.entries(loose)
  .map(([source, stats]) => ({ source, label: LOOSE_LABEL[source] ?? source, hits: stats.hits, dealt: stats.dealt, share: total ? stats.dealt / total : 0 }))
  .sort((a, b) => b.dealt - a.dealt);

const totalOf = (part) => sum(Object.values(part?.spells ?? {}).map((stats) => stats.dealt)) + sum(Object.values(part?.loose ?? {}).map((stats) => stats.dealt));

const panelCrit = (member) => (member?.critChance != null
  ? { chance: member.critChance / 100, multiplier: CRIT_BASE + (member.critDmg ?? 0) / 100 }
  : null);

const memberTable = ({ voc, part, member, index, monsterOf, minutes, rooms }) => {
  const total = totalOf(part);
  const spells = Object.entries(part?.spells ?? {})
    .map(([words, stats]) => spellRow({ words, stats, spell: index[words], member, monsterOf, total, minutes }))
    .sort((a, b) => b.share - a.share);
  return {
    voc,
    label: member?.name ? `${member.name} (${VOCATION_LABEL[voc] ?? voc})` : VOCATION_LABEL[voc] ?? voc,
    total,
    perMinute: minutes > 0 ? total / minutes : null,
    spells,
    loose: looseRows(part?.loose, total),
    compare: comparisons(spells, rooms, voc),
    panel: panelCrit(member),
    proficiency: member?.proficiency ?? null,
    formulaReady: Boolean(member?.level && member?.magicLevel),
  };
};

const rotationKey = (rotation) => Object.keys(rotation).sort().map((voc) => `${voc}:${rotation[voc].join('+')}`).join('|');

const differences = (base, rotation, names) => Object.keys({ ...base, ...rotation }).sort().flatMap((voc) => {
  const before = new Set(base[voc] ?? []);
  const after = new Set(rotation[voc] ?? []);
  const added = [...after].filter((words) => !before.has(words)).map((words) => `+${names(words)}`);
  const removed = [...before].filter((words) => !after.has(words)).map((words) => `−${names(words)}`);
  return added.length || removed.length ? [{ voc, changes: [...added, ...removed] }] : [];
});

export const roomGroups = ({ rooms = [], index }) => {
  const names = (words) => index[words]?.name ?? words;
  const grouped = Object.values(rooms.reduce((acc, room) => {
    const rotation = rotationOfRoom(room);
    const key = rotationKey(rotation);
    return { ...acc, [key]: { key, rotation, durations: [...(acc[key]?.durations ?? []), room.ms] } };
  }, {}));
  const summarized = grouped
    .map((group) => ({ ...group, kept: withoutPauses(group.durations).kept }))
    .filter((group) => group.kept.length >= MIN_ROOMS)
    .sort((a, b) => b.kept.length - a.kept.length);
  const [base] = summarized;
  return summarized.map((group) => {
    const avg = mean(group.kept);
    const moments = { n: group.kept.length, mean: avg, variance: group.kept.length > 1 ? sum(group.kept.map((ms) => (ms - avg) ** 2)) / (group.kept.length - 1) : NaN };
    return {
      key: group.key,
      isBase: group === base,
      rooms: group.kept.length,
      dropped: group.durations.length - group.kept.length,
      seconds: avg / 1000,
      interval: meanInterval(moments),
      perHour: 3600000 / avg,
      vsBase: group === base ? null : throughputChange(base.kept, group.kept),
      rotation: Object.fromEntries(Object.entries(group.rotation).map(([voc, words]) => [voc, words.map(names)])),
      changes: group === base ? [] : differences(base.rotation, group.rotation, names),
    };
  });
};

export const rotationTable = ({ dataset, rotation, party, period = 'mobs' }) => {
  const index = spellIndex(dataset.spells ?? []);
  const monsterOf = monsterLookup(dataset);
  const minutes = { mobs: (rotation?.time?.mobs ?? 0) / 60000, boss: (rotation?.time?.boss ?? 0) / 60000 };
  const memberOf = (voc) => (party ?? []).find((member) => member.vocation === voc) ?? null;
  const members = Object.entries(rotation?.members ?? {})
    .filter(([, byPeriod]) => byPeriod[period])
    .map(([voc, byPeriod]) => memberTable({ voc, part: byPeriod[period], member: memberOf(voc), index, monsterOf, minutes: minutes[period], rooms: period === 'mobs' ? rotation?.rooms ?? [] : [] }))
    .sort((a, b) => b.total - a.total);
  return {
    ready: members.length > 0,
    period,
    minutes,
    members,
    rooms: roomGroups({ rooms: rotation?.rooms ?? [], index }),
    partyRead: Boolean(party?.some((member) => member.magicLevel)),
  };
};

export const EMPTY_COMBAT = { members: {}, foes: {}, taken: {} };

export const MIN_CRIT_HITS = 30;

const BOSS_SUFFIX = /\s+boss$/;

const addTo = (map, key, fields) => ({
  ...map,
  [key]: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, (map[key]?.[field] ?? 0) + value])),
});

const isDealt = (entry) => entry?.k === 'dealt' && entry.voc && Number.isFinite(entry.amount);

const isTakenFromMob = (entry) => entry?.k === 'taken' && entry.voc && entry.foe?.kind === 'mob' && entry.foe.name;

const addDealt = (combat, entry) => ({
  ...combat,
  members: addTo(combat.members, entry.voc, { hits: 1, dealt: entry.amount, crits: entry.crit ? 1 : 0, critDealt: entry.crit ? entry.amount : 0 }),
  foes: entry.foe?.name ? { ...combat.foes, [entry.foe.name]: (combat.foes[entry.foe.name] ?? 0) + entry.amount } : combat.foes,
});

const addTaken = (combat, entry) => ({
  ...combat,
  taken: { ...combat.taken, [entry.foe.name]: addTo(combat.taken[entry.foe.name] ?? {}, entry.voc, { hits: 1, hp: entry.hp || 0, mana: entry.mana || 0 }) },
});

const addEntry = (combat, entry) => {
  if (isDealt(entry)) return addDealt(combat, entry);
  if (isTakenFromMob(entry)) return addTaken(combat, entry);
  return combat;
};

export const combatFromLog = (entries) => (Array.isArray(entries) ? entries : []).reduce(addEntry, EMPTY_COMBAT);

const mergeMaps = (a = {}, b = {}, merge) => Object.fromEntries(
  [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, merge(a[key], b[key])]),
);

const addNumbers = (a = 0, b = 0) => a + b;

const mergeStats = (x, y) => mergeMaps(x, y, addNumbers);

export const mergeCombat = (a, b) => ({
  members: mergeMaps(a?.members, b?.members, mergeStats),
  foes: mergeMaps(a?.foes, b?.foes, addNumbers),
  taken: mergeMaps(a?.taken, b?.taken, (x, y) => mergeMaps(x, y, mergeStats)),
});

export const isEmptyCombat = (combat) => !Object.keys(combat?.members ?? {}).length;

export const hasCombat = (combat) => !isEmptyCombat(combat) || Object.keys(combat?.taken ?? {}).length > 0;

const round1 = (n) => Math.round(n * 10) / 10;

const measuredOf = (stats, sharing) => {
  if (!stats?.hits) return {};
  const hits = stats.hits / sharing;
  const dealt = stats.dealt / sharing;
  return {
    hits,
    dealt,
    avgHit: Math.round(dealt / hits),
    ...(stats.hits >= MIN_CRIT_HITS && stats.dealt > 0 ? { critShare: round1(((stats.critDealt ?? 0) * 100) / stats.dealt) } : {}),
  };
};

export const withCombat = (party, combat) => {
  if (!party || isEmptyCombat(combat)) return party ?? null;
  const sharing = (vocation) => party.filter((member) => member.vocation === vocation).length || 1;
  return party.map((member) => ({ ...member, ...measuredOf(combat.members[member.vocation], sharing(member.vocation)) }));
};

const monsterKeys = (dataset, hunt) => {
  const keyByName = Object.fromEntries(Object.entries(dataset.monsters).map(([key, monster]) => [monster.name?.toLowerCase(), key]));
  const inHunt = new Set([...hunt.monsters, hunt.bossKey].filter(Boolean));
  return (name) => {
    const key = keyByName[name.toLowerCase().replace(BOSS_SUFFIX, '')];
    return inHunt.has(key) ? key : null;
  };
};

const scaleStats = (stats, factor) => Object.fromEntries(Object.entries(stats).map(([field, value]) => [field, value * factor]));

export const dealtPerHour = ({ dataset, hunt, combat, minutes }) => {
  if (!hunt || !(minutes > 0) || isEmptyCombat(combat)) return null;
  const keyOf = monsterKeys(dataset, hunt);
  const perHour = Object.entries(combat.foes)
    .map(([name, dealt]) => [keyOf(name), dealt])
    .filter(([key]) => key)
    .reduce((acc, [key, dealt]) => ({ ...acc, [key]: (acc[key] ?? 0) + (dealt * 60) / minutes }), {});
  return Object.keys(perHour).length ? perHour : null;
};

export const takenPerHour = ({ dataset, hunt, combat, minutes }) => {
  if (!hunt || !(minutes > 0) || !Object.keys(combat?.taken ?? {}).length) return null;
  const keyOf = monsterKeys(dataset, hunt);
  const perHour = Object.entries(combat.taken)
    .map(([name, byMember]) => [keyOf(name), byMember])
    .filter(([key]) => key)
    .reduce((acc, [key, byMember]) => ({ ...acc, [key]: mergeMaps(acc[key], byMember, mergeStats) }), {});
  const hourly = Object.fromEntries(Object.entries(perHour).map(([key, byMember]) => [key, Object.fromEntries(
    Object.entries(byMember).map(([voc, stats]) => [voc, scaleStats(stats, 60 / minutes)]),
  )]));
  return Object.keys(hourly).length ? hourly : null;
};

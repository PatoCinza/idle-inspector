export const EMPTY_COMBAT = { members: {}, foes: {} };

export const MIN_CRIT_HITS = 30;

const BOSS_SUFFIX = /\s+boss$/;

const addTo = (map, key, fields) => ({
  ...map,
  [key]: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, (map[key]?.[field] ?? 0) + value])),
});

const isDealt = (entry) => entry?.k === 'dealt' && entry.voc && Number.isFinite(entry.amount);

export const combatFromLog = (entries) => (Array.isArray(entries) ? entries : [])
  .filter(isDealt)
  .reduce((combat, entry) => ({
    members: addTo(combat.members, entry.voc, { hits: 1, dealt: entry.amount, crits: entry.crit ? 1 : 0, critDealt: entry.crit ? entry.amount : 0 }),
    foes: entry.foe?.name ? { ...combat.foes, [entry.foe.name]: (combat.foes[entry.foe.name] ?? 0) + entry.amount } : combat.foes,
  }), EMPTY_COMBAT);

const mergeMaps = (a = {}, b = {}, merge) => Object.fromEntries(
  [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, merge(a[key], b[key])]),
);

const addNumbers = (a = 0, b = 0) => a + b;

export const mergeCombat = (a, b) => ({
  members: mergeMaps(a?.members, b?.members, (x, y) => mergeMaps(x, y, addNumbers)),
  foes: mergeMaps(a?.foes, b?.foes, addNumbers),
});

export const isEmptyCombat = (combat) => !Object.keys(combat?.members ?? {}).length;

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

export const dealtPerHour = ({ dataset, hunt, combat, minutes }) => {
  if (!hunt || !(minutes > 0) || isEmptyCombat(combat)) return null;
  const keyByName = Object.fromEntries(Object.entries(dataset.monsters).map(([key, monster]) => [monster.name?.toLowerCase(), key]));
  const keyOf = (name) => keyByName[name.toLowerCase().replace(BOSS_SUFFIX, '')];
  const inHunt = new Set([...hunt.monsters, hunt.bossKey].filter(Boolean));
  const perHour = Object.entries(combat.foes)
    .map(([name, dealt]) => [keyOf(name), dealt])
    .filter(([key]) => inHunt.has(key))
    .reduce((acc, [key, dealt]) => ({ ...acc, [key]: (acc[key] ?? 0) + (dealt * 60) / minutes }), {});
  return Object.keys(perHour).length ? perHour : null;
};

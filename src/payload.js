export const PREFIX = 'BLP1.';

export const decodePayload = (code) => {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('O código precisa começar com BLP1. Copie de novo a saída de blp.report().');
  const json = decodeURIComponent(escape(atob(trimmed.slice(PREFIX.length))));
  return JSON.parse(json);
};

const perHour = (value, minutes) => (minutes > 0 ? (value * 60) / minutes : 0);

const monsterKeyByName = (dataset) => {
  const index = Object.fromEntries(Object.entries(dataset.monsters).map(([key, m]) => [m.name.toLowerCase(), key]));
  return (name) => (name ? index[name.toLowerCase()] ?? null : null);
};

const charmsFromCards = (dataset, cards) => {
  const keyOf = monsterKeyByName(dataset);
  const byName = Object.fromEntries(dataset.charms.map((c) => [c.name.toLowerCase(), c.key]));
  const known = cards.map((c) => ({ key: byName[c.name.toLowerCase()], tier: c.tier, monster: keyOf(c.creature) })).filter((c) => c.key);
  return {
    owned: Object.fromEntries(known.map((c) => [c.key, c.tier])),
    assigned: Object.fromEntries(known.filter((c) => c.monster).map((c) => [c.key, { monster: c.monster, tier: c.tier }])),
  };
};

const charmsFromSlots = (dataset, slots) => {
  const known = dataset.charms
    .map((c) => ({ key: c.key, slot: slots[c.id] }))
    .filter((c) => c.slot);
  return {
    owned: Object.fromEntries(known.map((c) => [c.key, c.slot.tier ?? 3])),
    assigned: Object.fromEntries(known.filter((c) => c.slot.monsterKey).map((c) => [c.key, { monster: c.slot.monsterKey, tier: c.slot.tier ?? 3 }])),
  };
};

const readCharms = (dataset, charms) => {
  if (Array.isArray(charms) && charms.length) return charmsFromCards(dataset, charms);
  if (charms && typeof charms === 'object' && !Array.isArray(charms)) return charmsFromSlots(dataset, charms);
  return null;
};

const MEMBER_FIELDS = ['lootPct', 'level', 'maxHp', 'maxMana', 'critChance', 'critDmg', 'avgHit', 'dealt', 'avatarUptime'];

const readMember = (p) => ({
  name: p.name,
  ...Object.fromEntries(MEMBER_FIELDS.filter((f) => typeof p[f] === 'number').map((f) => [f, p[f]])),
});

export const mergeParty = (previous, incoming) => incoming.map((member) => ({
  ...(previous.find((p) => p.name === member.name) ?? {}),
  ...member,
}));

export const inputsFromPayload = (dataset, payload) => {
  const hunt = dataset.hunts.find((h) => h.id === payload.huntId)
    ?? dataset.hunts.find((h) => Object.keys(payload.kills).every((k) => h.monsters.includes(k)));
  if (!hunt) throw new Error('Não reconheci a hunt desse código. Confira se a coleta foi feita dentro de uma hunt.');
  const keys = [...new Set([...hunt.monsters, hunt.bossKey].filter(Boolean))];
  return {
    huntId: hunt.id,
    minutes: payload.minutes,
    killsByMonster: Object.fromEntries(keys.filter((k) => hunt.monsters.includes(k) || payload.kills[k] != null)
      .map((k) => [k, perHour(payload.kills[k] ?? 0, payload.minutes)])),
    roomsPerHour: perHour(payload.rooms ?? 0, payload.minutes),
    party: payload.party?.length ? payload.party.slice(0, 3).map(readMember) : null,
    bestiary: payload.bestiary ?? {},
    codex: payload.codex ?? null,
    charms: readCharms(dataset, payload.charmSlots) ?? readCharms(dataset, payload.charms),
    charmStats: payload.charmStats ?? null,
    observedLoot: payload.loot ?? null,
    observedKills: payload.kills,
  };
};

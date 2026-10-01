export const CURRENCY = { 'gold coin': 1, 'platinum coin': 100, 'crystal coin': 10000 };
export const CHANCE_SCALE = 100000;
export const DEFAULT_PARTY = [0, 0, 0];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const byDesc = (key) => (a, b) => b[key] - a[key];

export const FLAT_ROLL = new Set(['bag you desire', 'bag you covet', 'primal bag']);

export const isCurrency = (name) => name in CURRENCY;

const rollsOncePerKill = (name) => isCurrency(name) || FLAT_ROLL.has(name);

export const unitValue = (dataset, name) => CURRENCY[name] ?? dataset.prices[name] ?? 0;

export const averageQuantity = ({ max }) => (1 + (max ?? 1)) / 2;

export const charmValue = (dataset, key, tier) =>
  (dataset.charms.find((c) => c.key === key)?.chance[tier - 1] ?? 0) / 100;

const boostEntry = (cap, equipment, factor) => (entry) => {
  if (equipment.has(entry.name)) return entry;
  const chance = Math.min(cap, Math.round(entry.chance * factor));
  const ratio = (entry.chance * factor) / chance;
  const max = entry.max ?? 1;
  const boostedMax = ratio > 1 ? Math.max(1, Math.round(ratio * (max + 1) - 1)) : max;
  return { ...entry, chance, ...(boostedMax > 1 ? { max: boostedMax } : {}) };
};

export const monsterLoot = (dataset, monsterKey) => {
  const loot = dataset.monsters[monsterKey]?.loot ?? [];
  const factor = dataset.lootMultipliers[monsterKey] ?? 1;
  return factor === 1 ? loot : loot.map(boostEntry(dataset.lootCap, new Set(dataset.equipment), factor));
};

export const rollsPerKill = (chance, lootPcts, gut) =>
  sum(lootPcts.map((pct) => Math.min(1, (chance / CHANCE_SCALE) * (1 + pct / 100) * (1 + gut))));

export const lootRows = ({ dataset, monsterKey, kills, lootPcts = DEFAULT_PARTY, gut = 0, scavenge = 0 }) =>
  monsterLoot(dataset, monsterKey).map((entry) => {
    const currency = isCurrency(entry.name);
    const perKill = rollsOncePerKill(entry.name)
      ? (entry.chance / CHANCE_SCALE) * averageQuantity(entry)
      : rollsPerKill(entry.chance, lootPcts, gut) * averageQuantity(entry);
    const value = unitValue(dataset, entry.name) * (currency ? 1 + scavenge : 1);
    return {
      monster: monsterKey,
      item: entry.name,
      chance: entry.chance / CHANCE_SCALE,
      currency,
      priced: currency || entry.name in dataset.prices,
      count: perKill * kills,
      value: perKill * kills * value,
    };
  });

export const creatures = (hunt) => [...new Set([...hunt.monsters, hunt.bossKey].filter(Boolean))];

export const lootKills = ({ hunt, killsByMonster, roomsPerHour = 0, bossRollsLoot = true }) =>
  Object.fromEntries(creatures(hunt).map((key) => {
    const kills = killsByMonster[key] ?? (key === hunt.bossKey ? roomsPerHour : 0);
    const bossShare = !bossRollsLoot && key === hunt.bossKey ? roomsPerHour : 0;
    return [key, Math.max(0, kills - bossShare)];
  }));

export const evenSplit = (hunt, killsPerHour) =>
  Object.fromEntries(hunt.monsters.map((key) => [key, killsPerHour / hunt.monsters.length]));

export const huntLoot = ({ dataset, hunt, killsByMonster, roomsPerHour = 0, lootPcts, charms = {}, bossRollsLoot }) => {
  const kills = lootKills({ hunt, killsByMonster, roomsPerHour, bossRollsLoot });
  const tierOf = (charmKey, monsterKey) =>
    charms[charmKey]?.monster === monsterKey ? charmValue(dataset, charmKey, charms[charmKey].tier ?? 3) : 0;
  return creatures(hunt).flatMap((key) => lootRows({
    dataset,
    monsterKey: key,
    kills: kills[key],
    lootPcts,
    gut: tierOf('gut', key),
    scavenge: tierOf('scavenge', key),
  }));
};

export const groupByItem = (rows) => Object.values(rows.reduce((acc, row) => {
  const current = acc[row.item] ?? { item: row.item, currency: row.currency, priced: row.priced, count: 0, value: 0, sources: [] };
  return {
    ...acc,
    [row.item]: {
      ...current,
      count: current.count + row.count,
      value: current.value + row.value,
      sources: [...current.sources, { monster: row.monster, chance: row.chance, count: row.count }],
    },
  };
}, {})).sort(byDesc('value'));

export const totals = (rows) => ({
  currency: sum(rows.filter((r) => r.currency).map((r) => r.value)),
  items: sum(rows.filter((r) => !r.currency).map((r) => r.value)),
  total: sum(rows.map((r) => r.value)),
});

export const scavengeGoldPerHour = ({ monster, tier, ...context }) => totals(huntLoot(context).filter((row) => row.monster === monster)).currency
  * charmValue(context.dataset, 'scavenge', tier);

export const LOOT_CHARMS = ['gut', 'scavenge'];

const lootAssignments = (keys, available) => {
  const [first, ...rest] = available;
  if (!first) return [{}];
  const tail = lootAssignments(keys, rest);
  return [
    ...tail,
    ...keys.flatMap((monster) => tail
      .filter((plan) => !Object.values(plan).some((p) => p.monster === monster))
      .map((plan) => ({ ...plan, [first.key]: { monster, tier: first.tier } }))),
  ];
};

export const charmPlans = ({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, owned = { gut: 3, scavenge: 3 }, bossRollsLoot }) => {
  const available = LOOT_CHARMS.filter((key) => owned[key]).map((key) => ({ key, tier: owned[key] }));
  const base = totals(huntLoot({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, bossRollsLoot })).total;
  return lootAssignments(creatures(hunt), available)
    .map((charms) => {
      const total = totals(huntLoot({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, charms, bossRollsLoot })).total;
      return { charms, gut: charms.gut?.monster ?? null, scavenge: charms.scavenge?.monster ?? null, total, gain: total - base };
    })
    .sort(byDesc('total'));
};

export const monsterBreakdown = ({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, bossRollsLoot }) => {
  const rows = huntLoot({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, bossRollsLoot });
  const kills = lootKills({ hunt, killsByMonster, roomsPerHour, bossRollsLoot });
  return creatures(hunt).map((key) => {
    const mine = rows.filter((r) => r.monster === key);
    return { monster: key, name: dataset.monsters[key]?.name ?? key, kills: killsByMonster[key] ?? 0, lootKills: kills[key], ...totals(mine) };
  });
};

export const bestiaryGoal = (exp) => (exp <= 0 ? 0 : exp < 100 ? 250 : exp < 500 ? 500 : exp < 2000 ? 1000 : 2500);

export const bestiaryPlan = ({ dataset, hunt, killsByMonster, current = {} }) => creatures(hunt).map((key) => {
  const goal = bestiaryGoal(dataset.monsters[key]?.exp ?? 0);
  const have = current[key] ?? 0;
  const remaining = Math.max(0, goal - have);
  const perHour = killsByMonster[key] ?? 0;
  return { monster: key, name: dataset.monsters[key]?.name ?? key, goal, have, remaining, hours: perHour > 0 ? remaining / perHour : Infinity };
});

export const codexEntryId = (huntId, step) => (step === 0 ? `hunt-${huntId}` : `hunt-${huntId}-${step + 1}`);

export const codexPlan = ({ dataset, hunt, perHour, progress = {} }) => {
  const base = dataset.codexHunts?.[hunt.id] ?? [];
  const done = new Set(progress.done ?? []);
  return (dataset.codexSteps ?? []).map((step, index) => {
    const id = codexEntryId(hunt.id, index);
    const have = progress.prog?.[id] ?? [];
    const complete = done.has(id);
    const items = base.map((req, i) => {
      const need = req.qty * step.qty;
      const owned = complete ? need : Math.min(need, have[i] ?? 0);
      const remaining = need - owned;
      const rate = perHour[req.item] ?? 0;
      return { item: req.item, need, have: owned, remaining, perHour: rate, hours: remaining ? hoursFor(remaining, rate) : 0 };
    });
    return { id, step: step.suffix, complete, items, hours: Math.max(0, ...items.map((i) => i.hours)) };
  }).filter((entry) => entry.items.length);
};

export const hoursFor = (quantity, perHour) => (perHour > 0 ? quantity / perHour : Infinity);

export const poissonAtLeastOne = (rate, hours) => 1 - Math.exp(-rate * hours);

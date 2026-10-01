import { charmValue } from './model.js';

export const DEFENSIVE_MAJORS = new Set(['parry', 'dodge']);

const RECOVERY = /potion/i;

const sum = (values) => values.reduce((a, b) => a + b, 0);

const totalOf = (byMember = {}) => sum(Object.values(byMember).map((stats) => (stats.hp ?? 0) + (stats.mana ?? 0)));

const equippedDefense = (dataset, assigned, monster) => [...DEFENSIVE_MAJORS]
  .filter((key) => assigned?.[key]?.monster === monster)
  .map((key) => ({ key, value: charmValue(dataset, key, assigned[key].tier ?? 3) }))[0] ?? null;

export const defenseOf = ({ dataset, takenPerHour, assigned }) => (takenPerHour
  ? Object.fromEntries(Object.entries(takenPerHour).map(([monster, byMember]) => {
    const observed = totalOf(byMember);
    const equipped = equippedDefense(dataset, assigned, monster);
    return [monster, { observed, base: observed / (1 - (equipped?.value ?? 0)), equipped: equipped?.key ?? null, byMember }];
  }))
  : null);

export const takenTotal = (defense) => sum(Object.values(defense ?? {}).map((d) => d.base));

export const recoverySpent = (supply = {}) => sum(Object.entries(supply).filter(([item]) => RECOVERY.test(item)).map(([, gold]) => gold));

export const supplyPerDamage = ({ supply, minutes, defense }) => {
  const taken = sum(Object.values(defense ?? {}).map((d) => d.observed));
  if (!(minutes > 0) || !(taken > 0)) return null;
  return (recoverySpent(supply) * 60) / minutes / taken;
};

export const defensiveEffect = ({ dataset, charmKey, tier, base }) => {
  const avoided = charmValue(dataset, charmKey, tier) * base;
  return { avoided, reflected: charmKey === 'parry' ? avoided : 0 };
};

export const defensiveOption = ({ dataset, charm, keys, defense, economy, objective, dealtPerHour }) => {
  const effects = Object.fromEntries(keys.map((k) => [k, defensiveEffect({ dataset, charmKey: charm.key, tier: charm.tier, base: defense[k]?.base ?? 0 })]));
  const share = (k) => (economy.dealtPerHour > 0 ? effects[k].reflected / economy.dealtPerHour : 0);
  const saved = (k) => (objective === 'profit' ? effects[k].avoided * (economy.supplyPerDamage ?? 0) : 0);
  const unit = objective === 'xp' ? economy.xpPerHour : economy.lootPerHour;
  return {
    ...charm,
    defensive: true,
    effects,
    perCreature: Object.fromEntries(keys.map((k) => [k, dealtPerHour?.[k] > 0 ? effects[k].reflected / dealtPerHour[k] : 0])),
    damage: Object.fromEntries(keys.map((k) => [k, share(k)])),
    saved: Object.fromEntries(keys.map((k) => [k, saved(k)])),
    gains: Object.fromEntries(keys.map((k) => [k, share(k) * unit + saved(k)])),
  };
};

export const measuredDefense = ({ dataset, charmStats, assigned, defense }) => {
  if (!charmStats?.rows?.length || !(charmStats.ms > 0)) return [];
  const hours = charmStats.ms / 3600000;
  return [...DEFENSIVE_MAJORS]
    .map((key) => ({ key, charm: dataset.charms.find((c) => c.key === key), slot: assigned?.[key] }))
    .filter(({ charm, slot }) => charm && slot?.monster)
    .map(({ key, charm, slot }) => {
      const row = charmStats.rows.find((r) => r.id === charm.id);
      const predicted = defensiveEffect({ dataset, charmKey: key, tier: slot.tier ?? 3, base: defense?.[slot.monster]?.base ?? 0 }).avoided;
      return {
        key,
        name: charm.name,
        monster: dataset.monsters[slot.monster]?.name ?? slot.monster,
        procsPerHour: (row?.n ?? 0) / hours,
        measured: (row?.v ?? 0) / hours,
        predicted,
      };
    })
    .filter((m) => m.procsPerHour > 0 || m.predicted > 0);
};

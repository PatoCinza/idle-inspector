import { charmValue, creatures, monsterLoot, killChance, averageQuantity } from './model.js';
import { charmsFromSlots } from './payload.js';

export const MIN_QUANTITY_DROPS = 30;

const Z = 1.96;

const sum = (values) => values.reduce((a, b) => a + b, 0);

const isMonsterKey = (key) => !key.startsWith('h:') && key !== 'bp';

const increases = (from, to, read) => Object.keys(to).map((key) => [key, read(to[key]) - read(from[key])]);

export const initialDropLog = () => ({ armed: false, monsters: {} });

export const killsDelta = (from, to) => (from && to
  ? Object.fromEntries(increases(from, to, (value) => Number(value) || 0).filter(([key, n]) => isMonsterKey(key) && n > 0))
  : {});

const lootCount = (entry) => entry?.n ?? 0;

export const lootDelta = (from, to) => {
  if (!from || !to) return {};
  if (Object.keys(from).some((key) => lootCount(to[key]) < lootCount(from[key]))) return null;
  return Object.fromEntries(increases(from, to, lootCount).filter(([, n]) => n > 0));
};

export const gutOn = (dataset, charmSlots, monster) => {
  const gut = charmSlots ? charmsFromSlots(dataset, charmSlots).assigned.gut : null;
  return gut?.monster === monster ? charmValue(dataset, 'gut', gut.tier) : 0;
};

const addDrop = (items, [item, quantity]) => {
  const current = items[item] ?? { drops: 0, qty: {} };
  return {
    ...items,
    [item]: { drops: current.drops + 1, qty: { ...current.qty, [quantity]: (current.qty[quantity] ?? 0) + 1 } },
  };
};

const recordKill = (monsters, { monster, loot, factor }) => {
  const current = monsters[monster] ?? { kills: 0, factor: 0, items: {} };
  return {
    ...monsters,
    [monster]: { kills: current.kills + 1, factor: current.factor + factor, items: Object.entries(loot).reduce(addDrop, current.items) },
  };
};

export const observeSnapshot = (log, previous, event, factorOf) => {
  const kills = killsDelta(previous?.bestiary, event.bestiary);
  const loot = lootDelta(previous?.loot, event.loot);
  const hadBoth = Boolean(previous?.bestiary && previous?.loot);
  const hasBoth = Boolean(event.bestiary && event.loot);
  const complete = hadBoth && hasBoth;
  const killed = sum(Object.values(kills));
  const changed = killed > 0 || loot === null || Object.keys(loot).length > 0;
  const isolated = complete && log.armed && loot !== null && killed === 1;
  const [monster] = Object.keys(kills);
  const armed = !hadBoth ? hasBoth : complete ? loot !== null : log.armed && !changed;
  return {
    armed,
    monsters: isolated ? recordKill(log.monsters, { monster, loot, factor: factorOf(monster) }) : log.monsters,
  };
};

export const disarm = (log) => ({ ...log, armed: false });

const quantityStats = (qty = {}) => {
  const pairs = Object.entries(qty).map(([q, count]) => [Number(q), count]);
  const drops = sum(pairs.map(([, count]) => count));
  return drops
    ? { mean: sum(pairs.map(([q, count]) => q * count)) / drops, min: Math.min(...pairs.map(([q]) => q)), max: Math.max(...pairs.map(([q]) => q)) }
    : { mean: null, min: null, max: null };
};

export const measuredQuantities = (log, minDrops = MIN_QUANTITY_DROPS) => Object.fromEntries(
  Object.entries(log?.monsters ?? {})
    .map(([monster, { items }]) => [monster, Object.fromEntries(Object.entries(items)
      .filter(([, stats]) => stats.drops >= minDrops)
      .map(([item, stats]) => [item, quantityStats(stats.qty).mean]))])
    .filter(([, items]) => Object.keys(items).length),
);

export const wilson = (successes, trials) => {
  if (!trials) return null;
  const p = successes / trials;
  const z2 = Z * Z;
  const scale = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / scale;
  const half = (Z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / scale;
  return [successes === 0 ? 0 : center - half, successes === trials ? 1 : center + half];
};

const statusOf = ({ listed, skipped, kills, predicted, interval, quantity, tableMax }) => {
  if (skipped) return 'skipped';
  if (!listed) return 'unlisted';
  if (!kills) return 'empty';
  if (quantity.max != null && quantity.max > tableMax) return 'quantity';
  if (predicted < interval[0]) return 'above';
  if (predicted > interval[1]) return 'below';
  return 'ok';
};

const sampleRow = ({ entry, item, stats, kills, factor, skipped }) => {
  const drops = stats?.drops ?? 0;
  const quantity = quantityStats(stats?.qty);
  const interval = wilson(drops, kills);
  const predicted = entry && kills ? killChance(entry, factor) : null;
  const tableMax = entry?.max ?? 1;
  return {
    item,
    listed: Boolean(entry),
    drops,
    measured: kills ? drops / kills : null,
    interval,
    predicted,
    tableMax,
    predictedQuantity: entry ? averageQuantity(entry) : null,
    quantity,
    usesMeasuredQuantity: drops >= MIN_QUANTITY_DROPS,
    skipped,
    status: statusOf({ listed: Boolean(entry), skipped, kills, predicted, interval, quantity, tableMax }),
  };
};

const byPrediction = (a, b) => Number(b.listed) - Number(a.listed) || (b.predicted ?? 0) - (a.predicted ?? 0) || b.drops - a.drops;

const creatureSample = (dataset, log, skipped) => (monster) => {
  const stats = log?.monsters?.[monster] ?? { kills: 0, factor: 0, items: {} };
  const factor = stats.kills ? stats.factor / stats.kills : null;
  const table = monsterLoot(dataset, monster);
  const listed = new Set(table.map((entry) => entry.name));
  const rows = [
    ...table.map((entry) => sampleRow({ entry, item: entry.name, stats: stats.items[entry.name], kills: stats.kills, factor, skipped: skipped.has(entry.name) })),
    ...Object.keys(stats.items).filter((item) => !listed.has(item)).map((item) => sampleRow({ entry: null, item, stats: stats.items[item], kills: stats.kills, factor, skipped: skipped.has(item) })),
  ];
  return { monster, name: dataset.monsters[monster]?.name ?? monster, kills: stats.kills, factor, rows: rows.sort(byPrediction) };
};

export const sampleTable = ({ dataset, hunt, log, skipped = new Set() }) => {
  if (!hunt) return { ready: false, hunt: null, creatures: [], kills: 0 };
  const sampled = creatures(hunt).map(creatureSample(dataset, log, skipped));
  return { ready: true, hunt, creatures: sampled, kills: sum(sampled.map((c) => c.kills)) };
};

import { DEFAULT_PARTY, huntLoot, groupByItem, totals, creatures } from './model.js';
import { charmsFromSlots } from './payload.js';

export const MIN_MINUTES = 2;

export const perHour = (value, minutes) => (value * 60) / minutes;

export const findHunt = (dataset, window) => dataset.hunts.find((h) => h.id === window.huntId)
  ?? dataset.hunts.find((h) => Object.keys(window.kills).length > 0 && Object.keys(window.kills).every((k) => h.monsters.includes(k)))
  ?? null;

export const lootPcts = (party) => (party?.length ? party.slice(0, 3).map((member) => member.lootPct ?? 0) : DEFAULT_PARTY);

export const rates = (hunt, window) => Object.fromEntries(
  creatures(hunt)
    .filter((key) => hunt.monsters.includes(key) || window.kills[key] != null)
    .map((key) => [key, perHour(window.kills[key] ?? 0, window.minutes)]),
);

const row = (dataset, window) => (group) => {
  const creaturesOf = [...new Set(group.sources.map((s) => s.monster))];
  return {
    item: group.item,
    iconId: dataset.itemIds[group.item] ?? null,
    creatures: creaturesOf.map((key) => dataset.monsters[key]?.name ?? key),
    chance: Math.max(...group.sources.map((s) => s.chance)),
    perHour: group.count,
    valuePerHour: group.priced ? group.value : null,
    everyHours: group.count > 0 ? 1 / group.count : Infinity,
    dropped: window.loot[group.item] ?? 0,
    currency: group.currency,
  };
};

export const dropsTable = ({ dataset, window, party = null, charmSlots = null, bossRollsLoot = true }) => {
  const hunt = findHunt(dataset, window);
  const ready = Boolean(hunt) && window.minutes >= MIN_MINUTES;
  if (!ready) return { ready: false, hunt, minutes: window.minutes, rows: [], totals: null, partyRead: Boolean(party?.length) };
  const rows = huntLoot({
    dataset,
    hunt,
    killsByMonster: rates(hunt, window),
    roomsPerHour: perHour(window.rooms, window.minutes),
    lootPcts: lootPcts(party),
    charms: charmSlots ? charmsFromSlots(dataset, charmSlots).assigned : {},
    bossRollsLoot,
  });
  return {
    ready: true,
    hunt,
    minutes: window.minutes,
    rows: groupByItem(rows).map(row(dataset, window)),
    totals: totals(rows),
    partyRead: Boolean(party?.length),
  };
};

import { DEFAULT_PARTY, huntLoot, groupByItem, totals, creatures, evenSplit } from './model.js';
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

const row = (dataset, loot) => (group) => {
  const creaturesOf = [...new Set(group.sources.map((s) => s.monster))];
  return {
    item: group.item,
    iconId: dataset.itemIds[group.item] ?? null,
    creatures: creaturesOf.map((key) => dataset.monsters[key]?.name ?? key),
    chance: Math.max(...group.sources.map((s) => s.chance)),
    perHour: group.count,
    valuePerHour: group.priced ? group.value : null,
    everyHours: group.count > 0 ? 1 / group.count : Infinity,
    dropped: loot ? loot[group.item] ?? 0 : null,
    currency: group.currency,
  };
};

const measuredIn = (hunt, quantities) => creatures(hunt).reduce((count, key) => count + Object.keys(quantities[key] ?? {}).length, 0);

const dropsFor = ({ dataset, hunt, killsByMonster, roomsPerHour, party, charmSlots, bossRollsLoot, quantities = {}, loot = null }) => {
  const rows = huntLoot({
    dataset,
    hunt,
    killsByMonster,
    roomsPerHour,
    lootPcts: lootPcts(party),
    charms: charmSlots ? charmsFromSlots(dataset, charmSlots).assigned : {},
    bossRollsLoot,
    quantities,
  });
  return { rows: groupByItem(rows).map(row(dataset, loot)), totals: totals(rows), measuredQuantities: measuredIn(hunt, quantities) };
};

export const dropsTable = ({ dataset, window, party = null, charmSlots = null, bossRollsLoot = true, quantities = {} }) => {
  const hunt = findHunt(dataset, window);
  const ready = Boolean(hunt) && window.minutes >= MIN_MINUTES;
  const partyRead = Boolean(party?.length);
  if (!ready) return { ready: false, mode: 'measured', unit: 'hour', hunt, minutes: window.minutes, rows: [], totals: null, partyRead };
  return {
    ready: true,
    mode: 'measured',
    unit: 'hour',
    hunt,
    minutes: window.minutes,
    ...dropsFor({
      dataset,
      hunt,
      killsByMonster: rates(hunt, window),
      roomsPerHour: perHour(window.rooms, window.minutes),
      party,
      charmSlots,
      bossRollsLoot,
      quantities,
      loot: window.loot,
    }),
    partyRead,
  };
};

const savedKills = (hunt, saved) => Object.fromEntries(creatures(hunt)
  .filter((key) => hunt.monsters.includes(key) || saved.kills[key] != null)
  .map((key) => [key, saved.kills[key] ?? 0]));

export const plannedDropsTable = ({ dataset, hunt, saved = null, party = null, charmSlots = null, bossRollsLoot = true, quantities = {} }) => ({
  ready: true,
  mode: saved ? 'saved' : 'perKill',
  unit: saved ? 'hour' : 'kill',
  hunt,
  saved,
  ...dropsFor({
    dataset,
    hunt,
    killsByMonster: saved ? savedKills(hunt, saved) : evenSplit(hunt, 1),
    roomsPerHour: saved ? saved.rooms : 0,
    party,
    charmSlots,
    bossRollsLoot,
    quantities,
  }),
  partyRead: Boolean(party?.length),
});

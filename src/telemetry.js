import { liveWindow } from './plan.js';
import { findHunt, rates, perHour, lootPcts, dropsTable, MIN_MINUTES } from './drops.js';
import { charmsFromSlots } from './payload.js';
import { partyLootFactor } from './model.js';
import { withCombat, dealtPerHour, takenPerHour } from './combat.js';
import { withAvatar } from './avatar.js';
import { measuredQuantities } from './drop-log.js';

export { POSTHOG, KEYS, DATA_COLLECTION, batchOf } from './posthog.js';

export const FLUSH_MS = 10 * 60 * 1000;
export const LEVEL_STEP = 50;
export const MAX_PHASES = 500;

const round = (value, digits = 0) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);
const roundMap = (map, digits = 0) => (map ? Object.fromEntries(Object.entries(map).map(([key, value]) => [key, round(value, digits)])) : null);
const sum = (values) => values.reduce((a, b) => a + b, 0);

export const emptyUsage = () => ({ tabs: {}, planner: 0, readParty: 0, objective: 0, options: 0 });

const USAGE = {
  tab: (usage, { tab }) => ({ ...usage, tabs: { ...usage.tabs, [tab]: (usage.tabs[tab] ?? 0) + 1 } }),
  planner: (usage) => ({ ...usage, planner: usage.planner + 1 }),
  readParty: (usage) => ({ ...usage, readParty: usage.readParty + 1 }),
  objective: (usage) => ({ ...usage, objective: usage.objective + 1 }),
  options: (usage) => ({ ...usage, options: usage.options + 1 }),
};

export const countUsage = (usage, action) => (USAGE[action?.type] ?? ((u) => u))(usage, action);

const usageEvents = (usage) => (sum([...Object.values(usage.tabs), usage.planner, usage.readParty, usage.objective, usage.options]) > 0
  ? [{ event: 'blp_usage', properties: { tabs: usage.tabs, planner_changes: usage.planner, read_party: usage.readParty, objective_changes: usage.objective, options_opened: usage.options } }]
  : []);

export const anonymousMember = (member) => ({
  vocation: member.vocation ?? null,
  level_bucket: Number.isFinite(member.level) ? Math.floor(member.level / LEVEL_STEP) * LEVEL_STEP : null,
  loot_pct: member.lootPct ?? null,
  crit_chance: member.critChance ?? null,
  crit_dmg: member.critDmg ?? null,
  avatar_uptime: member.avatarUptime ?? null,
  hits: member.hits ?? null,
  dealt: round(member.dealt),
  avg_hit: member.avgHit ?? null,
  crit_share: member.critShare ?? null,
});

const charmList = (dataset, charmSlots) => (charmSlots
  ? Object.entries(charmsFromSlots(dataset, charmSlots).assigned).map(([charm, slot]) => ({ charm, tier: slot.tier, monster: slot.monster }))
  : []);

const charmStatsOf = (dataset, charmStats) => (charmStats?.rows?.length
  ? { ms: charmStats.ms, rows: charmStats.rows.map((row) => ({ charm: dataset.charms.find((c) => c.id === row.id)?.key ?? String(row.id), n: row.n, v: row.v })) }
  : null);

const takenTotals = (taken) => (taken
  ? Object.fromEntries(Object.entries(taken).map(([monster, byMember]) => [monster, round(sum(Object.values(byMember).map((s) => (s.hp ?? 0) + (s.mana ?? 0))))]))
  : null);

const predictedLoot = (table, minutes) => Object.fromEntries(table.rows.map((row) => [row.item, round((row.perHour * minutes) / 60, 2)]));

export const huntWindowEvent = ({ dataset, app }) => {
  const window = liveWindow(dataset, app.session);
  const hunt = findHunt(dataset, window);
  if (!hunt || window.minutes < MIN_MINUTES) return null;
  const members = app.party?.members ?? null;
  const party = members ? withCombat(withAvatar(members, app.procs ?? null), app.combat ?? null) : null;
  const table = dropsTable({ dataset, window, party: members, charmSlots: app.charmSlots, quantities: measuredQuantities(app.dropLog) });
  const combatArgs = { dataset, hunt, combat: app.combat ?? null, minutes: window.minutes };
  return {
    key: String(app.session.since?.t ?? 0),
    minutes: Math.floor(window.minutes),
    event: {
      event: 'blp_hunt_window',
      properties: {
        window_key: String(app.session.since?.t ?? 0),
        hunt: hunt.id,
        minutes: round(window.minutes, 1),
        kills_per_hour: roundMap(rates(hunt, window), 1),
        rooms_per_hour: round(perHour(window.rooms, window.minutes), 1),
        party_size: members?.length ?? null,
        party_loot_factor: round(partyLootFactor(lootPcts(members)), 4),
        party: party ? party.map(anonymousMember) : null,
        charms: charmList(dataset, app.charmSlots),
        charm_stats: charmStatsOf(dataset, app.charmStats),
        loot_observed: window.loot,
        loot_predicted: predictedLoot(table, window.minutes),
        xp_per_hour: app.xp > 0 ? round((app.xp * 60) / window.minutes) : null,
        dealt_per_hour: roundMap(dealtPerHour(combatArgs)),
        taken_per_hour: takenTotals(takenPerHour(combatArgs)),
        supply_per_hour: roundMap(Object.fromEntries(Object.entries(window.supply ?? {}).map(([item, gold]) => [item, (gold * 60) / window.minutes]))),
        phase_ms: (app.phases ?? []).slice(-MAX_PHASES),
      },
    },
  };
};

const diffCounts = (current = {}, sent = {}) => Object.fromEntries(
  Object.entries(current).map(([key, value]) => [key, value - (sent[key] ?? 0)]).filter(([, value]) => value > 0),
);

const dropDelta = (current, sent) => {
  const base = sent && sent.kills <= current.kills ? sent : { kills: 0, factor: 0, items: {} };
  const items = Object.fromEntries(Object.entries(current.items)
    .map(([item, stats]) => [item, { drops: stats.drops - (base.items[item]?.drops ?? 0), qty: diffCounts(stats.qty, base.items[item]?.qty) }])
    .filter(([, stats]) => stats.drops > 0));
  return { kills: current.kills - base.kills, factor: round(current.factor - base.factor, 4), items };
};

const dropEvents = (dropLog, sent) => Object.entries(dropLog?.monsters ?? {})
  .map(([monster, current]) => [monster, dropDelta(current, sent[monster])])
  .filter(([, delta]) => delta.kills > 0)
  .map(([monster, delta]) => ({ event: 'blp_drop_sample', properties: { monster, ...delta } }));

export const initialCursor = () => ({ dropLog: {}, windows: {} });

export const buildEvents = ({ dataset, app, cursor = initialCursor(), usage = emptyUsage() }) => {
  const window = app ? huntWindowEvent({ dataset, app }) : null;
  const windowIsNew = window && (cursor.windows?.[window.key] ?? -1) < window.minutes;
  const events = [
    ...usageEvents(usage),
    ...(windowIsNew ? [window.event] : []),
    ...(app ? dropEvents(app.dropLog, cursor.dropLog ?? {}) : []),
  ].map((event) => ({ ...event, properties: { ...event.properties, data_version: dataset.version } }));
  return {
    events,
    cursor: {
      dropLog: app?.dropLog?.monsters ?? cursor.dropLog ?? {},
      windows: window ? { [window.key]: Math.max(window.minutes, cursor.windows?.[window.key] ?? -1) } : cursor.windows ?? {},
    },
  };
};

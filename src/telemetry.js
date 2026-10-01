import { liveWindow } from './plan.js';
import { findHunt, rates, perHour, lootPcts, dropsTable, MIN_MINUTES } from './drops.js';
import { charmsFromSlots } from './payload.js';
import { partyLootFactor, monsterLoot, killChance, averageQuantity, unitValue, skippedItems } from './model.js';
import { normalizeParty, damageGain, familyOf, NO_CALIBRATION } from './charms.js';
import { defenseOf, defensiveEffect, DEFENSIVE_MAJORS } from './defense.js';
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

const predictedCharm = ({ dataset, charm, slot, members, defense }) => {
  if (familyOf(charm) && members) {
    return { predicted_creature_gain: round(damageGain({ dataset, charmKey: charm, tier: slot.tier, monsterKey: slot.monster, party: members, calibration: NO_CALIBRATION }), 5) };
  }
  if (DEFENSIVE_MAJORS.has(charm) && defense?.[slot.monster]) {
    return { predicted_avoided_per_hour: round(defensiveEffect({ dataset, charmKey: charm, tier: slot.tier, base: defense[slot.monster].base }).avoided) };
  }
  return {};
};

const charmList = ({ dataset, charmSlots, members, defense }) => (charmSlots
  ? Object.entries(charmsFromSlots(dataset, charmSlots).assigned).map(([charm, slot]) => ({
    charm,
    tier: slot.tier,
    monster: slot.monster,
    ...predictedCharm({ dataset, charm, slot, members, defense }),
  }))
  : []);

const lootValuePerHour = (dataset, loot, minutes) => round((Object.entries(loot ?? {}).reduce((total, [item, count]) => total + count * unitValue(dataset, item), 0) * 60) / minutes);

const charmStatsOf = (dataset, charmStats) => (charmStats?.rows?.length
  ? { ms: charmStats.ms, rows: charmStats.rows.map((row) => ({ charm: dataset.charms.find((c) => c.id === row.id)?.key ?? String(row.id), n: row.n, v: row.v })) }
  : null);

const takenTotals = (taken) => (taken
  ? Object.fromEntries(Object.entries(taken).map(([monster, byMember]) => [monster, round(sum(Object.values(byMember).map((s) => (s.hp ?? 0) + (s.mana ?? 0))))]))
  : null);

const phasesOf = (app) => (app.phases ?? []).slice(-MAX_PHASES).map((phase) => (typeof phase === 'number' ? { ms: phase, charms: null } : phase));

const phaseCharms = (dataset, ids) => (ids
  ? ids.map((id) => dataset.charms.find((c) => c.id === id)?.key ?? String(id)).sort().join(',')
  : null);

const predictedLoot = (table, minutes) => Object.fromEntries(table.rows.map((row) => [row.item, round((row.perHour * minutes) / 60, 2)]));

export const huntWindowEvent = ({ dataset, app }) => {
  const window = liveWindow(dataset, app.session);
  const hunt = findHunt(dataset, window);
  if (!hunt || window.minutes < MIN_MINUTES) return null;
  const members = app.party?.members ?? null;
  const party = members ? withCombat(withAvatar(members, app.procs ?? null), app.combat ?? null) : null;
  const skipped = skippedItems(app.lootConfig);
  const table = dropsTable({ dataset, window, party: members, charmSlots: app.charmSlots, quantities: measuredQuantities(app.dropLog), skipped });
  const combatArgs = { dataset, hunt, combat: app.combat ?? null, minutes: window.minutes };
  const taken = takenPerHour(combatArgs);
  const assigned = app.charmSlots ? charmsFromSlots(dataset, app.charmSlots).assigned : {};
  const defense = defenseOf({ dataset, takenPerHour: taken, assigned });
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
        charms: charmList({ dataset, charmSlots: app.charmSlots, members: party ? normalizeParty(party) : null, defense }),
        charm_stats: charmStatsOf(dataset, app.charmStats),
        loot_observed: window.loot,
        loot_skipped: [...skipped],
        codex_only_loot: app.lootConfig?.codexOnly ?? null,
        loot_predicted: predictedLoot(table, window.minutes),
        loot_value_observed_per_hour: lootValuePerHour(dataset, window.loot, window.minutes),
        loot_value_predicted_per_hour: round(table.totals?.total),
        xp_per_hour: app.xp > 0 ? round((app.xp * 60) / window.minutes) : null,
        dealt_per_hour: roundMap(dealtPerHour(combatArgs)),
        taken_per_hour: takenTotals(taken),
        supply_per_hour: roundMap(Object.fromEntries(Object.entries(window.supply ?? {}).map(([item, gold]) => [item, (gold * 60) / window.minutes]))),
        phase_ms: phasesOf(app).map((phase) => phase.ms),
        phase_charms: phasesOf(app).map((phase) => phaseCharms(dataset, phase.charms)),
      },
    },
  };
};

const diffCounts = (current = {}, sent = {}) => Object.fromEntries(
  Object.entries(current).map(([key, value]) => [key, value - (sent[key] ?? 0)]).filter(([, value]) => value > 0),
);

const observedDelta = (current, base) => Object.fromEntries(Object.entries(current.items)
  .map(([item, stats]) => [item, { drops: stats.drops - (base.items[item]?.drops ?? 0), qty: diffCounts(stats.qty, base.items[item]?.qty) }])
  .filter(([, stats]) => stats.drops > 0));

const withPredictions = (dataset, monster, observed, factor, skipped) => {
  const table = monsterLoot(dataset, monster);
  const listed = new Set(table.map((entry) => entry.name));
  const empty = { drops: 0, qty: {} };
  return {
    ...Object.fromEntries(table.map((entry) => [entry.name, {
      ...(observed[entry.name] ?? empty),
      chance_predicted: round(killChance(entry, factor), 6),
      quantity_predicted: averageQuantity(entry),
      max: entry.max ?? 1,
      ...(skipped.has(entry.name) ? { skipped: true } : {}),
    }])),
    ...Object.fromEntries(Object.entries(observed).filter(([item]) => !listed.has(item)).map(([item, stats]) => [item, { ...stats, unlisted: true }])),
  };
};

const dropDelta = (dataset, monster, current, sent, skipped) => {
  const base = sent && sent.kills <= current.kills ? sent : { kills: 0, factor: 0, items: {} };
  const kills = current.kills - base.kills;
  const factor = current.factor - base.factor;
  return { kills, factor: round(factor, 4), items: withPredictions(dataset, monster, observedDelta(current, base), kills ? factor / kills : 0, skipped) };
};

const dropEvents = (dataset, dropLog, sent, skipped) => Object.entries(dropLog?.monsters ?? {})
  .filter(([monster, current]) => current.kills > (sent[monster]?.kills ?? 0) || (sent[monster]?.kills ?? 0) > current.kills)
  .map(([monster, current]) => [monster, dropDelta(dataset, monster, current, sent[monster], skipped)])
  .filter(([, delta]) => delta.kills > 0)
  .map(([monster, delta]) => ({ event: 'blp_drop_sample', properties: { monster, ...delta } }));

export const initialCursor = () => ({ dropLog: {}, windows: {} });

export const buildEvents = ({ dataset, app, cursor = initialCursor(), usage = emptyUsage() }) => {
  const window = app ? huntWindowEvent({ dataset, app }) : null;
  const windowIsNew = window && (cursor.windows?.[window.key] ?? -1) < window.minutes;
  const events = [
    ...usageEvents(usage),
    ...(windowIsNew ? [window.event] : []),
    ...(app ? dropEvents(dataset, app.dropLog, cursor.dropLog ?? {}, skippedItems(app.lootConfig)) : []),
  ].map((event) => ({ ...event, properties: { ...event.properties, data_version: dataset.version } }));
  return {
    events,
    cursor: {
      dropLog: app?.dropLog?.monsters ?? cursor.dropLog ?? {},
      windows: window ? { [window.key]: Math.max(window.minutes, cursor.windows?.[window.key] ?? -1) } : cursor.windows ?? {},
    },
  };
};

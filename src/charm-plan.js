import { charmPlan, currentDamage, measuredCharms, partyAvgHit, calibrate } from './charms.js';
import { charmsFromSlots } from './payload.js';
import { withAvatar } from './avatar.js';
import { withCombat, dealtPerHour } from './combat.js';
import { findHunt, rates, perHour, lootPcts, MIN_MINUTES } from './drops.js';
import { scavengeGoldPerHour } from './model.js';

const charmName = (dataset, key) => dataset.charms.find((charm) => charm.key === key)?.name ?? key;

const memberSummary = (party) => {
  const total = party.reduce((acc, member) => acc + (member.dealt ?? 0), 0);
  return party.map((member) => ({
    name: member.name,
    share: total > 0 ? (member.dealt ?? 0) / total : null,
    avgHit: member.avgHit ?? null,
    critShare: member.critShare ?? null,
    avatarUptime: member.avatarUptime ?? null,
  }));
};

const scavengeCheck = ({ common, assigned, measured }) => {
  const slot = assigned.scavenge;
  const row = measured.find((m) => m.key === 'scavenge');
  if (!slot?.monster || !row?.damagePerHour) return null;
  return {
    monster: common.dataset.monsters[slot.monster]?.name ?? slot.monster,
    measured: row.damagePerHour,
    predicted: scavengeGoldPerHour({ ...common, monster: slot.monster, tier: slot.tier ?? 3 }),
  };
};

const blocked = (reason, hunt = null) => ({ ready: false, reason, hunt });

const requirements = ({ hunt, window, party, charmSlots }) => {
  if (!hunt) return 'hunt';
  if (window.minutes < MIN_MINUTES) return 'window';
  if (!party?.length) return 'party';
  if (!charmSlots) return 'charms';
  return null;
};

export const charmTable = ({ dataset, window, party: readParty, charmSlots, charmStats, procs = null, combat = null, bestiary, bossRollsLoot = true }) => {
  const party = withCombat(withAvatar(readParty, procs), combat);
  const hunt = findHunt(dataset, window);
  const missing = requirements({ hunt, window, party, charmSlots });
  if (missing) return blocked(missing, hunt);

  const { owned, assigned } = charmsFromSlots(dataset, charmSlots);
  const common = {
    dataset,
    hunt,
    killsByMonster: rates(hunt, window),
    roomsPerHour: perHour(window.rooms, window.minutes),
    dealtPerHour: dealtPerHour({ dataset, hunt, combat, minutes: window.minutes }),
    lootPcts: lootPcts(party),
    bossRollsLoot,
  };
  const measured = measuredCharms({ ...common, charmStats, assigned });
  const fallbackHit = partyAvgHit(measured);
  const calibration = calibrate({ ...common, party, measured, assigned, fallbackHit, source: 'seus charms medidos' });
  const plan = charmPlan({ ...common, party, owned, bestiary, fallbackHit, calibration });
  const knowsMajors = Object.keys(assigned).some((key) => dataset.charms.find((c) => c.key === key)?.category === 'major');
  const equippedOn = (monster) => Object.entries(assigned)
    .filter(([, slot]) => slot.monster === monster)
    .map(([key]) => charmName(dataset, key));

  return {
    ready: true,
    hunt,
    estimatedHit: plan.estimatedHit,
    damageMeasured: common.dealtPerHour !== null,
    scavenge: scavengeCheck({ common, assigned, measured }),
    members: memberSummary(party),
    measuredCharms: measured.length,
    calibration,
    rows: plan.rows.map((row) => ({
      ...row,
      majorName: row.major ? charmName(dataset, row.major.charm) : null,
      minorName: row.minor ? charmName(dataset, row.minor.charm) : null,
      lockedUnlockName: row.locked?.charm ? charmName(dataset, row.locked.charm) : null,
      equipped: equippedOn(row.monster),
    })),
    lootPlans: plan.lootPlans.filter((p) => p.gut || p.scavenge).slice(0, 4).map((p) => ({
      gut: p.gut ? dataset.monsters[p.gut]?.name ?? p.gut : null,
      scavenge: p.scavenge ? dataset.monsters[p.scavenge]?.name ?? p.scavenge : null,
      total: p.total,
    })),
    bestLoot: plan.loot.total,
    damageTotal: plan.damageTotal,
    currentDamage: knowsMajors ? currentDamage({ ...common, party, assigned, fallbackHit, calibration }) : null,
  };
};

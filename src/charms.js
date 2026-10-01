import { charmPlans, creatures, charmValue, bestiaryGoal } from './model.js';

const ELEMENTAL = new Set(['wound', 'enflame', 'poison', 'freeze', 'zap', 'curse', 'divine_wrath']);
const DAMAGE_MAJORS = new Set([...ELEMENTAL, 'overpower', 'overflux', 'savage_blow', 'low_blow', 'carnage']);
const DAMAGE_MINORS = new Set(['fatal_hold']);
const LOW_HP_SHARE = 0.25;
const PER_HIT = new Set([...ELEMENTAL, 'overpower', 'overflux']);

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const estimateAvgHit = (level) => Math.max(1, (level ?? 0) * 3.2);

export const effectiveCrit = ({ critChance, avatarUptime }) => avatarUptime + (1 - avatarUptime) * critChance;

export const CRIT_BASE = 0.5;

export const critMultiplier = (critDmg) => 1 + CRIT_BASE + critDmg;

const critShareOf = (ecc, multiplier) => (ecc * multiplier) / (1 + ecc * (multiplier - 1));

const eccOf = (critShare, multiplier) => critShare / (multiplier - critShare * (multiplier - 1));

export const normalizeParty = (party, fallbackHit = null) => {
  const dealt = party.map((p) => p.dealt ?? 0);
  const total = sum(dealt);
  return party.map((p, i) => {
    const member = {
      ...p,
      critChance: (p.critChance ?? 0) / 100,
      critDmg: (p.critDmg ?? 0) / 100,
      avatarUptime: Math.min(1, (p.avatarUptime ?? 0) / 100),
    };
    const multiplier = critMultiplier(member.critDmg);
    const measuredShare = Number.isFinite(p.critShare) ? p.critShare / 100 : null;
    const ecc = measuredShare === null ? effectiveCrit(member) : eccOf(measuredShare, multiplier);
    const measured = p.avgHit > 0 ? p.avgHit : fallbackHit;
    return {
      ...member,
      ecc,
      critMultiplier: multiplier,
      critShare: measuredShare ?? critShareOf(ecc, multiplier),
      avgHit: measured > 0 ? measured : estimateAvgHit(p.level),
      estimatedHit: !(measured > 0),
      share: total > 0 ? dealt[i] / total : 1 / party.length,
    };
  });
};

const memberGain = (key, value, monster, member) => {
  const hp = monster.hp;
  const procCrit = 1 + member.critChance * member.critDmg;
  if (ELEMENTAL.has(key)) {
    const resist = monster.resist?.[monster.charmElement] ?? 0;
    return (value * Math.min(2 * member.level, 0.05 * hp) * (1 - resist / 100) * procCrit) / member.avgHit;
  }
  if (key === 'overpower') return (value * Math.min(0.08 * hp, 0.05 * (member.maxHp ?? 0)) * procCrit) / member.avgHit;
  if (key === 'overflux') return (value * Math.min(0.08 * hp, 0.025 * (member.maxMana ?? 0)) * procCrit) / member.avgHit;
  if (key === 'savage_blow') return (member.critShare * value) / member.critMultiplier;
  if (key === 'low_blow') {
    if (member.critChance <= 0) return 0;
    const added = Math.min(value, 1 - member.critChance) * (1 - member.avatarUptime);
    const extra = member.critMultiplier - 1;
    return (added * extra) / (1 + member.ecc * extra);
  }
  if (key === 'carnage') return (value * Math.min(0.15 * hp, 6 * member.level)) / hp;
  if (key === 'fatal_hold') {
    const extra = (LOW_HP_SHARE * value) / (1 + value);
    return extra / (1 - extra);
  }
  return 0;
};

const estimatedHpPerHour = ({ dataset, hunt, killsByMonster, roomsPerHour = 0 }, key) => {
  const hp = dataset.monsters[key]?.hp ?? 0;
  const kills = killsByMonster[key] ?? (key === hunt.bossKey ? roomsPerHour : 0);
  return hp * kills + (key === hunt.bossKey ? hp * roomsPerHour * ((dataset.bossWave?.hpMult ?? 3) - 1) : 0);
};

const hpPerHour = (context, key) => context.dealtPerHour?.[key] ?? estimatedHpPerHour(context, key);

export const creatureWeights = (context) => {
  const raw = creatures(context.hunt).map((key) => [key, hpPerHour(context, key)]);
  const total = sum(raw.map(([, w]) => w)) || 1;
  return Object.fromEntries(raw.map(([key, w]) => [key, w / total]));
};

const FAMILIES = {
  ...Object.fromEntries([...PER_HIT].map((key) => [key, 'proc'])),
  savage_blow: 'crit',
  low_blow: 'crit',
  fatal_hold: 'fatal',
  carnage: 'carnage',
};

export const familyOf = (key) => FAMILIES[key] ?? null;

export const NO_CALIBRATION = { proc: 1, crit: 1, fatal: 1, carnage: 1, source: null };

export const DEFAULT_CALIBRATION = {
  ...NO_CALIBRATION,
  proc: 1.11,
  source: 'Infernal Demon, 27/09 (procs) e Bloated Man-Maggot, 01/10 (Savage Blow e Fatal Hold)',
};

export const damageGain = ({ dataset, charmKey, tier, monsterKey, party, calibration = NO_CALIBRATION }) => {
  const charm = dataset.charms.find((c) => c.key === charmKey);
  const monster = { ...dataset.monsters[monsterKey], charmElement: charm?.element };
  const value = charmValue(dataset, charmKey, tier);
  const factor = calibration[familyOf(charmKey)] ?? 1;
  return factor * sum(party.map((member) => member.share * memberGain(charmKey, value, monster, member)));
};

const geometricMean = (xs) => Math.exp(sum(xs.map(Math.log)) / xs.length);

const charmDamageOn = (measured, monster) => sum(measured
  .filter((m) => familyOf(m.key) && m.monster === monster)
  .map((m) => m.damagePerHour));

export const calibrate = ({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour = null, party, measured, assigned, fallbackHit = null, source, base = DEFAULT_CALIBRATION }) => {
  const members = normalizeParty(party, fallbackHit);
  const context = { dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour };
  const withoutCharms = (monster) => hpPerHour(context, monster) - charmDamageOn(measured, monster);
  const ratios = measured
    .filter((m) => familyOf(m.key) && m.monster && m.damagePerHour > 0 && assigned[m.key])
    .map((m) => {
      const observed = m.damagePerHour / withoutCharms(m.monster);
      const predicted = damageGain({ dataset, charmKey: m.key, tier: assigned[m.key].tier ?? 3, monsterKey: m.monster, party: members });
      return { family: familyOf(m.key), ratio: observed > 0 && predicted > 0 ? observed / predicted : null };
    })
    .filter((r) => r.ratio > 0);
  if (!ratios.length) return base;
  const factorOf = (family) => {
    const list = ratios.filter((r) => r.family === family).map((r) => r.ratio);
    return list.length ? geometricMean(list) : base[family] ?? 1;
  };
  const families = Object.keys(NO_CALIBRATION).filter((key) => key !== 'source');
  return { ...Object.fromEntries(families.map((family) => [family, factorOf(family)])), source, measured: ratios.length };
};

const bestAssignment = (keys, options) => {
  const memo = new Map();
  const solve = (index, used) => {
    if (index === keys.length) return { score: 0, picks: [] };
    const memoKey = `${index}|${used}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    const skip = solve(index + 1, used);
    const best = options.reduce((acc, option, j) => {
      if (used & (1 << j)) return acc;
      const gain = option.gains[keys[index]] ?? 0;
      if (gain <= 0) return acc;
      const rest = solve(index + 1, used | (1 << j));
      const score = gain + rest.score;
      return score > acc.score ? { score, picks: [{ monster: keys[index], charm: option.key, gain }, ...rest.picks] } : acc;
    }, skip);
    memo.set(memoKey, best);
    return best;
  };
  return solve(0, 0);
};

export const measuredCharms = ({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour = null, charmStats, assigned }) => {
  if (!charmStats?.rows?.length || !(charmStats.ms > 0)) return [];
  const hours = charmStats.ms / 3600000;
  return charmStats.rows.map((row) => {
    const charm = dataset.charms.find((c) => c.id === row.id);
    const slot = charm ? assigned[charm.key] : null;
    const chance = charm && slot ? charmValue(dataset, charm.key, slot.tier ?? 3) : 0;
    const procsPerHour = (row.n ?? 0) / hours;
    const hitsPerHour = PER_HIT.has(charm?.key) && chance > 0 ? procsPerHour / chance : null;
    const hp = slot ? hpPerHour({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour }, slot.monster) : 0;
    return {
      key: charm?.key ?? String(row.id),
      name: charm?.name ?? `#${row.id}`,
      monster: slot?.monster ?? null,
      procsPerHour,
      damagePerHour: (row.v ?? 0) / hours,
      perProc: row.n ? (row.v ?? 0) / row.n : null,
      avgHit: hitsPerHour && hp ? hp / hitsPerHour : null,
    };
  });
};

export const partyAvgHit = (measured) => {
  const hits = measured.map((m) => m.avgHit).filter((v) => v > 0);
  return hits.length ? sum(hits) / hits.length : null;
};

export const bestiaryLock = ({ dataset, killsByMonster, bestiary }, key) => {
  const have = bestiary?.[key];
  if (have == null) return null;
  const goal = bestiaryGoal(dataset.monsters[key]?.exp ?? 0);
  if (have >= goal) return null;
  const perHour = killsByMonster[key] ?? 0;
  return { have, goal, remaining: goal - have, hours: perHour > 0 ? (goal - have) / perHour : Infinity };
};

const unlockGain = (keys, options, key, base) => {
  const unlocked = bestAssignment([...keys, key], options);
  const pick = unlocked.picks.find((p) => p.monster === key);
  return pick ? { charm: pick.charm, huntGain: unlocked.score - base.score } : null;
};

export const charmPlan = ({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour = null, lootPcts, party, owned, bossRollsLoot, quantities = {}, bestiary = null, fallbackHit = null, calibration = DEFAULT_CALIBRATION }) => {
  const keys = creatures(hunt);
  const weights = creatureWeights({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour });
  const members = normalizeParty(party, fallbackHit);
  const ownedOf = (category) => dataset.charms
    .filter((c) => c.category === category && owned[c.key])
    .map((c) => ({ key: c.key, name: c.name, tier: owned[c.key] }));
  const withGains = (list) => list.map((c) => {
    const perCreature = Object.fromEntries(keys.map((k) => [k, damageGain({ dataset, charmKey: c.key, tier: c.tier, monsterKey: k, party: members, calibration })]));
    return { ...c, perCreature, gains: Object.fromEntries(keys.map((k) => [k, perCreature[k] * weights[k]])) };
  });

  const majors = withGains(ownedOf('major').filter((c) => DAMAGE_MAJORS.has(c.key)));
  const locks = Object.fromEntries(keys.map((k) => [k, bestiaryLock({ dataset, killsByMonster, bestiary }, k)]));
  const majorKeys = keys.filter((k) => !locks[k]);
  const majorPick = bestAssignment(majorKeys, majors);

  const lootPlans = charmPlans({ dataset, hunt, killsByMonster, roomsPerHour, lootPcts, owned, bossRollsLoot, quantities });
  const [loot] = lootPlans;
  const lootMonsters = new Set(Object.values(loot.charms).map((c) => c.monster));
  const damageMinors = withGains(ownedOf('minor').filter((c) => DAMAGE_MINORS.has(c.key)));
  const minorPick = bestAssignment(keys.filter((k) => !lootMonsters.has(k)), damageMinors);

  const rows = keys.map((key) => {
    const major = majorPick.picks.find((p) => p.monster === key);
    const lootCharm = Object.entries(loot.charms).find(([, c]) => c.monster === key);
    const damageMinor = minorPick.picks.find((p) => p.monster === key);
    const unlock = locks[key] && unlockGain(majorKeys, majors, key, majorPick);
    return {
      monster: key,
      name: dataset.monsters[key]?.name ?? key,
      boss: key === hunt.bossKey,
      weight: weights[key],
      major: major ? { charm: major.charm, huntGain: major.gain, creatureGain: major.gain / weights[key] } : null,
      locked: locks[key] ? { ...locks[key], ...unlock } : null,
      minor: lootCharm
        ? { charm: lootCharm[0], kind: 'loot' }
        : damageMinor ? { charm: damageMinor.charm, kind: 'damage', huntGain: damageMinor.gain, creatureGain: damageMinor.gain / weights[key] } : null,
    };
  });

  return {
    rows,
    majors,
    lootPlans,
    loot,
    damageTotal: majorPick.score + minorPick.score,
    estimatedHit: members.some((m) => m.estimatedHit),
  };
};

export const currentDamage = ({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour = null, party, assigned, fallbackHit = null, calibration = DEFAULT_CALIBRATION }) => {
  const weights = creatureWeights({ dataset, hunt, killsByMonster, roomsPerHour, dealtPerHour });
  const members = normalizeParty(party, fallbackHit);
  return sum(Object.entries(assigned)
    .filter(([key, a]) => a?.monster && weights[a.monster] != null && (DAMAGE_MAJORS.has(key) || DAMAGE_MINORS.has(key)))
    .map(([key, a]) => weights[a.monster] * damageGain({ dataset, charmKey: key, tier: a.tier ?? 3, monsterKey: a.monster, party: members, calibration })));
};

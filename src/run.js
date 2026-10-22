import { perObject } from './memo.js';

export const WAVE_SIZES = [4, 4, 5, 5, 6, 6, 7, 7, 8];
export const ATTACK_INTERVAL_MS = 2000;
export const BOSS_EXP_MULT = 5;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const average = ([min, max]) => (min + max) / 2;
const perSecond = (intervalMs = ATTACK_INTERVAL_MS) => 1000 / intervalMs;

const addTo = (acc, [element, dps]) => ({ ...acc, [element]: (acc[element] ?? 0) + dps });

const abilityDps = ({ min, max, chance, interval }) => average([min, max]) * (chance / 100) * perSecond(interval);

const damageOf = (monster) => {
  const melee = average(monster?.dmg ?? [0, 0]) * perSecond();
  const abilities = (monster?.abilities ?? []).filter((a) => a.element !== 'healing');
  const byElement = abilities
    .map((a) => [a.element, abilityDps(a)])
    .reduce(addTo, melee > 0 ? { physical: melee } : {});
  return { dps: sum(Object.values(byElement)), byElement };
};

const cachedDamage = perObject(damageOf);

export const monsterDamage = (monster) => (monster ? cachedDamage(monster) : damageOf(monster));

export const spawnShares = (hunt) => {
  const weights = hunt.weights?.length === hunt.monsters.length ? hunt.weights : hunt.monsters.map(() => 1);
  const total = sum(weights);
  return hunt.monsters.map((key, i) => [key, weights[i] / total]);
};

const scaleElements = (byElement, factor) =>
  Object.fromEntries(Object.entries(byElement).map(([element, dps]) => [element, dps * factor]));

const mergeElements = (list) => list.flatMap((byElement) => Object.entries(byElement)).reduce(addTo, {});

export const huntRun = (dataset, hunt) => {
  const mobs = sum(WAVE_SIZES);
  const boss = hunt.bossKey ? dataset.monsters[hunt.bossKey] : null;
  const { hpMult = 1 } = dataset.bossWave ?? {};
  const creatures = spawnShares(hunt).map(([key, share]) => {
    const monster = dataset.monsters[key] ?? {};
    return { monster: key, name: monster.name ?? key, kills: mobs * share, exp: monster.exp ?? 0, hp: monster.hp ?? 0, ...monsterDamage(monster) };
  });
  const perMob = (field) => sum(creatures.map((c) => c[field] * c.kills)) / mobs;
  const mobXp = sum(creatures.map((c) => c.exp * c.kills));
  const bossXp = (boss?.exp ?? 0) * BOSS_EXP_MULT;
  const bossDamage = monsterDamage(boss);
  const mobElements = mergeElements(creatures.map((c) => scaleElements(c.byElement, c.kills / mobs)));
  return {
    hunt: hunt.id,
    name: hunt.name,
    minLevel: hunt.minLevel,
    kills: mobs + (boss ? 1 : 0),
    xp: mobXp + bossXp,
    mobXp,
    bossXp,
    hp: perMob('hp') * mobs + (boss?.hp ?? 0) * hpMult,
    mobDps: perMob('dps'),
    mobElements,
    packDps: perMob('dps') * Math.min(hunt.maxAlive ?? 1, Math.max(...WAVE_SIZES)),
    boss: boss ? { monster: hunt.bossKey, name: boss.name, hp: boss.hp * hpMult, exp: bossXp, dps: bossDamage.dps, byElement: bossDamage.byElement } : null,
    creatures,
  };
};

export const huntRuns = (dataset) => dataset.hunts.map((hunt) => huntRun(dataset, hunt));

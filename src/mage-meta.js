import { spellAverage } from './spells.js';
import { perObject } from './memo.js';

export const META_RUNES = ['Avalanche', 'Thunderstorm', 'Stone Shower', 'Great Fireball'];

export const MAGE_META = {
  sorcerer: { ultimates: ["Rage of the Skies", "Hell's Core"], forks: [], optional: ['Death Echo'], elements: ['energy', 'fire'] },
  druid: { ultimates: ['Wrath of Nature', 'Eternal Winter'], forks: ['Forked Glacier', 'Forked Thorns'], optional: [], elements: ['ice', 'earth'] },
};

export const MIN_SWAP_GAIN = 0.05;

const pct = (value) => (value ?? 0) / 100;

const maxOf = (name) => `Max ${name}`;

export const isMage = (vocation) => Boolean(MAGE_META[vocation]);

export const elementBonus = (member, element) => member?.elements?.[element] ?? {};

export const effectiveResist = (resist, pierce = 0) => (resist > 0 ? Math.max(0, resist - pierce) : resist);

export const spellPower = ({ spell, member, resist }) => {
  const bonus = elementBonus(member, spell.element);
  const magicLevel = member?.magicLevel ? member.magicLevel + (bonus.magicLevel ?? 0) : member?.magicLevel;
  const base = spellAverage(spell, { ...member, magicLevel }) ?? 1;
  const critChance = Math.min(1, pct(member?.critChance) + pct(bonus.critChance));
  const crit = 1 + critChance * (pct(member?.critDmg) + pct(bonus.critDmg));
  const targets = spell.chain?.targets ?? 1;
  return base * targets * crit
    * (1 + pct(bonus.dmgPct))
    * (1 + pct(member?.spellAugments?.[spell.name]))
    * (1 - effectiveResist(resist?.[spell.element] ?? 0, bonus.pierce) / 100);
};

const NO_SPELLS = [];

const byName = perObject((spells) => Object.fromEntries(spells.map((spell) => [spell.name, spell])));

const usable = (member, cast) => (spell) => spell
  && spell.vocs.includes(member.vocation)
  && (member.level == null || (spell.level ?? 0) <= member.level)
  && (!spell.spec || cast?.has(spell.words));

const affinity = (member) => (spell) => {
  const index = MAGE_META[member.vocation]?.elements.indexOf(spell.element) ?? -1;
  return index < 0 ? Infinity : index;
};

const ranked = (spells, member, resist) => spells
  .map((spell) => ({ spell, power: spellPower({ spell, member, resist }) }))
  .sort((a, b) => b.power - a.power || affinity(member)(a.spell) - affinity(member)(b.spell));

const runeCandidates = (names, member, cast) => META_RUNES
  .map((name) => [names[maxOf(name)], names[name]].find(usable(member, cast)))
  .filter(Boolean);

export const metaRotation = ({ dataset, member, resist, cast = new Set() }) => {
  const meta = MAGE_META[member.vocation];
  if (!meta) return null;
  const names = byName(dataset.spells ?? NO_SPELLS);
  const pick = (list) => list.map((name) => names[name]).filter(usable(member, cast));
  const forks = ranked(pick(meta.forks), member, resist);
  const runes = ranked(runeCandidates(names, member, cast), member, resist);
  return {
    ultimates: pick(meta.ultimates),
    fork: forks[0]?.spell ?? null,
    forks,
    rune: runes[0]?.spell ?? null,
    runes,
    optional: pick(meta.optional),
  };
};

export const metaSpells = (rotation) => (rotation
  ? [
    ...rotation.ultimates.map((spell) => ({ spell, role: 'ultimate' })),
    ...(rotation.fork ? [{ spell: rotation.fork, role: 'fork' }] : []),
    ...(rotation.rune ? [{ spell: rotation.rune, role: 'rune' }] : []),
    ...rotation.optional.map((spell) => ({ spell, role: 'optional' })),
  ]
  : []);

export const isMetaRune = (spell) => META_RUNES.some((name) => spell?.name === name || spell?.name === maxOf(name));

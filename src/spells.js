const ELEMENT_WORDS = [
  [/\bfrigo\b/, 'ice'],
  [/\b(tera|pox)\b/, 'earth'],
  [/\bvis\b/, 'energy'],
  [/\bflam\b/, 'fire'],
  [/\bmort\b/, 'death'],
  [/\bsan\b/, 'holy'],
];

export const elementOf = (words) => ELEMENT_WORDS.find(([pattern]) => pattern.test(words))?.[1] ?? 'physical';

export const spellIndex = (spells = []) => Object.fromEntries(spells.map((spell) => [spell.words, spell]));

const apply = ([perLevel, perMagic, constant], { level, magicLevel }) => perLevel * level + perMagic * magicLevel + constant;

export const spellRange = (spell, member) => (spell?.formula && member?.level && member?.magicLevel
  ? [apply(spell.formula.min, member), apply(spell.formula.max, member)]
  : null);

export const spellAverage = (spell, member) => {
  const range = spellRange(spell, member);
  return range ? (range[0] + range[1]) / 2 : null;
};

const round6 = (n) => Math.round(n * 1e6) / 1e6;

const LINEARITY_PROBE = [987, 163];

const fitLinear = (dmg) => {
  if (typeof dmg !== 'function' || dmg.length > 2) return null;
  try {
    const at = (level, magicLevel) => dmg(level, magicLevel);
    const origin = at(0, 0);
    const byLevel = at(1, 0);
    const byMagic = at(0, 1);
    const coefficients = (index) => [byLevel[index] - origin[index], byMagic[index] - origin[index], origin[index]];
    const exact = { min: coefficients(0), max: coefficients(1) };
    const probe = at(...LINEARITY_PROBE);
    const linear = [exact.min, exact.max].every((line, index) => Math.abs(apply(line, { level: LINEARITY_PROBE[0], magicLevel: LINEARITY_PROBE[1] }) - probe[index]) < 1e-6 * Math.max(1, Math.abs(probe[index])));
    return linear ? { min: exact.min.map(round6), max: exact.max.map(round6) } : null;
  } catch {
    return null;
  }
};

export const toSpell = ({ words, name, vocs, level, mana, cd, type, radius, chain, echo, goldCost, dmg }) => ({
  words,
  name,
  vocs,
  level,
  mana,
  cd,
  type,
  element: elementOf(words),
  rune: goldCost != null,
  ...(goldCost != null ? { goldCost } : {}),
  ...(radius != null ? { radius } : {}),
  ...(chain ? { chain } : {}),
  ...(echo?.delayMs ? { echoMs: echo.delayMs } : {}),
  formula: fitLinear(dmg),
});

export const attackSpells = (spells) => spells.filter((spell) => spell.type !== 'heal' && spell.dmg).map(toSpell);

export const hookSpells = (spells) => spells.map(({ words, vocs, element, echoMs }) => ({ words, vocs, element, ...(echoMs ? { echoMs } : {}) }));

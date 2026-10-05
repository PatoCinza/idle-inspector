const toNumber = (text) => Number(String(text).replace(/\./g, '').replace(',', '.'));
const toDecimal = (text) => Number(String(text).replace(',', '.'));

export const VOCATIONS = /^(Knight|Druid|Sorcerer|Paladin|Monk) \u00b7 (.+)$/;
export const STATS_HEADER = /^(B\u00f4nus|Bonuses) \((itens|items)/i;

const SECTION_START = /(?:B\u00f4nus \(itens|Bonuses \(items)[^)]*\)/i;
const SECTION_END = /(?:Profici\u00eancia|Proficiency|Addon)\s*\(/i;
const PROFICIENCY_START = /(?:Profici\u00eancia|Proficiency)\s*\([^)]*\)/i;
const PROFICIENCY_END = /Addon\s*\(|Stats dos itens|Item stats/i;
const PROFICIENCY_LEVEL = /(?:n\u00edvel|level)\s*(\d+)\s*\/\s*(\d+)/i;
const PROFICIENCY_BONUS = /([^\n+\d][^\n+]*?)\s*\+\s*([\d.,]+)\s*(%?)/g;
const SKILL = /(Magic|Fist|Sword|Axe|Club|Distance|Shielding)\s*(\d+)\s*(?:\+\s*(\d+))?/g;

const skillsOf = (text) => Object.fromEntries(
  [...text.split(SECTION_START)[0].matchAll(SKILL)]
    .map(([, name, base, bonus]) => [name.toLowerCase(), { base: Number(base), bonus: Number(bonus ?? 0) }]),
);

const proficiencyOf = (text) => {
  const section = text.split(PROFICIENCY_START)[1]?.split(PROFICIENCY_END)[0];
  if (section === undefined) return null;
  const level = section.match(PROFICIENCY_LEVEL);
  const rest = level ? section.slice(level.index + level[0].length) : section;
  return {
    weapon: level ? section.slice(0, level.index).trim() || null : null,
    level: level ? Number(level[1]) : null,
    maxLevel: level ? Number(level[2]) : null,
    bonuses: [...rest.matchAll(PROFICIENCY_BONUS)].map(([, label, value, pct]) => ({ label: label.trim(), value: toDecimal(value), pct: pct === '%' })),
  };
};

export const parseCharacter = (text) => {
  const head = text.split(/Capacidade|Capacity/i)[0];
  const bonus = text.split(SECTION_START)[1]?.split(SECTION_END)[0] ?? '';
  const percent = (pattern) => {
    const match = bonus.match(pattern);
    return match ? toDecimal(match[1]) : 0;
  };
  const skills = skillsOf(text);
  const proficiency = proficiencyOf(text);
  return {
    level: toNumber(head.match(/(?:N\u00edvel|Level)\s*([\d.]+)/i)?.[1] ?? 0),
    maxHp: toNumber(head.match(/(?:Pontos de Vida|Hit Points)\s*([\d.]+)/i)?.[1] ?? 0),
    maxMana: toNumber(head.match(/Mana\s*([\d.]+)/i)?.[1] ?? 0),
    lootPct: percent(/Loot\s*\+?([\d.,]+)%/i),
    critChance: percent(/(?:Chance de cr\u00edtico|Crit chance)\s*\+?([\d.,]+)%/i),
    critDmg: percent(/(?:Dano cr\u00edtico|Crit damage)\s*\+?([\d.,]+)%/i),
    spellDmgPct: percent(/(?:Dano de magia|Spell damage|Magic damage)\s*\+?([\d.,]+)%/i),
    ...(skills.magic ? { magicLevel: skills.magic.base + skills.magic.bonus, skills } : {}),
    ...(proficiency ? { proficiency } : {}),
  };
};

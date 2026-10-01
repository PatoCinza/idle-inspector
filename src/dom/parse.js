const toNumber = (text) => Number(String(text).replace(/\./g, '').replace(',', '.'));

export const VOCATIONS = /^(Knight|Druid|Sorcerer|Paladin|Monk) \u00b7 (.+)$/;
export const STATS_HEADER = /^(B\u00f4nus|Bonuses) \((itens|items)/i;

const SECTION_START = /B\u00f4nus \(itens|Bonuses \(items/i;
const SECTION_END = /^\s*(Profici\u00eancia|Proficiency|Addon)/im;
const REST_OF_LINE = /^[^\n]*\n?/;

export const parseCharacter = (text) => {
  const head = text.split(/Capacidade|Capacity/i)[0];
  const bonus = text.split(SECTION_START)[1]?.replace(REST_OF_LINE, '').split(SECTION_END)[0] ?? '';
  const percent = (pattern) => {
    const match = bonus.match(pattern);
    return match ? Number(match[1].replace(',', '.')) : 0;
  };
  return {
    level: toNumber(head.match(/(?:N\u00edvel|Level)\s*([\d.]+)/i)?.[1] ?? 0),
    maxHp: toNumber(head.match(/(?:Pontos de Vida|Hit Points)\s*([\d.]+)/i)?.[1] ?? 0),
    maxMana: toNumber(head.match(/Mana\s*([\d.]+)/i)?.[1] ?? 0),
    lootPct: percent(/Loot\s*\+?([\d.,]+)%/i),
    critChance: percent(/(?:Chance de cr\u00edtico|Crit chance)\s*\+?([\d.,]+)%/i),
    critDmg: percent(/(?:Dano cr\u00edtico|Crit damage)\s*\+?([\d.,]+)%/i),
  };
};

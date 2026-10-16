const toNumber = (text) => Number(String(text).replace(/\./g, '').replace(',', '.'));

const XP_TIP = /([\d.]+)\s*XP\s*(?:para o n.vel|to level)\s*([\d.]+)/i;
const VOCATION_LEVEL = /^(Knight|Druid|Sorcerer|Paladin|Monk)\s*[^\w\s]\s*lvl\s*([\d.]+)/i;

export const parseXpTip = (tip) => {
  const match = String(tip ?? '').match(XP_TIP);
  return match ? { left: toNumber(match[1]), nextLevel: toNumber(match[2]) } : null;
};

export const parseMemberCard = ({ text, tip, dead = false }) => {
  const xp = parseXpTip(tip);
  const lines = String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const at = lines.findIndex((line) => VOCATION_LEVEL.test(line));
  if (!xp || at < 1) return null;
  const [, vocation] = lines[at].match(VOCATION_LEVEL);
  return { name: lines[at - 1], vocation: vocation.toLowerCase(), level: xp.nextLevel - 1, left: xp.left, dead: Boolean(dead) };
};

export const readPartyXp = (doc) => [...doc.querySelectorAll('.bar.xp[data-tip]')]
  .map((bar) => {
    const card = bar.closest('.member');
    return parseMemberCard({ text: card?.innerText ?? '', tip: bar.dataset.tip, dead: card?.classList.contains('dead') });
  })
  .filter(Boolean);

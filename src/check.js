import { metaRotation, isMage, isMetaRune, elementBonus, spellPower, META_RUNES, MIN_SWAP_GAIN } from './mage-meta.js';
import { weightedResist, ELEMENTS } from './recommend.js';

export const CHARM_LOSS = { warn: 0.05, bad: 0.15 };

const item = (level, text) => ({ level, text });

const worstLevel = (items) => (['bad', 'warn'].find((level) => items.some((entry) => entry.level === level)) ?? 'ok');

const castSpells = (dataset, rotation, vocation) => {
  const words = new Set(Object.keys(rotation?.members?.[vocation]?.mobs?.spells ?? {}));
  return (dataset.spells ?? []).filter((spell) => words.has(spell.words));
};

const gainOver = (best, current) => (current > 0 ? best / current - 1 : Infinity);

const KIND = { rune: ['a runa', 'a runa certa'], fork: ['o fork', 'o fork certo'] };

const swapItem = ({ kind, used, best, member, resist }) => {
  const usedPower = spellPower({ spell: used, member, resist });
  const bestPower = spellPower({ spell: best, member, resist });
  const gain = gainOver(bestPower, usedPower);
  return gain >= MIN_SWAP_GAIN
    ? item('warn', `Troque ${used.name} por ${best.name}: ${KIND[kind][0]} rende ${Math.round(gain * 100)}% mais aqui.`)
    : item('ok', `${used.name} é ${KIND[kind][1]} aqui.`);
};

const ultimateItems = (expected, cast) => expected.map((spell) => (cast.some((s) => s.name === spell.name)
  ? item('ok', `${spell.name} na rotação.`)
  : item('bad', `Falta ${spell.name}: as duas Ultimate Explosions vão nos slots 1 e 2.`)));

const forkItems = (rotation, cast, member, resist) => {
  if (!rotation.fork) return [];
  const used = cast.filter((spell) => rotation.forks.some((f) => f.spell.name === spell.name));
  if (!used.length) return [item('bad', `Falta o fork: use ${rotation.fork.name}.`)];
  return used.map((spell) => swapItem({ kind: 'fork', used: spell, best: rotation.fork, member, resist }));
};

const runeItems = (rotation, cast, member, resist) => {
  const runes = cast.filter((spell) => spell.rune);
  const odd = runes.filter((spell) => !isMetaRune(spell))
    .map((spell) => item('warn', `${spell.name} não é runa de área boa de mirar; use ${rotation.rune?.name ?? META_RUNES.join(', ')}.`));
  const meta = runes.filter(isMetaRune);
  if (!rotation.rune) return odd;
  if (!meta.length) return [...odd, item('warn', `Nenhuma runa de área na rotação: use ${rotation.rune.name}.`)];
  return [...odd, ...meta.map((spell) => swapItem({ kind: 'rune', used: spell, best: rotation.rune, member, resist }))];
};

const extraItems = (rotation, cast) => {
  const known = new Set([...rotation.ultimates, ...rotation.forks.map((f) => f.spell), ...rotation.optional].map((spell) => spell.name));
  const extra = cast.filter((spell) => !spell.rune && !known.has(spell.name));
  return extra.length ? [item('warn', `Fora da rotação padrão: ${extra.map((spell) => spell.name).join(', ')}.`)] : [];
};

const spellCheck = ({ dataset, member, resist, rotation }) => {
  const cast = castSpells(dataset, rotation, member.vocation);
  const castSet = new Set(cast.map((spell) => spell.words));
  const meta = metaRotation({ dataset, member, resist, cast: castSet });
  if (!cast.length) return [item('warn', 'Rotação ainda não medida: cace alguns minutos.')];
  return [
    ...ultimateItems(meta.ultimates, cast),
    ...forkItems(meta, cast, member, resist),
    ...runeItems(meta, cast, member, resist),
    ...extraItems(meta, cast),
  ];
};

const bonusText = (member) => ELEMENTS
  .map((element) => [element, elementBonus(member, element).dmgPct ?? 0])
  .filter(([, value]) => value > 0)
  .map(([element, value]) => `dano ${element} +${value}%`);

const buildCheck = ({ dataset, member, resist }) => {
  const meta = metaRotation({ dataset, member, resist });
  const element = meta.rune?.element ?? meta.fork?.element;
  if (!element) return [];
  const bonuses = bonusText(member);
  const hitting = elementBonus(member, element).dmgPct ?? 0;
  const reminder = item('ok', `Aqui a runa${meta.fork ? ' e o fork batem' : ' bate'} de ${element} (resistência média ${Math.round(resist[element])}%): os pontos da build vão em dano de ${element} e magic level de ${element}.`);
  const current = bonuses.length ? item('ok', `Bônus lido hoje: ${bonuses.join(', ')}.`) : null;
  const mismatch = hitting <= 0 && bonuses.length
    ? item('warn', `A build não dá dano de ${element}. Mude os pontos ou cace onde o elemento da build rende mais.`)
    : null;
  return [reminder, current, mismatch].filter(Boolean);
};

const memberCheck = ({ dataset, resist, rotation }) => (member) => {
  if (!isMage(member.vocation)) {
    return { name: member.name ?? member.vocation, vocation: member.vocation, build: [], spells: [item('ok', 'Sem regra de rotação para esta vocação ainda.')] };
  }
  const build = member.magicLevel
    ? buildCheck({ dataset, member, resist })
    : [item('warn', 'Party não lida: use "Ler party e charms" para conferir a build.')];
  const spells = spellCheck({ dataset, member, resist, rotation });
  return { name: member.name ?? member.vocation, vocation: member.vocation, build, spells, level: worstLevel([...build, ...spells]) };
};

const plannedOf = (row) => [row.majorName, row.minorName].filter(Boolean);

export const charmCheck = (table) => {
  if (!table?.ready) return { ready: false, reason: table?.reason ?? 'hunt', items: [] };
  const rows = table.rows.filter((row) => plannedOf(row).length);
  const missing = rows.flatMap((row) => plannedOf(row)
    .filter((name) => !row.equipped.includes(name))
    .map((name) => ({ name, monster: row.name })));
  const loss = table.currentDamage !== null && table.damageTotal > 0 ? 1 - table.currentDamage / table.damageTotal : null;
  const lossLevel = loss === null ? 'ok' : loss >= CHARM_LOSS.bad ? 'bad' : loss >= CHARM_LOSS.warn ? 'warn' : 'ok';
  const items = [
    ...missing.map((m) => item(missing.length > 1 ? 'bad' : 'warn', `${m.name} deveria estar em ${m.monster}.`)),
    loss === null || loss <= 0 ? null : item(lossLevel, `Os charms de dano equipados rendem ${Math.round(loss * 100)}% menos que o plano.`),
  ].filter(Boolean);
  return { ready: true, items: items.length ? items : [item('ok', 'Charms iguais ao plano.')] };
};

export const idiotCheck = ({ dataset, hunt, party, rotation, charms }) => {
  if (!hunt) return { ready: false, reason: 'hunt' };
  const resist = weightedResist(dataset, hunt);
  const members = (party ?? []).map(memberCheck({ dataset, resist, rotation }));
  const charm = charmCheck(charms);
  return {
    ready: true,
    hunt,
    members,
    charms: charm,
    level: worstLevel([...members.flatMap((m) => [...m.build, ...m.spells]), ...charm.items]),
    partyRead: Boolean(party?.length),
  };
};

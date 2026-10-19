import { escapeHtml } from './view.js';
import { formatCount, formatGold, formatInteger, formatDate } from './format.js';
import { RISK, MIN_PROTECTION_SHARE } from '../recommend.js';

const OBJECTIVE_LABELS = { xp: 'XP/h', profit: 'Lucro/h' };

const VOCATION_SHORT = { sorcerer: 'MS', knight: 'EK', druid: 'ED', paladin: 'RP', monk: 'EM' };

const SOURCE = {
  live: { label: 'ao vivo', tip: 'Ritmo da medição desta sessão' },
  saved: { label: 'medido', tip: 'Ritmo da última medição desta hunt' },
  estimated: { label: 'estimado', tip: 'Estimado pela hunt de referência: o dano da party contra o HP da sala depois das resistências, mais o tempo fixo por sala' },
};

const RISK_PILL = {
  ok: ['good', 'ok'],
  caution: ['warn', 'atenção'],
  risky: ['bad', 'arriscada'],
};

const money = (value) => (value < 0 ? `−${formatGold(-value)}` : formatGold(value));

const signedPct = (value) => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${formatInteger(Math.abs(rounded))}%`;
};

const tip = (text, title) => (title ? `<span class="tip" title="${escapeHtml(title)}">${text}</span>` : text);

export const renderHuntObjectiveNav = (active) => `<nav class="tabs subtabs">${Object.entries(OBJECTIVE_LABELS)
  .map(([id, label]) => `<button class="tab${id === active ? ' active' : ''}" data-hunt-objective="${id}">Otimizar ${label}</button>`)
  .join('')}</nav>`;

const huntCell = (row) => {
  const level = `<small class="${row.belowLevel ? 'warn' : 'dim'}"${row.belowLevel ? ' title="Abaixo do level sugerido pelo jogo"' : ''}>lvl ${formatInteger(row.hunt.minLevel ?? 0)}</small>`;
  const marks = [row.current ? '<span class="pill good">atual</span>' : '', row.reference && !row.current ? '<span class="pill">referência</span>' : ''].join('');
  return `${escapeHtml(row.hunt.name)} ${level}${marks ? ` ${marks}` : ''}`;
};

const ratesCell = (rates) => (rates
  ? `${formatCount(rates.roomsPerHour)} ${tip(`<small class="dim">${SOURCE[rates.source].label}</small>`, SOURCE[rates.source].tip)}`
  : '—');

const profitTip = (row) => (row.rates
  ? `Loot ${formatGold(row.lootPerHour)}/h − supplies ${formatGold(row.suppliesPerHour)}/h${row.rates.suppliesPerHour == null ? ' (supplies da hunt de referência)' : ''}`
  : '');

const spellLabel = (spell) => `${spell.name} (${spell.element} ${signedPct(spell.resist)}${spell.role === 'optional' ? ', opcional' : ''})`;

const memberLine = (member) => `${VOCATION_SHORT[member.vocation] ?? member.vocation}: ${member.spells.length
  ? member.spells.map(spellLabel).join(', ')
  : 'sem magia em área'}`;

const offenseCell = ({ offense }) => {
  const best = offense.best.map(({ element, resist }) => `${escapeHtml(element)} <small class="dim">${signedPct(resist)}</small>`).join(' · ');
  const lines = [
    ...offense.members.map(memberLine),
    offense.worst ? `Evite ${offense.worst.element} (${signedPct(offense.worst.resist)})` : '',
    offense.efficiency === null ? '' : `A mistura de elementos medida rende ${formatCount(offense.efficiency * 100)}% de todo o dano no melhor elemento`,
  ].filter(Boolean);
  return tip(best, lines.join('\n'));
};

const defenseTip = ({ defense }) => [
  defense.takenPerSecond === null ? `Dano bruto dos monstros: ${formatGold(defense.raw)}/s` : `Recebido estimado: ${formatGold(defense.takenPerSecond)}/s`,
  defense.ratio === null ? 'Sem hunt caçada para comparar' : `${formatCount(defense.ratio)}× o dano da ${defense.baseline.name}, a hunt mais pesada que vocês já caçaram, depois das suas proteções`,
  defense.worst ? `Maior fonte: ${defense.worst.element} (${formatCount(defense.worst.share * 100)}% do recebido, sua proteção média ${formatCount(defense.worst.protection)}%)` : '',
  defense.hitter ? `Quem mais bate: ${defense.hitter.name} (candidata a Parry ou Dodge)` : '',
].filter(Boolean).join('\n');

const defenseCell = (row) => {
  const [kind, label] = RISK_PILL[row.defense.risk] ?? ['', '—'];
  const ratio = row.defense.ratio === null ? '' : ` <small class="dim">${formatCount(row.defense.ratio)}×</small>`;
  const worst = row.defense.worst ? ` <small class="dim">${escapeHtml(row.defense.worst.element)}</small>` : '';
  return tip(`<span class="pill ${kind}">${label}</span>${ratio}${worst}`, defenseTip(row));
};

const protectionLine = (imbuement) => `${imbuement.name}: ${imbuement.element} é ${formatCount(imbuement.share * 100)}% do dano recebido, a versão Powerful corta ${formatCount(imbuement.reduction * 100)}% do total`;

const damageLine = (damage) => `${damage.name} na arma (${damage.vocations.map((vocation) => VOCATION_SHORT[vocation] ?? vocation).join(', ')}): converte dano físico em ${damage.element} (resistência média ${signedPct(damage.resist)}), +${formatCount(damage.gain * 100)}% de dano da arma com a Powerful`;

const imbuementCell = ({ imbuements }) => {
  const names = [...imbuements.protection.map((imbuement) => imbuement.name), ...(imbuements.damage ? [`${imbuements.damage.name} (arma)`] : [])];
  const lines = [...imbuements.protection.map(protectionLine), ...(imbuements.damage ? [damageLine(imbuements.damage)] : [])];
  return names.length ? tip(names.map(escapeHtml).join(' · '), lines.join('\n')) : '<span class="dim">—</span>';
};

const huntRow = (row, index) => `<tr class="${row.group === 'risky' || row.group === 'unrated' ? 'dim' : ''}${row.current ? ' current' : ''}">
  <td class="n">${index + 1}</td>
  <td class="wrap">${huntCell(row)}</td>
  <td class="n">${row.xpPerHour === null ? '—' : formatGold(row.xpPerHour)}</td>
  <td class="n">${row.profitPerHour === null ? '—' : tip(money(row.profitPerHour), profitTip(row))}</td>
  <td class="n">${ratesCell(row.rates)}</td>
  <td class="wrap">${offenseCell(row)}</td>
  <td>${defenseCell(row)}</td>
  <td class="wrap">${imbuementCell(row)}</td>
</tr>`;

const referenceLine = (table) => (table.reference
  ? `Referência: ${table.referenceHunt?.name ?? table.reference.huntId} · ${formatCount(3600 / table.reference.roomSeconds)} salas/h · ${formatCount(table.reference.overheadSeconds)} s por sala fora do dano · dano ${formatGold(table.reference.rawDps)}/s sem resistência${table.reference.t ? ` · ${formatDate(table.reference.t)}` : ''}`
  : 'Sem hunt de referência: cace pelo menos 2 min e 2 salas para estimar as outras hunts.');

const baselineLine = (table) => (table.baseline
  ? `Defesa comparada com a ${table.baseline.name}, a hunt mais pesada que vocês já caçaram.`
  : '');

const XP_SOURCE = {
  measured: (factor) => `XP: ${formatCount(factor)}× a exp base (medido pela XP que o jogo creditou)`,
  party: (factor) => `XP: ${formatCount(factor)}× a exp base (pelo XP% lido da party: líder 40%, demais 30%)`,
};

const xpLine = (table) => (table.xpSource ? XP_SOURCE[table.xpSource](table.xpFactor) : 'XP: exp base, sem bônus (leia a party ou cace alguns minutos para medir)');

const warnings = (table) => [
  table.partyRead ? '' : 'Party não lida: magias sem filtro de level e proteções em 0%. Use "Ler party e charms".',
  table.partyRead && !table.protectionRead ? 'Proteções por elemento não lidas: leia a party de novo para comparar a defesa.' : '',
].filter(Boolean).map((line) => `<p class="warn">${escapeHtml(line)}</p>`).join('');

export const renderHunts = (table) => `${renderHuntObjectiveNav(table.objective)}
  <p class="status">${escapeHtml(referenceLine(table))}</p>
  <p class="status">${escapeHtml(xpLine(table))}</p>
  ${table.baseline ? `<p class="status">${escapeHtml(baselineLine(table))}</p>` : ''}
  ${warnings(table)}
  <div class="scroll"><table>
    <thead><tr><th class="n">#</th><th>Hunt</th><th class="n">XP/h</th><th class="n">Lucro/h</th><th class="n">Salas/h</th><th>Ataque</th><th>Defesa</th><th>Imbuements</th></tr></thead>
    <tbody>${table.rows.map(huntRow).join('')}</tbody>
  </table></div>
  <p class="foot">XP por sala: 52 criaturas e o boss, que paga 5× a exp da criatura dele; a party divide 40% para o líder e 30% para cada outro, cada um com o próprio XP%. Ataque: elementos com menor resistência média na sala, pesada pelo HP; passe o mouse para as magias em área de cada personagem. Defesa: dano dos monstros por elemento depois das proteções lidas, comparado com a hunt mais pesada que vocês já caçaram por 2 min ou mais (atenção acima de ${formatCount(RISK.caution)}×, arriscada acima de ${formatCount(RISK.risky)}×). Imbuements: proteção para cada elemento com ${formatCount(MIN_PROTECTION_SHARE * 100)}% ou mais do dano recebido depois das suas proteções (físico não tem imbuement), e dano elemental na arma de knight, paladin e monk quando o elemento rende mais que o físico na sala; leech, crítico e skill valem para qualquer hunt e ficam de fora. A hunt de referência só calibra o recebido estimado em dano por segundo. Hunts estimadas supõem o mesmo dano e o mesmo tempo fixo por sala da referência.</p>`;

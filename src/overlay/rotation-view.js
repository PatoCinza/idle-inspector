import { escapeHtml } from './view.js';
import { formatCount, formatInteger, formatGold, formatPercent, formatMinutes } from './format.js';
import { GCD_MS, MIN_CASTS } from '../rotation-table.js';

const PERIOD_LABELS = { mobs: 'Ondas', boss: 'Sala do boss' };

export const renderRotationNav = (active) => `<nav class="tabs subtabs">${Object.entries(PERIOD_LABELS)
  .map(([id, label]) => `<button class="tab${id === active ? ' active' : ''}" data-rotation="${id}">${label}</button>`)
  .join('')}</nav>`;

const signedDamage = (value) => `${value < 0 ? '−' : '+'}${formatGold(Math.abs(value))}`;

const signedPercent = (value) => `${value < 0 ? '−' : '+'}${formatPercent(Math.abs(value))}`;

const formatShare = (fraction) => `${(fraction * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const plusMinus = (range) => (range ? ` <small class="dim">±${formatGold((range.high - range.low) / 2)}</small>` : '');

const ratioCell = (expected) => (expected
  ? `<span title="${escapeHtml(`Esperado ${formatInteger(expected.expectedPerHit)} por golpe sem crítico; medido ${formatInteger(expected.measuredPerHit)} (${formatInteger(expected.hits)} golpes)`)}">${formatCount(expected.ratio)} <small class="dim">±${formatCount((expected.high - expected.low) / 2)}</small></span>`
  : '—');

const critCell = ({ rate, multiplier }) => (rate === null ? '—' : `${formatPercent(rate)}${multiplier ? ` · ${formatCount(multiplier)}×` : ''}`);

const spellRow = (row) => `<tr>
  <td>${escapeHtml(row.name)}${row.rune ? ' <small class="dim">runa</small>' : ''}${row.echoShare ? ` <small class="dim" title="Parte do dano que veio do eco, 2 s depois do cast">eco ${formatPercent(row.echoShare)}</small>` : ''}</td>
  <td class="n">${formatInteger(row.casts)}${row.perMinute === null ? '' : ` <small class="dim">${formatCount(row.perMinute)}/min</small>`}</td>
  <td class="n">${formatGold(row.perCast)}${plusMinus(row.interval)}</td>
  <td class="n">${row.hitsPerCast === null ? '—' : formatCount(row.hitsPerCast)}</td>
  <td class="n">${critCell(row.crit)}</td>
  <td class="n">${formatShare(row.share)}</td>
  <td class="n">${ratioCell(row.expected)}</td>
</tr>`;

const looseRow = (row) => `<tr class="dim">
  <td>${escapeHtml(row.label)}</td>
  <td class="n">—</td><td class="n">—</td>
  <td class="n">${formatInteger(row.hits)} golpes</td>
  <td class="n">—</td>
  <td class="n">${formatShare(row.share)}</td>
  <td class="n">—</td>
</tr>`;

const VERDICT = {
  more: '<span class="pill good">rende mais</span>',
  less: '<span class="warn">rende menos</span>',
  tie: '<span class="dim">empate</span>',
};

const compareLine = (filler) => (item) => `<li>${VERDICT[item.verdict]} <b>${escapeHtml(item.name)}</b> × ${escapeHtml(filler.name)}: ${signedDamage(item.diff)} por cast (${signedPercent(item.pct)}; IC ${signedDamage(item.low)} a ${signedDamage(item.high)})${item.rooms ? ` <small class="dim">em ${formatInteger(item.rooms)} salas com as duas</small>` : ' <small class="dim">sem salas com as duas: comparação geral</small>'}</li>`;

const compareBlock = ({ filler, items }) => (filler && items.length
  ? `<ul class="compare">${items.map(compareLine(filler)).join('')}</ul>`
  : `<p class="foot">Sem comparação: falta uma magia de reserva (cooldown de ${GCD_MS / 1000} s) com ${MIN_CASTS} casts ou mais.</p>`);

const panelLine = (member) => [
  member.panel ? `Crítico do painel ${formatPercent(member.panel.chance)} · ${formatCount(member.panel.multiplier)}×` : null,
  member.proficiency?.weapon ? `proficiência ${member.proficiency.weapon}${member.proficiency.level ? ` ${member.proficiency.level}/${member.proficiency.maxLevel}` : ''}${member.proficiency.bonuses.length ? `: ${member.proficiency.bonuses.map((bonus) => `${bonus.label} +${formatCount(bonus.value)}${bonus.pct ? '%' : ''}`).join(', ')}` : ''}` : null,
].filter(Boolean).join(' · ');

const memberSection = (member) => `<h3>${escapeHtml(member.label)} <span class="status-pill">${formatGold(member.perMinute)}/min · ${formatGold(member.total)} no período</span></h3>
  ${panelLine(member) ? `<p class="foot">${escapeHtml(panelLine(member))}</p>` : ''}
  <table>
    <thead><tr><th>Magia</th><th class="n">Casts</th><th class="n" title="Média por cast ± metade do intervalo de 95%">Dano/cast</th><th class="n">Golpes/cast</th><th class="n">Crítico</th><th class="n">% do dano</th><th class="n" title="Dano medido sem crítico ÷ fórmula do jogo × Dano de magia × resistência da criatura">Medido/esperado</th></tr></thead>
    <tbody>${member.spells.map(spellRow).join('')}${member.loose.map(looseRow).join('')}</tbody>
  </table>
  ${compareBlock(member.compare)}`;

const changeLabel = (labels) => ({ voc, changes }) => `${labels[voc] ?? voc}: ${changes.join(', ')}`;

const roomRow = (labels) => (group) => `<tr${group.isBase ? ' class="bottleneck"' : ''}>
  <td>${group.isBase ? 'Mais medida' : escapeHtml(group.changes.map(changeLabel(labels)).join(' · '))}</td>
  <td class="n">${formatInteger(group.rooms)}${group.dropped ? ` <small class="dim">(−${formatInteger(group.dropped)})</small>` : ''}</td>
  <td class="n">${formatCount(group.seconds)} s</td>
  <td class="n dim">${group.interval ? `${formatCount(group.interval.low / 1000)}–${formatCount(group.interval.high / 1000)} s` : '—'}</td>
  <td class="n">${formatCount(group.perHour)}</td>
  <td class="n">${group.vsBase ? `${signedPercent(group.vsBase.change)} <small class="dim">(${signedPercent(group.vsBase.low)} a ${signedPercent(group.vsBase.high)})</small>` : '—'}</td>
</tr>`;

const roomsSection = (rooms, labels) => (rooms.length
  ? `<h3>Salas por rotação</h3>
    <table>
      <thead><tr><th>Diferença para a mais medida</th><th class="n">Salas</th><th class="n">Tempo médio</th><th class="n">IC 95%</th><th class="n">Salas/h</th><th class="n">vs mais medida</th></tr></thead>
      <tbody>${rooms.map(roomRow(labels)).join('')}</tbody>
    </table>`
  : '<p class="foot">Salas por rotação: aparecem a partir de 2 salas completas com a mesma rotação.</p>');

const WAITING = {
  mobs: 'Ainda sem casts medidos nas ondas. A tabela começa no primeiro cast de magia de ataque.',
  boss: 'Ainda sem casts medidos na sala do boss (onda 10).',
};

const FOOT = `Cada cast chega junto com o dano dele no mesmo instante; o eco do Death Echo entra 2 s depois. Ataque básico é o golpe que chega com o ataque da arma, e procs são golpes de outro elemento no instante do cast. Todas as magias de ataque dividem o cooldown global de ${GCD_MS / 1000} s, então uma magia de cooldown maior toma o lugar de um cast da reserva: a comparação mostra quanto ela rende a mais ou a menos por cast, nas salas em que as duas foram lançadas. O dano por cast depende de quantos alvos estão vivos no momento; o veredito final é o tempo de sala.`;

export const renderRotation = (table) => {
  if (!table.ready) return `${renderRotationNav(table.period)}<p class="waiting">${escapeHtml(WAITING[table.period])}</p>`;
  const labels = Object.fromEntries(table.members.map((member) => [member.voc, member.label]));
  return `${renderRotationNav(table.period)}
    <p class="status">${escapeHtml(`${formatMinutes(table.minutes.mobs)} de ondas · ${formatMinutes(table.minutes.boss)} de sala do boss`)}</p>
    ${table.partyRead ? '' : '<p class="warn">Level e magic level não lidos: use "Ler party e charms" para a coluna Medido/esperado.</p>'}
    <div class="scroll plans">
      ${table.members.map(memberSection).join('')}
      ${table.period === 'mobs' ? roomsSection(table.rooms, labels) : ''}
    </div>
    <p class="foot">${escapeHtml(FOOT)}</p>`;
};

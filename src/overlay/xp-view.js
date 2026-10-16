import { escapeHtml } from './view.js';
import { formatCount, formatGold, formatInteger, formatDuration, formatClock, formatPercent } from './format.js';
import { RECENT_ROOMS, MIN_RECENT_ROOMS } from '../xp-tracker.js';

const VOCATION_SHORT = { sorcerer: 'MS', knight: 'EK', druid: 'ED', paladin: 'RP', monk: 'EM' };

const perHour = (value) => (value === null ? '—' : `${formatGold(value)}/h`);

const waiting = (analysis) => {
  if (!analysis.current) return 'Aguardando a party aparecer na tela do jogo.';
  return `Medindo… o XP real aparece depois de 2 salas completas (${formatInteger(analysis.rooms)} até agora).`;
};

const teamLine = (analysis) => [
  `Equipe: ${perHour(analysis.team.sessionPerHour)} real`,
  analysis.team.recentPerHour === null ? '' : `últimas ${Math.min(RECENT_ROOMS, analysis.rooms)} salas ${perHour(analysis.team.recentPerHour)}`,
  `ao vivo ${perHour(analysis.team.livePerHour)} se o boss cair`,
].filter(Boolean).join(' · ');

const detailLine = (analysis) => [
  `${formatInteger(analysis.rooms)} salas desde ${formatClock(analysis.since)}`,
  `${formatGold(analysis.team.perRoom)} por sala`,
  `${formatCount(analysis.team.roomSeconds)} s por sala`,
  `XP Stack em risco ${formatGold(analysis.pending)} (paga inteira com o boss; quem morre leva só uma parte)`,
].join(' · ');

const memberRow = (member) => `<tr${member.dead ? ' class="dim"' : ''}>
  <td>${escapeHtml(member.name)} <small class="dim">${VOCATION_SHORT[member.vocation] ?? member.vocation}</small>${member.dead ? ' <span class="pill bad">morto</span>' : ''}</td>
  <td class="n">${formatInteger(member.level)}</td>
  <td class="n">${perHour(member.livePerHour)}</td>
  <td class="n">${perHour(member.recentPerHour ?? member.sessionPerHour)}</td>
  <td class="n">${formatPercent(member.share)}</td>
  <td class="n">${formatGold(member.toLevel)}</td>
  <td class="n">${member.hoursToLevel === null ? '—' : formatDuration(member.hoursToLevel)}</td>
  <td class="n">${member.deaths ? formatInteger(member.deaths) : '<span class="dim">0</span>'}</td>
</tr>`;

export const renderXp = (analysis) => {
  if (!analysis.ready) return `<p class="waiting">${escapeHtml(waiting(analysis))}</p>`;
  const basis = analysis.members.some((member) => member.recentPerHour !== null) ? `últimas ${RECENT_ROOMS} salas` : 'sessão';
  return `<p class="status"><b>${escapeHtml(teamLine(analysis))}</b></p>
    <p class="status">${escapeHtml(detailLine(analysis))}</p>
    <div class="scroll"><table>
      <thead><tr><th>Personagem</th><th class="n">Level</th><th class="n" title="XP creditada na sessão mais a parte dele da XP Stack da sala atual, que só é paga inteira quando o boss cai">XP/h ao vivo</th><th class="n" title="XP creditada ao fim das salas (${escapeHtml(basis)})">XP/h real</th><th class="n" title="Parte da XP da equipe que este personagem recebeu na sessão">Parte</th><th class="n">Falta</th><th class="n" title="Pelo XP/h real; atualizado a cada sala">Próximo level</th><th class="n" title="Salas que terminaram com ele morto">Mortes</th></tr></thead>
      <tbody>${analysis.members.map(memberRow).join('')}</tbody>
    </table></div>
    <p class="foot">XP real: a XP que o jogo credita a cada personagem ao fim de cada sala (lida da barra de experiência), dividida pelo tempo entre as salas. O XP/h do Hunt Analyzer conta a XP Stack ainda não paga e oscila dentro da sala; aqui só entra XP já creditada. "Ao vivo" soma a parte de cada um da XP Stack da sala atual, que o jogo só paga inteira quando o boss cai; quem morre antes leva só uma parte dela (a mensagem do jogo diz quanto), e o XP real já conta só o que foi pago. O tempo para o próximo level usa as últimas ${RECENT_ROOMS} salas (ou a sessão, com menos de ${MIN_RECENT_ROOMS}) e muda a cada sala completa.</p>`;
};

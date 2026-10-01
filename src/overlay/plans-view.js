import { escapeHtml } from './view.js';
import { formatCount, formatInteger, formatGold, formatPercent, formatDuration } from './format.js';

const meter = (have, goal) => `<span class="meter"><span style="width:${goal ? Math.min(100, (have / goal) * 100) : 0}%"></span></span>`;

const bestiaryRow = (row) => `<tr>
  <td>${escapeHtml(row.name)}</td>
  <td class="n">${formatInteger(row.goal)}</td>
  <td class="n">${formatInteger(row.have)}</td>
  <td class="n">${formatInteger(row.remaining)}</td>
  <td class="n">${row.remaining ? formatDuration(row.hours) : '<span class="pill good">completo</span>'}</td>
  <td>${meter(row.have, row.goal)}</td>
</tr>`;

export const renderBestiary = (table) => {
  if (!table.ready) return '<p class="waiting">Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.</p>';
  return `<div class="scroll"><table>
    <thead><tr><th>Criatura</th><th class="n">Meta</th><th class="n">Você tem</th><th class="n">Faltam</th><th class="n">Tempo</th><th>Progresso</th></tr></thead>
    <tbody>${table.rows.map(bestiaryRow).join('')}</tbody></table></div>
    <p class="foot">A meta segue a faixa de experiência da criatura (250, 500, 1.000 ou 2.500 kills). O tempo usa o ritmo de kills da janela atual; as kills do boss contam para a criatura dele.</p>`;
};

const codexStatus = (entry) => (entry.complete ? '<span class="pill good">completo</span>' : `<b>${formatDuration(entry.hours)}</b> de hunt`);

const codexItemRow = (entry) => (item) => `<tr class="${item.remaining && item.hours === entry.hours ? 'bottleneck' : ''}">
  <td>${escapeHtml(item.item)}</td>
  <td class="n">${formatInteger(item.have)}</td>
  <td class="n">${formatInteger(item.need)}</td>
  <td class="n">${formatInteger(item.remaining)}</td>
  <td class="n">${formatCount(item.perHour)}</td>
  <td class="n">${item.remaining ? formatDuration(item.hours) : '<span class="pill good">ok</span>'}</td>
  <td>${meter(item.have, item.need)}</td>
</tr>`;

const codexEntry = (hunt) => (entry) => `<h3>Domínio: ${escapeHtml(hunt.name)} ${escapeHtml(entry.step)} <span class="status-pill">${codexStatus(entry)}</span></h3>
  <table>
    <thead><tr><th>Item</th><th class="n">Tem</th><th class="n">Precisa</th><th class="n">Faltam</th><th class="n">Drops/h</th><th class="n">Tempo</th><th>Progresso</th></tr></thead>
    <tbody>${entry.items.map(codexItemRow(entry)).join('')}</tbody>
  </table>`;

export const renderCodex = (table) => {
  if (!table.ready) return '<p class="waiting">Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.</p>';
  if (!table.entries.length) return '<p class="waiting">Esta hunt não tem Codex de domínio.</p>';
  return `${table.read ? '' : '<p class="warn">Progresso do Codex ainda não lido: os números contam do zero. Ele chega quando o jogo enviar o inventário.</p>'}
    <div class="scroll plans">${table.entries.map(codexEntry(table.hunt)).join('')}</div>
    <p class="foot">O tempo de cada etapa é o do item mais lento (linha destacada). Os drops/h vêm da aba Drops, então dependem de 2 min de medição e da party lida.</p>`;
};

const BLOCKED = {
  hunt: 'Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.',
  window: 'Medindo… o plano de charms aparece com 2 min de dados.',
  party: 'Clique em "Ler party e charms": o plano usa o level, o crítico e o HP/mana de cada membro.',
  charms: 'Clique em "Ler party e charms": o plano precisa dos charms que você tem.',
};

const signed = (fraction) => `+${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const majorCell = (row) => {
  if (row.majorName) return `${escapeHtml(row.majorName)} <span class="dim">${signed(row.major.creatureGain)}</span>`;
  if (!row.locked) return '<span class="dim">sem major de dano</span>';
  const after = row.lockedUnlockName ? ` · depois: ${escapeHtml(row.lockedUnlockName)}` : '';
  return `<span class="warn">bestiário ${formatInteger(row.locked.have)}/${formatInteger(row.locked.goal)}</span> <span class="dim">faltam ${formatDuration(row.locked.hours)}${after}</span>`;
};

const minorCell = (row) => {
  if (!row.minorName) return '<span class="dim">—</span>';
  const gain = row.minor.kind === 'damage' ? ` <span class="dim">${signed(row.minor.creatureGain)}</span>` : '';
  return `${escapeHtml(row.minorName)}${gain}`;
};

const charmRow = (row) => `<tr>
  <td>${escapeHtml(row.name)}${row.boss ? ' <span class="dim">+ boss</span>' : ''}</td>
  <td class="n">${formatPercent(row.weight)}</td>
  <td>${majorCell(row)}</td>
  <td>${minorCell(row)}</td>
  <td class="dim">${escapeHtml(row.equipped.join(', ') || '—')}</td>
</tr>`;

const lootRow = (plan, index) => `<tr class="${index === 0 ? 'bottleneck' : ''}">
  <td>${escapeHtml(plan.gut ?? '—')}</td><td>${escapeHtml(plan.scavenge ?? '—')}</td><td class="n">${formatGold(plan.total)}/h</td>
</tr>`;

const summary = (table) => [
  table.currentDamage === null ? '' : `Dano atual dos majors e Fatal Hold: ${signed(table.currentDamage)} · plano: ${signed(table.damageTotal)}.`,
  table.estimatedHit ? 'Golpe médio estimado (sem procs medidos): leia o Charm Analyzer depois de alguns minutos.' : '',
].filter(Boolean).map((line) => `<p class="status">${escapeHtml(line)}</p>`).join('');

export const renderCharms = (table) => {
  if (!table.ready) return `<p class="waiting">${escapeHtml(BLOCKED[table.reason])}</p>`;
  return `${summary(table)}
    <div class="scroll plans">
      <table>
        <thead><tr><th>Criatura</th><th class="n">HP na hunt</th><th>Major</th><th>Minor</th><th>Equipado</th></tr></thead>
        <tbody>${table.rows.map(charmRow).join('')}</tbody>
      </table>
      <h3>Gut e Scavenge</h3>
      <table>
        <thead><tr><th>Gut</th><th>Scavenge</th><th class="n">Total</th></tr></thead>
        <tbody>${table.lootPlans.map(lootRow).join('')}</tbody>
      </table>
    </div>
    <p class="foot">Dano calibrado com ${escapeHtml(table.calibration.source ?? 'uma medição de referência')} (procs ×${formatCount(table.calibration.proc)}, crítico ×${formatCount(table.calibration.crit)}). Major só entra em criatura com o bestiário completo. Gut e Scavenge são escolhidos primeiro pelo loot.</p>`;
};

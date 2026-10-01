import { escapeHtml } from './view.js';
import { MIN_QUANTITY_DROPS } from '../drop-log.js';
import { formatCount, formatInteger, formatGold, formatPercent, formatDuration, formatDate } from './format.js';

const meter = (have, goal) => `<span class="meter"><span style="width:${goal ? Math.min(100, (have / goal) * 100) : 0}%"></span></span>`;

const bestiaryRow = (row) => `<tr>
  <td>${escapeHtml(row.name)}</td>
  <td class="n">${formatInteger(row.goal)}</td>
  <td class="n">${formatInteger(row.have)}</td>
  <td class="n">${formatInteger(row.remaining)}</td>
  <td class="n">${row.remaining ? formatDuration(row.hours) : '<span class="pill good">completo</span>'}</td>
  <td>${meter(row.have, row.goal)}</td>
</tr>`;

const RATE_SOURCE = {
  measured: () => 'ritmo da medição ao vivo',
  saved: (table) => `ritmo da última medição (${formatDate(table.saved.t)})`,
  perKill: () => 'hunt nunca medida: sem tempo estimado',
};

const bestiaryStatus = (table) => [
  table.hunt.name,
  RATE_SOURCE[table.mode]?.(table) ?? 'sem ritmo de kills',
  table.counted ? null : 'contagem do bestiário ainda não recebida',
].filter(Boolean).join(' · ');

export const renderBestiary = (table) => {
  if (!table.ready) return '<p class="waiting">Nenhuma hunt em andamento. Escolha uma hunt acima para ver o bestiário dela.</p>';
  return `<p class="status">${escapeHtml(bestiaryStatus(table))}</p>
    <div class="scroll"><table>
    <thead><tr><th>Criatura</th><th class="n">Meta</th><th class="n">Você tem</th><th class="n">Faltam</th><th class="n">Tempo</th><th>Progresso</th></tr></thead>
    <tbody>${table.rows.map(bestiaryRow).join('')}</tbody></table></div>
    <p class="foot">A meta segue a faixa de experiência da criatura (250, 500, 1.000 ou 2.500 kills). O tempo usa o ritmo de kills da medição ao vivo ou da última medição da hunt; as kills do boss contam para a criatura dele.</p>`;
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

export const UNREAD_CODEX = '<p class="warn">Progresso do Codex ainda não lido: os números contam do zero. Ele chega quando o jogo enviar o inventário.</p>';

export const renderCodex = (table, { warnUnread = true } = {}) => {
  if (!table.ready) return '<p class="waiting">Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.</p>';
  if (!table.entries.length) return '<p class="waiting">Esta hunt não tem Codex de domínio.</p>';
  return `${table.read || !warnUnread ? '' : UNREAD_CODEX}
    <div class="scroll plans">${table.entries.map(codexEntry(table.hunt)).join('')}</div>
    <p class="foot">O tempo de cada etapa é o do item mais lento (linha destacada). Os drops/h vêm da aba Drops, então dependem de 2 min de medição e da party lida.</p>`;
};

const SECTION_LABELS = { hunt: 'Hunts', boss: 'Bosses', gear: 'Equipamento' };

export const renderCodexNav = (active) => `<nav class="tabs subtabs">${Object.entries(SECTION_LABELS)
  .map(([id, label]) => `<button class="tab${id === active ? ' active' : ''}" data-codex="${id}">${label}</button>`)
  .join('')}</nav>`;

const rarityOf = (rarities, req) => {
  if (req.tier != null) return rarities?.[req.tier] ?? `#${req.tier}`;
  if (req.minTier != null) return `${rarities?.[req.minTier] ?? `#${req.minTier}`}+`;
  return req.anyTier ? 'qualquer raridade' : null;
};

const itemLabel = (rarities, { withQty }) => (req) => {
  const details = [rarityOf(rarities, req), req.anyOf?.length > 1 ? `${req.anyOf.length} opções` : null].filter(Boolean);
  const name = `${req.item}${details.length ? ` (${details.join(', ')})` : ''}`;
  return withQty ? `${name} ×${formatInteger(req.remaining)}` : name;
};

const missingItem = (rarities, section) => (item) => {
  const label = escapeHtml(itemLabel(rarities, { withQty: section !== 'gear' })(item));
  return item.deliverable ? `<b class="drop">${label}</b>` : label;
};

const missingList = (rarities, section) => (row) => (row.current
  ? row.current.items
    .filter((item) => item.remaining > 0)
    .sort((a, b) => Number(b.deliverable) - Number(a.deliverable))
    .map(missingItem(rarities, section))
    .join(' · ')
  : '—');

const rowClass = (row) => (!row.current ? 'dim' : row.deliverable ? 'deliverable' : '');

const chainRow = (rarities, section) => (row) => `<tr class="${rowClass(row)}">
  <td>${escapeHtml(row.name)}</td>
  <td>${row.current ? `${escapeHtml(row.current.label)} <span class="dim">(${row.completed}/${row.total})</span>` : '<span class="pill good">completo</span>'}</td>
  <td class="n">${row.current ? formatPercent(row.current.progress) : '100%'}</td>
  <td>${meter(row.current ? row.current.progress : 1, 1)}</td>
  <td>${missingList(rarities, section)(row)}</td>
</tr>`;

const SECTION_COPY = {
  hunt: { name: 'Hunt', foot: 'Cada hunt tem 3 etapas de domínio, e cada uma só abre depois da anterior.' },
  boss: { name: 'Boss', foot: 'Cada boss tem 3 troféus, e cada um só abre depois do anterior. A lista mostra o troféu em andamento e o que falta entregar nele.' },
  gear: { name: 'Set', foot: 'Cada set tem uma etapa por raridade (Comum a Épico), e cada etapa pede todas as peças naquela raridade.' },
};

const sectionSummary = (table) => [
  `${formatInteger(table.started)} em andamento`,
  `${formatInteger(table.complete)} de ${formatInteger(table.rows.length)} completos`,
  table.hunt ? `${formatInteger(table.deliverable)} com itens que ${table.hunt.name} dropa (em destaque)` : 'escolha uma hunt para destacar o que ela entrega',
].join(' · ');

export const renderCodexSection = (table, rarities, { warnUnread = true } = {}) => {
  const copy = SECTION_COPY[table.section];
  if (!table.rows.length) return '<p class="waiting">Os dados deste Codex ainda não foram extraídos: rode npm run extract e gere a extensão de novo.</p>';
  return `${table.read || !warnUnread ? '' : UNREAD_CODEX}
    <p class="status">${escapeHtml(sectionSummary(table))}</p>
    <div class="scroll plans">
      <table>
        <thead><tr><th>${copy.name}</th><th>Etapa</th><th class="n">%</th><th>Progresso</th><th>Falta entregar</th></tr></thead>
        <tbody>${table.rows.map(chainRow(rarities, table.section)).join('')}</tbody>
      </table>
    </div>
    <p class="foot">${copy.foot} Em destaque: a etapa atual pede um item que a hunt escolhida dropa (a raridade do equipamento não é garantida).</p>`;
};

const BLOCKED = {
  hunt: 'Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.',
  window: 'Medindo… o plano de charms aparece com 2 min de dados.',
  party: 'Clique em "Ler party e charms": o plano usa o level, o crítico e o HP/mana de cada membro.',
  charms: 'Clique em "Ler party e charms": o plano precisa dos charms que você tem.',
};

const signed = (fraction) => `+${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const UNIT_LABEL = { profit: '/h', xp: ' xp/h' };

const valueOf = (pick, objective) => (pick.value === null || !objective ? '' : `+${formatGold(pick.value)}${UNIT_LABEL[objective]} · `);

const pickNote = (pick, objective) => {
  const parts = [
    valueOf(pick, objective),
    pick.reflected > 0 || !('avoided' in pick) ? signed(pick.creatureGain) : '',
    'avoided' in pick ? ` · evita ${formatGold(pick.avoided)}/h` : '',
  ].join('');
  return ` <span class="dim">${parts}</span>`;
};

const majorCell = (row, objective) => {
  if (row.majorName) return `${escapeHtml(row.majorName)}${pickNote(row.major, objective)}`;
  if (!row.locked) return '<span class="dim">sem major</span>';
  const after = row.lockedUnlockName ? ` · depois: ${escapeHtml(row.lockedUnlockName)}` : '';
  return `<span class="warn">bestiário ${formatInteger(row.locked.have)}/${formatInteger(row.locked.goal)}</span> <span class="dim">faltam ${formatDuration(row.locked.hours)}${after}</span>`;
};

const minorCell = (row, objective) => {
  if (!row.minorName) return '<span class="dim">—</span>';
  return `${escapeHtml(row.minorName)}${row.minor.kind === 'damage' ? pickNote(row.minor, objective) : ''}`;
};

const charmRow = (objective) => (row) => `<tr>
  <td>${escapeHtml(row.name)}${row.boss ? ' <span class="dim">+ boss</span>' : ''}</td>
  <td class="n">${formatPercent(row.weight)}</td>
  <td>${majorCell(row, objective)}</td>
  <td>${minorCell(row, objective)}</td>
  <td class="dim">${escapeHtml(row.equipped.join(', ') || '—')}</td>
</tr>`;

const lootRow = (plan, index) => `<tr class="${index === 0 ? 'bottleneck' : ''}">
  <td>${escapeHtml(plan.gut ?? '—')}</td><td>${escapeHtml(plan.scavenge ?? '—')}</td><td class="n">${formatGold(plan.total)}/h</td>
</tr>`;

const memberLine = (member) => [
  member.name,
  member.share === null ? null : `${formatPercent(member.share)} do dano`,
  member.avgHit === null ? null : `golpe ${formatCount(member.avgHit)}`,
  member.critShare === null ? null : `${formatPercent(member.critShare / 100)} do dano em crítico`,
  `avatar ${member.avatarUptime === null ? '—' : formatPercent(member.avatarUptime / 100)}`,
].filter(Boolean).join(' · ');

const partyLines = (members = []) => (members.some((m) => m.share !== null || m.avatarUptime !== null)
  ? members.map(memberLine)
  : ['Combate ainda não medido: golpe e crítico estimados pelo level e pelo painel de status.']);

const scavengeLine = (check) => (check
  ? `Scavenge em ${check.monster}: medido ${formatGold(check.measured)}/h · previsto ${formatGold(check.predicted)}/h${check.predicted > 0 ? ` (${formatCount(check.measured / check.predicted)}×)` : ''}.`
  : '');

const OBJECTIVE_LABELS = { profit: 'Lucro/h', xp: 'XP/h' };

export const renderObjectiveNav = (active) => `<nav class="tabs subtabs">${Object.entries(OBJECTIVE_LABELS)
  .map(([id, label]) => `<button class="tab${id === active ? ' active' : ''}" data-objective="${id}">Otimizar ${label}</button>`)
  .join('')}</nav>`;

const economyLine = (economy) => (economy
  ? [
    `Loot ${formatGold(economy.lootPerHour)}/h`,
    `XP ${formatGold(economy.xpPerHour)}/h (${economy.xpMeasured ? 'medido' : 'estimado pela tabela'})`,
    `supplies de cura ${formatGold(economy.recoveryPerHour)}/h`,
    economy.supplyPerDamage === null ? 'dano recebido ainda não medido' : `${formatCount(economy.supplyPerDamage)} gold por ponto de dano recebido`,
  ].join(' · ')
  : '');

const planLine = (table) => (table.valueTotal === null || !table.objective
  ? ''
  : `Plano: +${formatGold(table.valueTotal)}${UNIT_LABEL[table.objective]} (${signed(table.damageTotal)} de dano).`);

const defenseLine = (m) => `${m.name} em ${m.monster}: medido ${formatGold(m.measured)}/h evitado (${formatCount(m.procsPerHour)} procs/h) · previsto ${formatGold(m.predicted)}/h${m.predicted > 0 ? ` (${formatCount(m.measured / m.predicted)}×)` : ''}.`;

const summary = (table) => [
  table.currentDamage === null ? '' : `Dano atual dos majors e Fatal Hold: ${signed(table.currentDamage)} · plano: ${signed(table.damageTotal)}.`,
  planLine(table),
  economyLine(table.economy),
  ...(table.measuredDefense ?? []).map(defenseLine),
  ...partyLines(table.members),
  scavengeLine(table.scavenge),
  table.estimatedHit ? 'Golpe médio estimado pelo level: aguarde alguns minutos de combate.' : '',
].filter(Boolean).map((line) => `<p class="status">${escapeHtml(line)}</p>`).join('');

const defenseOption = (option) => (option.owned
  ? `${formatGold(option.avoided)}/h`
  : `<span class="dim">${formatGold(option.avoided)}/h</span>`);

const defenseRow = (row) => `<tr>
  <td>${escapeHtml(row.name)}</td>
  <td class="n">${formatGold(row.base)}/h</td>
  <td class="n">${formatPercent(row.share)}</td>
  <td>${escapeHtml(row.equippedName ?? '—')}</td>
  <td class="n">${defenseOption(row.options.parry)}</td>
  <td class="n">${defenseOption(row.options.dodge)}</td>
  <td class="n">${formatGold(row.options.dodge.saved)}/h</td>
</tr>`;

const defenseSection = (table) => (table.defense?.length
  ? `<h3>Dano recebido</h3>
    <table>
      <thead><tr><th>Criatura</th><th class="n">Recebido</th><th class="n">%</th><th>Defesa equipada</th><th class="n">Parry evita</th><th class="n">Dodge evita</th><th class="n">Supplies poupadas</th></tr></thead>
      <tbody>${table.defense.map(defenseRow).join('')}</tbody>
    </table>`
  : '<p class="waiting">Dano recebido ainda não medido: Parry e Dodge entram no plano depois dos primeiros golpes recebidos.</p>');

export const renderCharms = (table, objective = 'profit') => {
  if (!table.ready) return `<p class="waiting">${escapeHtml(BLOCKED[table.reason])}</p>`;
  return `${renderObjectiveNav(objective)}${summary(table)}
    <div class="scroll plans">
      <table>
        <thead><tr><th>Criatura</th><th class="n">Dano na hunt</th><th>Major</th><th>Minor</th><th>Equipado</th></tr></thead>
        <tbody>${table.rows.map(charmRow(table.objective)).join('')}</tbody>
      </table>
      ${defenseSection(table)}
      <h3>Gut e Scavenge</h3>
      <table>
        <thead><tr><th>Gut</th><th>Scavenge</th><th class="n">Total</th></tr></thead>
        <tbody>${table.lootPlans.map(lootRow).join('')}</tbody>
      </table>
    </div>
    <p class="foot">Dano calibrado com ${escapeHtml(table.calibration.source ?? 'uma medição de referência')} (procs ×${formatCount(table.calibration.proc)}, crítico ×${formatCount(table.calibration.crit)}, Fatal Hold ×${formatCount(table.calibration.fatal)}). Dano na hunt ${table.damageMeasured ? 'medido no combate' : 'estimado pelo HP das kills'}. Major só entra em criatura com o bestiário completo. Gut e Scavenge são escolhidos primeiro pelo loot. Lucro/h: dano a mais vira kills e loot a mais (hunt limitada por dano); dano evitado vira supplies de cura poupadas (todo gasto com poções ÷ dano recebido). XP/h: só o dano conta, então o Dodge não pontua e o Parry vale pelo golpe refletido. Parry e Dodge evitam o golpe inteiro, que nem aparece no log; o Parry ainda devolve o mesmo valor como dano puro. Mortes ainda não entram.</p>`;
};

const SAMPLE_STATUS = {
  ok: '<span class="pill good">ok</span>',
  above: '<span class="warn">acima</span>',
  below: '<span class="warn">abaixo</span>',
  quantity: '<span class="warn">qtd. acima do máx.</span>',
  unlisted: '<span class="warn">fora da tabela</span>',
  empty: '<span class="dim">—</span>',
};

const percentOrDash = (value) => (value === null ? '—' : formatPercent(value));

const range = (low, high) => (low === high ? formatInteger(low) : `${formatInteger(low)}–${formatInteger(high)}`);

const measuredQuantity = (row) => (row.quantity.mean === null
  ? '—'
  : `${formatCount(row.quantity.mean)} <span class="dim">(${range(row.quantity.min, row.quantity.max)})</span>${row.usesMeasuredQuantity ? ' <span class="pill good">em uso</span>' : ''}`);

const sampleRow = (row) => `<tr class="${row.drops ? '' : 'dim'}">
  <td>${escapeHtml(row.item)}</td>
  <td class="n">${percentOrDash(row.predicted)}</td>
  <td class="n">${percentOrDash(row.measured)}</td>
  <td class="n">${row.interval ? `${formatPercent(row.interval[0])}–${formatPercent(row.interval[1])}` : '—'}</td>
  <td class="n">${formatInteger(row.drops)}</td>
  <td class="n">${row.listed ? `${formatCount(row.predictedQuantity)} <span class="dim">(${range(1, row.tableMax)})</span>` : '—'}</td>
  <td class="n">${measuredQuantity(row)}</td>
  <td>${SAMPLE_STATUS[row.status]}</td>
</tr>`;

const creatureHeading = (creature) => [
  creature.name,
  `${formatInteger(creature.kills)} kills isoladas`,
  creature.factor === null ? null : `bônus da party ×${formatCount(creature.factor)}`,
].filter(Boolean).join(' · ');

const sampleCreature = (creature) => `<h3>${escapeHtml(creatureHeading(creature))}</h3>${creature.kills
  ? `<table>
    <thead><tr><th>Item</th><th class="n">Prevista</th><th class="n">Medida</th><th class="n">IC 95%</th><th class="n">Drops</th><th class="n">Qtd. tabela</th><th class="n">Qtd. medida</th><th>Status</th></tr></thead>
    <tbody>${creature.rows.map(sampleRow).join('')}</tbody>
  </table>`
  : '<p class="waiting">Nenhuma kill isolada desta criatura ainda.</p>'}`;

export const renderSample = (table) => {
  if (!table.ready) return '<p class="waiting">Nenhuma hunt em andamento. Escolha uma hunt acima para ver a amostra de drops dela.</p>';
  return `<p class="status">${escapeHtml(`${table.hunt.name} · ${formatInteger(table.kills)} kills isoladas na amostra`)}</p>
    <div class="scroll plans">${table.creatures.map(sampleCreature).join('')}</div>
    <p class="foot">A amostra usa só as kills isoladas (atualização do servidor com uma kill só): cada item que aumentou no Loot Analyser é um drop dela. Prevista: chance da tabela × bônus da party (soma de 1 + bônus de loot de cada membro) × (1 + Gut), até 100%; moedas e bags sem bônus. Acima ou abaixo: a prevista fica fora do intervalo de 95% da medida. Com ${MIN_QUANTITY_DROPS} drops ou mais, a quantidade medida substitui a média da tabela nas abas Drops e Charms. A amostra fica no navegador, soma todas as sessões e não zera com o Hunt Analyzer.</p>`;
};

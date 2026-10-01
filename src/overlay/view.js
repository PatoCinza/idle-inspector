import { MIN_MINUTES } from '../drops.js';
import { formatCount, formatInteger, formatGold, formatPercent, formatDuration, formatMinutes, formatClock, formatDate } from './format.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ENTITIES[char]);

const REASONS = {
  start: 'início da coleta',
  analyzer: 'Hunt Analyzer zerado',
  hunt: 'troca de hunt',
};

export const COLUMNS = [
  { key: 'item', label: 'Item', defaultDir: 1 },
  { key: 'creatures', label: 'Criaturas', sortable: false },
  { key: 'chance', label: 'Chance/kill', defaultDir: -1, numeric: true },
  { key: 'perHour', label: { hour: 'Drops/h', kill: 'Drops/kill' }, defaultDir: -1, numeric: true },
  { key: 'valuePerHour', label: { hour: 'Valor/h', kill: 'Valor/kill' }, defaultDir: -1, numeric: true },
  { key: 'everyHours', label: '1 a cada', defaultDir: 1, numeric: true },
  { key: 'dropped', label: 'Caiu', defaultDir: -1, numeric: true },
];

const labelOf = (column, unit) => (typeof column.label === 'string' ? column.label : column.label[unit]);

export const DEFAULT_SORT = { key: 'valuePerHour', dir: -1 };

const isMissing = (value) => value === null || value === undefined || value === Infinity;

const compare = (key, dir) => (a, b) => {
  if (isMissing(a[key]) || isMissing(b[key])) return Number(isMissing(a[key])) - Number(isMissing(b[key]));
  const order = typeof a[key] === 'string' ? a[key].localeCompare(b[key], 'pt-BR') : a[key] - b[key];
  return order * dir;
};

export const sortRows = (rows, sort = DEFAULT_SORT) => [...rows].sort(compare(sort.key, sort.dir));

export const nextSort = (sort, key) => {
  const column = COLUMNS.find((c) => c.key === key);
  if (!column || column.sortable === false) return sort;
  return { key, dir: sort.key === key ? -sort.dir : column.defaultDir };
};

const icon = (row, iconUrl) => {
  const url = row.iconId == null ? null : iconUrl(row.iconId);
  return url ? `<img class="icon" src="${escapeHtml(url)}" alt="" width="28" height="28">` : '<span class="icon empty"></span>';
};

const cell = (value, numeric, extra = '') => `<td class="${numeric ? 'n' : ''}${extra}">${value}</td>`;

const EVERY = {
  hour: formatDuration,
  kill: (kills) => (Number.isFinite(kills) ? `${formatCount(kills)} kills` : '—'),
};

const renderRow = (iconUrl, unit) => (row) => `<tr${row.skipped ? ' class="dim"' : ''}>
  <td class="item">${icon(row, iconUrl)}<span>${escapeHtml(row.item)}${row.skipped ? ' <small title="Marcado como Não coletar no Gerenciar loot">· não coletado</small>' : ''}</span></td>
  <td class="creatures">${escapeHtml(row.creatures.join(', '))}</td>
  ${cell(formatPercent(row.chance), true)}
  ${cell(formatCount(row.perHour), true)}
  ${cell(row.valuePerHour === null ? '—' : formatGold(row.valuePerHour), true)}
  ${cell(EVERY[unit](row.everyHours), true)}
  ${cell(row.dropped === null ? '—' : formatInteger(row.dropped), true, row.dropped ? '' : ' dim')}
</tr>`;

const renderHead = (sort, unit) => COLUMNS.map((column) => {
  const active = column.key === sort.key;
  const arrow = active ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
  const attrs = column.sortable === false ? '' : ` data-sort="${column.key}" tabindex="0" role="button"`;
  return `<th class="${column.numeric ? 'n' : ''}${active ? ' active' : ''}"${attrs}>${labelOf(column, unit)}${arrow}</th>`;
}).join('');

const liveStatus = (table, window) => {
  const parts = [
    table.hunt?.name ?? 'Hunt não identificada',
    formatMinutes(window.minutes),
    `${formatInteger(Object.values(window.kills).reduce((a, b) => a + b, 0))} kills`,
    `${formatInteger(window.rooms)} salas`,
  ];
  const since = window.since ? `desde ${formatClock(window.since.t)} · ${REASONS[window.since.reason] ?? window.since.reason}` : '';
  return `<div class="status"><span>${parts.map(escapeHtml).join(' · ')}</span><span class="since">${escapeHtml(since)}</span></div>`;
};

const plannedStatus = (table) => {
  const killsPerHour = (saved) => Object.values(saved.kills).reduce((a, b) => a + b, 0);
  const detail = table.mode === 'saved'
    ? `última medição: ${formatMinutes(table.saved.minutes)} em ${formatDate(table.saved.t)} · ${formatInteger(killsPerHour(table.saved))} kills/h`
    : 'nunca medida: valores por kill, criaturas em proporção igual';
  return `<div class="status"><span>${escapeHtml(`${table.hunt.name} · ${detail}`)}</span></div>`;
};

const waiting = (table, window) => {
  if (!table.hunt) return 'Nenhuma hunt em andamento. Escolha uma hunt acima para ver os drops pela tabela.';
  if (window.minutes <= 0) return 'Aguardando dados do jogo. A medição começa na próxima atualização do servidor.';
  return `Medindo… a tabela aparece com ${MIN_MINUTES} min de dados (${formatMinutes(window.minutes)} até agora).`;
};

const FOOT = {
  hour: 'Chance/kill é a da tabela, antes dos bônus. Drops/h usa um sorteio por kill para a party: a chance da tabela × a soma de (1 + bônus de loot) de cada membro × (1 + Gut), até 100%.',
  kill: 'Sem medição desta hunt: drops e valor por kill, com as criaturas em proporção igual e sem o boss. Depois de 2 min caçando nela, a última medição passa a valer aqui.',
};

const UNIT = { hour: '/h', kill: '/kill' };

const measuredNote = (count) => (count
  ? ` Quantidade medida (aba Amostra) em ${formatInteger(count)} ${count === 1 ? 'item' : 'itens'}; nos outros, a média entre 1 e o máximo da tabela.`
  : '');

const notes = (table, dataVersion) => [
  table.partyRead ? '' : '<p class="warn">Bônus de loot da party não lido: usando 0%.</p>',
  table.totals ? `<p class="total">Total: ${formatGold(table.totals.total)}${UNIT[table.unit]} · itens ${formatGold(table.totals.items)} · moedas ${formatGold(table.totals.currency)}</p>` : '',
  `<p class="foot">${FOOT[table.unit]}${measuredNote(table.measuredQuantities)} Dados do jogo: ${escapeHtml(dataVersion)}.</p>`,
].join('');

const renderNotice = (notice) => (notice ? `<p class="notice ${notice.ok ? 'ok' : 'warn'}">${escapeHtml(notice.message)}</p>` : '');

const measuringNote = (measuring, window) => (measuring
  ? `<p class="status">${escapeHtml(`Medindo esta hunt agora: ${formatMinutes(window.minutes)} de ${MIN_MINUTES} min.`)}</p>`
  : '');

const huntOption = (selected) => (hunt) => `<option value="${escapeHtml(hunt.id)}"${hunt.id === selected ? ' selected' : ''}>${escapeHtml(`${hunt.name} (lvl ${hunt.minLevel ?? 0})`)}</option>`;

export const renderHuntPicker = ({ hunts, selected, liveHunt }) => {
  const sorted = [...hunts].sort((a, b) => (a.minLevel ?? 0) - (b.minLevel ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
  const current = liveHunt ? `Hunt atual (${liveHunt.name})` : 'Hunt atual';
  return `<label class="picker">Planejar: <select data-hunt>
    <option value=""${selected ? '' : ' selected'}>${escapeHtml(current)}</option>
    ${sorted.map(huntOption(selected)).join('')}
  </select></label>`;
};

export const renderBody = ({ table, window, sort = DEFAULT_SORT, iconUrl, dataVersion = '', notice = null, measuring = false }) => {
  const live = table.mode === 'measured';
  const content = table.ready
    ? `<div class="scroll"><table><thead><tr>${renderHead(sort, table.unit)}</tr></thead><tbody>${sortRows(table.rows, sort).map(renderRow(iconUrl, table.unit)).join('')}</tbody></table></div>`
    : `<p class="waiting">${escapeHtml(waiting(table, window))}</p>`;
  const status = live || !table.hunt ? liveStatus(table, window) : plannedStatus(table);
  return `${status}${live ? '' : measuringNote(measuring, window)}${renderNotice(notice)}${content}${table.ready ? notes(table, dataVersion) : ''}`;
};

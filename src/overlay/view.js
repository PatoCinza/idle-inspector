import { MIN_MINUTES } from '../drops.js';
import { formatCount, formatInteger, formatGold, formatPercent, formatDuration, formatMinutes, formatClock } from './format.js';

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
  { key: 'perHour', label: 'Drops/h', defaultDir: -1, numeric: true },
  { key: 'valuePerHour', label: 'Valor/h', defaultDir: -1, numeric: true },
  { key: 'everyHours', label: '1 a cada', defaultDir: 1, numeric: true },
  { key: 'dropped', label: 'Caiu', defaultDir: -1, numeric: true },
];

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

const renderRow = (row, iconUrl) => `<tr>
  <td class="item">${icon(row, iconUrl)}<span>${escapeHtml(row.item)}</span></td>
  <td class="creatures">${escapeHtml(row.creatures.join(', '))}</td>
  ${cell(formatPercent(row.chance), true)}
  ${cell(formatCount(row.perHour), true)}
  ${cell(row.valuePerHour === null ? '—' : formatGold(row.valuePerHour), true)}
  ${cell(formatDuration(row.everyHours), true)}
  ${cell(formatInteger(row.dropped), true, row.dropped ? '' : ' dim')}
</tr>`;

const renderHead = (sort) => COLUMNS.map((column) => {
  const active = column.key === sort.key;
  const arrow = active ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
  const attrs = column.sortable === false ? '' : ` data-sort="${column.key}" tabindex="0" role="button"`;
  return `<th class="${column.numeric ? 'n' : ''}${active ? ' active' : ''}"${attrs}>${column.label}${arrow}</th>`;
}).join('');

const statusLine = (table, window) => {
  const parts = [
    table.hunt?.name ?? 'Hunt não identificada',
    formatMinutes(window.minutes),
    `${formatInteger(Object.values(window.kills).reduce((a, b) => a + b, 0))} kills`,
    `${formatInteger(window.rooms)} salas`,
  ];
  const since = window.since ? `desde ${formatClock(window.since.t)} · ${REASONS[window.since.reason] ?? window.since.reason}` : '';
  return `<div class="status"><span>${parts.map(escapeHtml).join(' · ')}</span><span class="since">${escapeHtml(since)}</span></div>`;
};

const waiting = (table, window) => {
  if (window.minutes <= 0) return 'Aguardando dados do jogo. A medição começa na próxima atualização do servidor.';
  if (!table.hunt) return 'Ainda não identifiquei a hunt. Ela aparece quando a primeira kill for registrada.';
  return `Medindo… a tabela aparece com ${MIN_MINUTES} min de dados (${formatMinutes(window.minutes)} até agora).`;
};

const notes = (table, dataVersion) => [
  table.partyRead ? '' : '<p class="warn">Bônus de loot da party não lido: usando 0%.</p>',
  table.totals ? `<p class="total">Total: ${formatGold(table.totals.total)}/h · itens ${formatGold(table.totals.items)} · moedas ${formatGold(table.totals.currency)}</p>` : '',
  `<p class="foot">Chance/kill é a da tabela, antes dos bônus. Drops/h inclui o bônus de cada membro da party e a Gut equipada. Dados do jogo: ${escapeHtml(dataVersion)}.</p>`,
].join('');

const renderNotice = (notice) => (notice ? `<p class="notice ${notice.ok ? 'ok' : 'warn'}">${escapeHtml(notice.message)}</p>` : '');

export const renderBody = ({ table, window, sort = DEFAULT_SORT, iconUrl, dataVersion = '', notice = null }) => {
  const content = table.ready
    ? `<div class="scroll"><table><thead><tr>${renderHead(sort)}</tr></thead><tbody>${sortRows(table.rows, sort).map((row) => renderRow(row, iconUrl)).join('')}</tbody></table></div>`
    : `<p class="waiting">${escapeHtml(waiting(table, window))}</p>`;
  return `${statusLine(table, window)}${renderNotice(notice)}${content}${notes(table, dataVersion)}`;
};

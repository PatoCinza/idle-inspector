const LOCALE = 'pt-BR';

const cachedBy = (create) => {
  const cache = new Map();
  return (options) => {
    const key = JSON.stringify(options);
    if (!cache.has(key)) cache.set(key, create(options));
    return cache.get(key);
  };
};

const numberFormat = cachedBy((options) => new Intl.NumberFormat(LOCALE, options));
const dateFormat = cachedBy((options) => new Intl.DateTimeFormat(LOCALE, options));

export const formatNumber = (value, options = {}) => numberFormat(options).format(value);

const decimal = (value, digits) => numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const adaptive = (value) => decimal(value, value >= 100 ? 0 : value >= 10 ? 1 : 2);

export const formatCount = (value) => (Number.isFinite(value) ? adaptive(value) : '—');

export const formatInteger = (value) => (Number.isFinite(value) ? numberFormat({}).format(Math.round(value)) : '—');

export const formatGold = (value) => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e6) return `${decimal(value / 1e6, 2)} kk`;
  if (value >= 1e3) return `${decimal(value / 1e3, 1)} k`;
  return decimal(value, 0);
};

export const formatPercent = (fraction) => `${numberFormat({ maximumSignificantDigits: 3 }).format(fraction * 100)}%`;

export const formatDuration = (hours) => {
  if (!Number.isFinite(hours)) return '—';
  const minutes = hours * 60;
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (hours < 1) return `${adaptive(minutes)} min`;
  if (hours < 48) return `${adaptive(hours)} h`;
  return `${adaptive(hours / 24)} d`;
};

export const formatMinutes = (minutes) => {
  if (minutes < 60) return `${decimal(minutes, 1)} min`;
  const whole = Math.floor(minutes);
  return `${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, '0')} min`;
};

export const formatClock = (timestamp) => dateFormat({ hour: '2-digit', minute: '2-digit' }).format(timestamp);

export const formatDate = (timestamp) => dateFormat({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp);

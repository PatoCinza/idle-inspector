const LOCALE = 'pt-BR';

const decimal = (value, digits) => value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const adaptive = (value) => decimal(value, value >= 100 ? 0 : value >= 10 ? 1 : 2);

export const formatCount = (value) => (Number.isFinite(value) ? adaptive(value) : '—');

export const formatInteger = (value) => (Number.isFinite(value) ? Math.round(value).toLocaleString(LOCALE) : '—');

export const formatGold = (value) => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e6) return `${decimal(value / 1e6, 2)} kk`;
  if (value >= 1e3) return `${decimal(value / 1e3, 1)} k`;
  return decimal(value, 0);
};

export const formatPercent = (fraction) => `${(fraction * 100).toLocaleString(LOCALE, { maximumSignificantDigits: 3 })}%`;

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

export const formatClock = (timestamp) => new Date(timestamp).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

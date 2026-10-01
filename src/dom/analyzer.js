const toNumber = (text) => Number(String(text).replace(/\./g, '').replace(',', '.'));

const CLOCK = /^(\d+):(\d{2}):(\d{2})$/;

export const parseClock = (text) => {
  const match = String(text ?? '').trim().match(CLOCK);
  return match ? (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 : 0;
};

const count = (text) => (/^\d[\d.]*$/.test(text) ? toNumber(text) : 0);

export const charmStatsFrom = (dataset, { clock, rows }) => {
  const idByName = Object.fromEntries(dataset.charms.map((charm) => [charm.name.toLowerCase(), charm.id]));
  return {
    ms: parseClock(clock),
    rows: rows
      .filter((row) => idByName[row.name.toLowerCase()] !== undefined)
      .map((row) => ({ id: idByName[row.name.toLowerCase()], n: count(row.procs), v: count(row.value) })),
  };
};

const textOf = (root, selector) => root.querySelector(selector)?.textContent.trim() ?? '';

export const readCharmAnalyzer = ({ doc, dataset }) => {
  const panel = doc.getElementById('panel-charman');
  if (!panel) return null;
  const rows = [...panel.querySelectorAll('.charman-row')].map((row) => ({
    name: textOf(row, '.charman-name'),
    procs: textOf(row, '.charman-procs'),
    value: textOf(row, '.charman-value'),
  }));
  return charmStatsFrom(dataset, { clock: textOf(panel, '#charman-session'), rows });
};

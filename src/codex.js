import { codexPlan } from './model.js';

export const codexTable = ({ dataset, hunt, rows = [], codex }) => {
  if (!hunt) return { ready: false, hunt: null, entries: [], read: Boolean(codex) };
  const perHour = Object.fromEntries(rows.map((row) => [row.item, row.perHour]));
  return { ready: true, hunt, entries: codexPlan({ dataset, hunt, perHour, progress: codex ?? {} }), read: Boolean(codex) };
};

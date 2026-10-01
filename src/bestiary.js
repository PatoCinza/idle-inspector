import { bestiaryPlan, creatures } from './model.js';
import { findHunt, MIN_MINUTES } from './drops.js';

const killsPerHour = (window) => Object.fromEntries(
  Object.entries(window.kills).map(([key, count]) => [key, (count * 60) / window.minutes]),
);

export const bestiaryTable = ({ dataset, window, counts }) => {
  const hunt = findHunt(dataset, window);
  if (!hunt) return { ready: false, hunt: null, rows: [], counted: Boolean(counts) };
  const rows = bestiaryPlan({
    dataset,
    hunt,
    killsByMonster: window.minutes >= MIN_MINUTES ? killsPerHour(window) : {},
    current: counts ?? {},
  }).filter((row) => creatures(hunt).includes(row.monster));
  return { ready: true, hunt, rows, counted: Boolean(counts) };
};

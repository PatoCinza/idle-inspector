import { bestiaryPlan, creatures } from './model.js';
import { perHour } from './drops.js';

export const planKillRates = (plan) => {
  if (plan.mode === 'measured') {
    return Object.fromEntries(Object.entries(plan.live.kills).map(([key, count]) => [key, perHour(count, plan.live.minutes)]));
  }
  return plan.mode === 'saved' ? plan.saved.kills : null;
};

export const bestiaryTable = ({ dataset, hunt, killsByMonster = null, counts, mode = null, saved = null }) => {
  if (!hunt) return { ready: false, hunt: null, rows: [], counted: Boolean(counts) };
  const rows = bestiaryPlan({ dataset, hunt, killsByMonster: killsByMonster ?? {}, current: counts ?? {} })
    .filter((row) => creatures(hunt).includes(row.monster));
  return { ready: true, hunt, rows, counted: Boolean(counts), mode, saved, timed: Boolean(killsByMonster) };
};

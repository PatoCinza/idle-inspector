import { codexPlan, codexEntryId, creatures, monsterLoot } from './model.js';

export const CODEX_SECTIONS = ['hunt', 'boss', 'gear'];

export const GEAR_CODEX_STEPS = 4;

const TROPHY_STEPS = ['I', 'II', 'III'];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const codexTable = ({ dataset, hunt, rows = [], codex }) => {
  if (!hunt) return { ready: false, hunt: null, entries: [], read: Boolean(codex) };
  const perHour = Object.fromEntries(rows.map((row) => [row.item, row.perHour]));
  return { ready: true, hunt, entries: codexPlan({ dataset, hunt, perHour, progress: codex ?? {} }), read: Boolean(codex) };
};

const NO_DROPS = new Set();

export const huntDrops = (dataset, hunt) => (hunt
  ? new Set(creatures(hunt).flatMap((key) => monsterLoot(dataset, key).map((entry) => entry.name)))
  : NO_DROPS);

const droppable = (req, drops) => [req.item, ...(req.anyOf ?? [])].some((name) => drops.has(name));

export const huntChains = (dataset) => dataset.hunts
  .filter((hunt) => dataset.codexHunts?.[hunt.id]?.length)
  .map((hunt) => ({
    key: hunt.id,
    name: hunt.name,
    steps: (dataset.codexSteps ?? []).map((step, index) => ({
      id: codexEntryId(hunt.id, index),
      label: `Domínio ${step.suffix}`,
      req: dataset.codexHunts[hunt.id].map((req) => ({ item: req.item, qty: req.qty * step.qty })),
    })),
  }));

export const bossChains = (dataset) => (dataset.codexBosses ?? []).map(({ monster, name, steps }) => ({
  key: monster,
  name,
  steps: steps.map((step, index) => ({ id: step.id, label: `Troféu ${TROPHY_STEPS[index] ?? index + 1}`, req: step.req })),
}));

export const gearChains = (dataset) => (dataset.codexGear ?? []).map(({ id, name, pieces }) => ({
  key: id,
  name,
  steps: Array.from({ length: GEAR_CODEX_STEPS }, (_, tier) => ({
    id: `set-${id}-${tier}`,
    label: dataset.rarities?.[tier] ?? `#${tier}`,
    req: pieces.map((item) => ({ item, qty: 1, tier })),
  })),
}));

const stepProgress = (step, prog, done, drops) => {
  const complete = done.has(step.id);
  const delivered = prog[step.id] ?? [];
  const items = step.req.map((req, index) => {
    const have = complete ? req.qty : Math.min(req.qty, Math.max(0, Math.floor(Number(delivered[index]) || 0)));
    const remaining = req.qty - have;
    return { ...req, have, remaining, deliverable: remaining > 0 && droppable(req, drops) };
  });
  const need = sum(items.map((item) => item.qty));
  return { id: step.id, label: step.label, complete, items, progress: need > 0 ? sum(items.map((item) => item.have)) / need : 1 };
};

export const chainProgress = (chain, codex, drops = NO_DROPS) => {
  const done = new Set(codex?.done ?? []);
  const steps = chain.steps.map((step) => stepProgress(step, codex?.prog ?? {}, done, drops));
  const current = steps.find((step) => !step.complete) ?? null;
  return {
    key: chain.key,
    name: chain.name,
    completed: steps.filter((step) => step.complete).length,
    total: steps.length,
    current,
    deliverable: Boolean(current?.items.some((item) => item.deliverable)),
  };
};

const started = (row) => row.current && (row.completed > 0 || row.current.progress > 0);

const rank = (row) => {
  if (!row.current) return 2;
  return started(row) ? 0 : 1;
};

const byCloseness = (a, b) => Number(b.deliverable) - Number(a.deliverable)
  || rank(a) - rank(b)
  || b.completed - a.completed
  || (b.current?.progress ?? 0) - (a.current?.progress ?? 0)
  || a.name.localeCompare(b.name);

const CHAINS = { hunt: huntChains, boss: bossChains, gear: gearChains };

export const codexSection = ({ dataset, section, codex, hunt = null }) => {
  const drops = huntDrops(dataset, hunt);
  const rows = (CHAINS[section]?.(dataset) ?? []).map((chain) => chainProgress(chain, codex, drops)).sort(byCloseness);
  return {
    section,
    read: Boolean(codex),
    hunt,
    rows,
    deliverable: rows.filter((row) => row.deliverable).length,
    started: rows.filter(started).length,
    complete: rows.filter((row) => !row.current).length,
  };
};

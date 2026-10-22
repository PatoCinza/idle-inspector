const SECOND = 1000;

const live = (app) => [app.session, app.huntRates, app.party, app.charmSlots, app.dropLog, app.lootConfig];

export const REFRESH = {
  welcome: { everyMs: 2 * SECOND, deps: (app) => [app] },
  xp: { everyMs: SECOND, clock: true, deps: (app) => [app.xpTrack, app.xp] },
  drops: { everyMs: SECOND, deps: live },
  sample: { everyMs: SECOND, deps: (app) => [app.session, app.dropLog, app.lootConfig] },
  bestiary: { everyMs: 5 * SECOND, deps: (app) => [app.session, app.huntRates, app.bestiary] },
  charms: { everyMs: 5 * SECOND, deps: (app) => [...live(app), app.charmStats, app.procs, app.combat, app.xp] },
  check: { everyMs: 5 * SECOND, deps: (app) => [...live(app), app.charmStats, app.procs, app.combat, app.xp, app.rotation] },
  rotation: { everyMs: 5 * SECOND, deps: (app) => [app.rotation, app.party] },
  hunts: { everyMs: 10 * SECOND, deps: (app) => [...live(app), app.reference, app.combat, app.rotation, app.xp] },
  codex: { everyMs: 10 * SECOND, deps: (app) => [...live(app), app.codex] },
};

export const refreshOf = (tab) => REFRESH[tab] ?? REFRESH.drops;

const sameRefs = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

export const renderedState = ({ tab, app, now }) => ({ tab, deps: refreshOf(tab).deps(app), at: now });

export const waitBeforeRender = ({ tab, app, last, now }) => {
  if (!last || last.tab !== tab) return 0;
  const { everyMs, deps, clock = false } = refreshOf(tab);
  if (!clock && sameRefs(last.deps, deps(app))) return null;
  return Math.max(0, last.at + everyMs - now);
};

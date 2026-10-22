import { initialSession, reduceSession, windowOf, isLive } from './session.js';
import { savedRates } from './plan.js';
import { mergeCombat } from './combat.js';
import { mergeRotation } from './rotation.js';
import { lootPcts } from './drops.js';
import { partyLootFactor } from './model.js';
import { initialDropLog, observeSnapshot, disarm, gutOn } from './drop-log.js';
import { referenceOf } from './recommend.js';
import { initialXpTrack, reduceXpTrack } from './xp-tracker.js';

export const APP_VERSION = 1;
export const MAX_PHASES = 500;

export const initialApp = () => ({ v: APP_VERSION, session: initialSession(), charmSlots: null, party: null, codex: null, charmStats: null, procs: null, combat: null, rotation: null, huntRates: {}, bestiary: null, dropLog: initialDropLog(), xp: 0, phases: [], lootConfig: null, reference: null, xpTrack: initialXpTrack() });

const SESSION_EVENTS = new Set(['snapshot', 'reset', 'connect']);

const CODEX_ENTRY = /^(hunt|boss|set)-/;

const trackedCodex = (codex) => ({
  done: (codex.done ?? []).filter((id) => CODEX_ENTRY.test(id)),
  prog: Object.fromEntries(Object.entries(codex.prog ?? {}).filter(([id]) => CODEX_ENTRY.test(id))),
});

const lootFactorOf = (app, dataset) => (monster) => partyLootFactor(lootPcts(app.party?.members))
  * (1 + (dataset ? gutOn(dataset, app.charmSlots, monster) : 0));

export const charmPlacement = (charmSlots) => Object.fromEntries(Object.entries(charmSlots ?? {})
  .filter(([, slot]) => slot?.monsterKey)
  .map(([id, slot]) => [id, slot.monsterKey]));

const logOf = (app) => app.dropLog ?? initialDropLog();

const DROP_LOG = {
  snapshot: (app, event, { dataset }) => observeSnapshot(logOf(app), app.session.last, event, lootFactorOf(app, dataset)),
  reset: (app) => disarm(logOf(app)),
  connect: (app) => disarm(logOf(app)),
};

const nextReference = (app, session, window, { dataset }, t) => {
  if (!dataset || !isLive(session) || session.since !== app.session.since) return app.reference ?? null;
  return referenceOf({ dataset, window, combat: app.combat, xp: app.xp ?? 0, t }) ?? app.reference ?? null;
};

export const reduceApp = (app, event, env = {}) => {
  if (SESSION_EVENTS.has(event.type)) {
    const dropLog = DROP_LOG[event.type](app, event, env);
    const session = reduceSession(app.session, event);
    const window = windowOf(session);
    const rates = isLive(session) ? savedRates(window, event.t) : null;
    return {
      ...app,
      session,
      combat: session.since === app.session.since ? app.combat ?? null : null,
      rotation: session.since === app.session.since ? app.rotation ?? null : null,
      xp: session.since === app.session.since ? app.xp ?? 0 : 0,
      phases: session.since === app.session.since ? app.phases ?? [] : [],
      huntRates: rates ? { ...app.huntRates, [window.huntId]: rates } : app.huntRates ?? {},
      bestiary: event.bestiary ?? app.bestiary ?? null,
      reference: nextReference(app, session, window, env, event.t),
      xpTrack: session.since === app.session.since ? app.xpTrack ?? initialXpTrack() : { ...initialXpTrack(), current: app.xpTrack?.current ?? null },
      dropLog,
    };
  }
  if (event.type === 'combat') return { ...app, combat: mergeCombat(app.combat, event.combat) };
  if (event.type === 'rotation') return { ...app, rotation: mergeRotation(app.rotation, event.stats) };
  if (event.type === 'xp') return { ...app, xp: (app.xp ?? 0) + event.xp };
  if (event.type === 'lootConfig') return { ...app, lootConfig: event.config };
  if (event.type === 'phase') return { ...app, phases: [...(app.phases ?? []), { ms: event.ms, charms: app.charmSlots ? charmPlacement(app.charmSlots) : null }].slice(-MAX_PHASES) };
  if (event.type === 'charms') return { ...app, charmSlots: event.slots };
  if (event.type === 'codex') {
    const codex = trackedCodex(event.codex);
    return JSON.stringify(codex) === JSON.stringify(app.codex) ? app : { ...app, codex };
  }
  if (event.type === 'procs') return { ...app, procs: event.procs };
  if (event.type === 'charmStats') return { ...app, charmStats: event.stats };
  if (event.type === 'partyXp') return { ...app, xpTrack: reduceXpTrack(app.xpTrack, event, app.xp ?? 0) };
  if (event.type === 'party') return { ...app, party: { members: event.members, readAt: event.t } };
  return app;
};

export const restoreApp = (stored) => (stored?.v === APP_VERSION ? { ...initialApp(), ...stored } : initialApp());

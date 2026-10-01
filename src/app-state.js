import { initialSession, reduceSession, windowOf, isLive } from './session.js';
import { savedRates } from './plan.js';
import { mergeCombat } from './combat.js';

export const APP_VERSION = 1;

export const initialApp = () => ({ v: APP_VERSION, session: initialSession(), charmSlots: null, party: null, codex: null, charmStats: null, procs: null, combat: null, huntRates: {}, bestiary: null });

const SESSION_EVENTS = new Set(['snapshot', 'reset', 'connect']);

const CODEX_ENTRY = /^(hunt|boss|set)-/;

const trackedCodex = (codex) => ({
  done: (codex.done ?? []).filter((id) => CODEX_ENTRY.test(id)),
  prog: Object.fromEntries(Object.entries(codex.prog ?? {}).filter(([id]) => CODEX_ENTRY.test(id))),
});

export const reduceApp = (app, event) => {
  if (SESSION_EVENTS.has(event.type)) {
    const session = reduceSession(app.session, event);
    const window = windowOf(session);
    const rates = isLive(session) ? savedRates(window, event.t) : null;
    return {
      ...app,
      session,
      combat: session.since === app.session.since ? app.combat ?? null : null,
      huntRates: rates ? { ...app.huntRates, [window.huntId]: rates } : app.huntRates ?? {},
      bestiary: event.bestiary ?? app.bestiary ?? null,
    };
  }
  if (event.type === 'combat') return { ...app, combat: mergeCombat(app.combat, event.combat) };
  if (event.type === 'charms') return { ...app, charmSlots: event.slots };
  if (event.type === 'codex') return { ...app, codex: trackedCodex(event.codex) };
  if (event.type === 'procs') return { ...app, procs: event.procs };
  if (event.type === 'charmStats') return { ...app, charmStats: event.stats };
  if (event.type === 'party') return { ...app, party: { members: event.members, readAt: event.t } };
  return app;
};

export const restoreApp = (stored) => (stored?.v === APP_VERSION ? stored : initialApp());

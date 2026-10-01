import { initialSession, reduceSession } from './session.js';
import { mergeCombat } from './combat.js';

export const APP_VERSION = 1;

export const initialApp = () => ({ v: APP_VERSION, session: initialSession(), charmSlots: null, party: null, codex: null, charmStats: null, procs: null, combat: null });

const SESSION_EVENTS = new Set(['snapshot', 'reset', 'connect']);

const HUNT_ENTRY = /^hunt-/;

const huntCodex = (codex) => ({
  done: (codex.done ?? []).filter((id) => HUNT_ENTRY.test(id)),
  prog: Object.fromEntries(Object.entries(codex.prog ?? {}).filter(([id]) => HUNT_ENTRY.test(id))),
});

export const reduceApp = (app, event) => {
  if (SESSION_EVENTS.has(event.type)) {
    const session = reduceSession(app.session, event);
    return { ...app, session, combat: session.since === app.session.since ? app.combat ?? null : null };
  }
  if (event.type === 'combat') return { ...app, combat: mergeCombat(app.combat, event.combat) };
  if (event.type === 'charms') return { ...app, charmSlots: event.slots };
  if (event.type === 'codex') return { ...app, codex: huntCodex(event.codex) };
  if (event.type === 'procs') return { ...app, procs: event.procs };
  if (event.type === 'charmStats') return { ...app, charmStats: event.stats };
  if (event.type === 'party') return { ...app, party: { members: event.members, readAt: event.t } };
  return app;
};

export const restoreApp = (stored) => (stored?.v === APP_VERSION ? stored : initialApp());

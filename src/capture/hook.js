import { parseFrame, parseMessage } from './frames.js';
import { procsFromStats } from '../avatar.js';
import { combatFromLog, mergeCombat, hasCombat } from '../combat.js';

const ROOM_DATA = 13;
const ANALYZER_PANELS = new Set(['hunt', 'loot']);

const fromPatch = ({ bestiary, loot, codex }) => [
  ...(bestiary || loot ? [{ type: 'snapshot', bestiary, loot }] : []),
  ...(codex ? [{ type: 'codex', codex }] : []),
];

const INCOMING = {
  charms: (payload) => [{ type: 'charms', slots: payload?.slots ?? null }],
  procstats: (payload) => {
    const procs = procsFromStats(payload);
    return procs ? [{ type: 'procs', procs }] : [];
  },
  charmstats: (payload) => (payload?.ms > 0 && Array.isArray(payload.rows)
    ? [{ type: 'charmStats', stats: { ms: payload.ms, rows: payload.rows.map(({ id, n, v }) => ({ id, n: n ?? 0, v: v ?? 0 })) } }]
    : []),
  combatlog: (payload) => {
    const combat = combatFromLog(payload);
    return hasCombat(combat) ? [{ type: 'combat', combat }] : [];
  },
};

export const THROTTLE_MS = { procs: 5000, charmStats: 5000, combat: 5000 };

const MERGE = {
  combat: (pending, next) => ({ ...next, combat: mergeCombat(pending.combat, next.combat) }),
};

const latest = (pending, next) => next;

const OUTGOING = {
  resetstats: (payload) => (ANALYZER_PANELS.has(payload?.panel) ? [{ type: 'reset', reason: 'analyzer', loot: {} }] : []),
  stage: (payload) => [{ type: 'reset', reason: 'hunt', huntId: payload?.huntId ?? null }],
};

const eventsFromFrame = (frame) => (frame.kind === 'patch' ? fromPatch(frame) : INCOMING[frame.type]?.(frame.payload) ?? []);

export const createCapture = ({ emit, now = Date.now }) => {
  const lastEmit = {};
  const pending = {};

  const throttled = (event) => {
    const gap = THROTTLE_MS[event.type];
    if (!gap) return [event];
    const merged = pending[event.type] ? (MERGE[event.type] ?? latest)(pending[event.type], event) : event;
    if (lastEmit[event.type] != null && event.t - lastEmit[event.type] < gap) {
      pending[event.type] = merged;
      return [];
    }
    pending[event.type] = null;
    lastEmit[event.type] = event.t;
    return [merged];
  };

  const safely = (toEvents) => (bytes) => {
    try {
      toEvents(bytes)
        .map((event) => ({ ...event, t: now() }))
        .flatMap(throttled)
        .forEach(emit);
    } catch {
      emit({ type: 'error', t: now() });
    }
  };

  const incoming = safely((bytes) => {
    const frame = parseFrame(bytes);
    return frame ? eventsFromFrame(frame) : [];
  });

  const outgoing = safely((bytes) => {
    if (bytes[0] !== ROOM_DATA) return [];
    const { type, payload } = parseMessage(bytes);
    return OUTGOING[type]?.(payload) ?? [];
  });

  return { incoming, outgoing };
};

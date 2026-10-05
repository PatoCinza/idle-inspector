import { parseFrame, parseMessage } from './frames.js';
import { procsFromStats } from '../avatar.js';
import { combatFromLog, mergeCombat, hasCombat } from '../combat.js';
import { createAttribution, initialAttribution, inputsFromMessage, addRecords, mergeRotation, hasRotation, EMPTY_ROTATION, ROTATION_MESSAGES } from '../rotation.js';

const ROOM_DATA = 13;
const ANALYZER_PANELS = new Set(['hunt', 'loot']);

const lootConfigOf = (config) => ({
  skip: config.skip.filter((name) => typeof name === 'string'),
  codexOnly: config.codexOnly === true,
});

const fromPatch = ({ bestiary, loot, supply, codex, lootConfig }) => [
  ...(bestiary || loot || supply ? [{ type: 'snapshot', bestiary, loot, supply }] : []),
  ...(lootConfig ? [{ type: 'lootConfig', config: lootConfigOf(lootConfig) }] : []),
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
  notify: (payload) => {
    const ms = Number(payload?.params?.ms);
    return payload?.kind === 'phase' && ms > 0 ? [{ type: 'phase', ms }] : [];
  },
  fx: (payload) => {
    const xp = (Array.isArray(payload) ? payload : [payload])
      .filter((effect) => effect?.t === 'xp' && Number.isFinite(effect.amount))
      .reduce((total, effect) => total + effect.amount, 0);
    return xp > 0 ? [{ type: 'xp', xp }] : [];
  },
};

export const THROTTLE_MS = { procs: 5000, charmStats: 5000, combat: 5000, xp: 5000, rotation: 5000 };

const MERGE = {
  combat: (pending, next) => ({ ...next, combat: mergeCombat(pending.combat, next.combat) }),
  xp: (pending, next) => ({ ...next, xp: pending.xp + next.xp }),
  rotation: (pending, next) => ({ ...next, stats: mergeRotation(pending.stats, next.stats) }),
};

const latest = (pending, next) => next;

const OUTGOING = {
  resetstats: (payload) => (ANALYZER_PANELS.has(payload?.panel) ? [{ type: 'reset', reason: 'analyzer', loot: {} }] : []),
  stage: (payload) => [{ type: 'reset', reason: 'hunt', huntId: payload?.huntId ?? null }],
};

const eventsFromFrame = (frame) => (frame.kind === 'patch' ? fromPatch(frame) : INCOMING[frame.type]?.(frame.payload) ?? []);

export const createCapture = ({ emit, now = Date.now, spells = [] }) => {
  const lastEmit = {};
  const pending = {};
  const attribute = createAttribution(spells);
  let attribution = initialAttribution();
  let unsent = EMPTY_ROTATION;

  const rotationEvents = (frame, t) => {
    if (frame.kind !== 'message' || !ROTATION_MESSAGES.has(frame.type)) return [];
    const step = attribute(attribution, inputsFromMessage(frame.type, frame.payload), t);
    attribution = step.state;
    unsent = addRecords(unsent, step.records);
    if (!hasRotation(unsent)) return [];
    const stats = unsent;
    unsent = EMPTY_ROTATION;
    return [{ type: 'rotation', stats }];
  };

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
    const t = now();
    try {
      toEvents(bytes, t)
        .map((event) => ({ ...event, t }))
        .flatMap(throttled)
        .forEach(emit);
    } catch {
      emit({ type: 'error', t });
    }
  };

  const incoming = safely((bytes, t) => {
    const frame = parseFrame(bytes);
    return frame ? [...eventsFromFrame(frame), ...rotationEvents(frame, t)] : [];
  });

  const outgoing = safely((bytes) => {
    if (bytes[0] !== ROOM_DATA) return [];
    const { type, payload } = parseMessage(bytes);
    return OUTGOING[type]?.(payload) ?? [];
  });

  return { incoming, outgoing };
};

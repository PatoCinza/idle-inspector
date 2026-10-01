import { parseFrame, parseMessage } from './frames.js';

const ROOM_DATA = 13;
const ANALYZER_PANELS = new Set(['hunt', 'loot']);

const fromPatch = ({ bestiary, loot, codex }) => [
  ...(bestiary || loot ? [{ type: 'snapshot', bestiary, loot }] : []),
  ...(codex ? [{ type: 'codex', codex }] : []),
];

const INCOMING = {
  charms: (payload) => [{ type: 'charms', slots: payload?.slots ?? null }],
};

const OUTGOING = {
  resetstats: (payload) => (ANALYZER_PANELS.has(payload?.panel) ? [{ type: 'reset', reason: 'analyzer', loot: {} }] : []),
  stage: (payload) => [{ type: 'reset', reason: 'hunt', huntId: payload?.huntId ?? null }],
};

const eventsFromFrame = (frame) => (frame.kind === 'patch' ? fromPatch(frame) : INCOMING[frame.type]?.(frame.payload) ?? []);

export const createCapture = ({ emit, now = Date.now }) => {
  const safely = (toEvents) => (bytes) => {
    try {
      toEvents(bytes).forEach((event) => emit({ ...event, t: now() }));
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

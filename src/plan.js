import { windowOf, isLive, segmentOf } from './session.js';
import { creatures } from './model.js';
import { MIN_MINUTES, perHour } from './drops.js';

export const EMPTY_WINDOW = { huntId: null, minutes: 0, kills: {}, rooms: 0, loot: {}, supply: {}, since: null };

const huntById = (dataset, id) => dataset.hunts.find((hunt) => hunt.id === id) ?? null;

const killsConfirm = (dataset, session) => {
  const hunt = huntById(dataset, session.huntId);
  const killed = Object.keys(segmentOf(session).kills);
  return Boolean(hunt) && killed.length > 0 && killed.every((key) => creatures(hunt).includes(key));
};

export const liveWindow = (dataset, session) => (isLive(session) || killsConfirm(dataset, session) ? windowOf(session) : EMPTY_WINDOW);

export const savedRates = (window, t) => (window.huntId && window.minutes >= MIN_MINUTES
  ? {
    kills: Object.fromEntries(Object.entries(window.kills).map(([key, n]) => [key, perHour(n, window.minutes)])),
    rooms: perHour(window.rooms, window.minutes),
    minutes: window.minutes,
    t,
  }
  : null);

export const planFor = ({ dataset, app, plannedHunt = null }) => {
  const live = liveWindow(dataset, app.session);
  const hunt = huntById(dataset, plannedHunt ?? live.huntId);
  if (!hunt) return { live, hunt: null, mode: null, saved: null };
  const saved = app.huntRates?.[hunt.id] ?? null;
  const measuring = live.huntId === hunt.id;
  if (measuring && live.minutes >= MIN_MINUTES) return { live, hunt, mode: 'measured', saved, measuring };
  return { live, hunt, mode: saved ? 'saved' : 'perKill', saved, measuring };
};

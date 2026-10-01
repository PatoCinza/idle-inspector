import { readMsgpack } from './msgpack.js';
import { printableRuns, jsonIn, isBestiary, isTracker, isLootTracker, isBackpack } from './patches.js';

const STATE_FRAMES = new Set([14, 15]);
const ROOM_DATA = 13;

export const parsePatch = (bytes) => printableRuns(bytes).map(jsonIn).reduce((found, obj) => ({
  bestiary: found.bestiary ?? (isBestiary(obj) ? obj : null),
  loot: found.loot ?? (!isBestiary(obj) && isLootTracker(obj) ? obj : null),
  supply: found.supply ?? (!isBestiary(obj) && isTracker(obj) && !isLootTracker(obj) ? obj : null),
  codex: isBackpack(obj) ? obj.codex : found.codex,
}), { bestiary: null, loot: null, supply: null, codex: null });

export const parseMessage = (bytes) => {
  const type = readMsgpack(bytes, 1);
  const hasPayload = type.end < bytes.length;
  return { type: type.value, payload: hasPayload ? readMsgpack(bytes, type.end).value : undefined };
};

export const parseFrame = (bytes) => {
  if (STATE_FRAMES.has(bytes[0])) return { kind: 'patch', ...parsePatch(bytes) };
  if (bytes[0] === ROOM_DATA) return { kind: 'message', ...parseMessage(bytes) };
  return null;
};

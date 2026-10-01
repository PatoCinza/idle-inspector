const EMPTY_TOTALS = { ms: 0, kills: {}, rooms: {}, loot: {}, supply: {} };

export const initialSession = () => ({ huntId: null, since: null, totals: EMPTY_TOTALS, first: null, last: null, connectedAt: null });

const isRoomKey = (key) => key.startsWith('h:');
const isMonsterKey = (key) => !isRoomKey(key) && key !== 'bp';

const increases = (from = {}, to = {}, read = Number) => Object.fromEntries(
  Object.keys(to)
    .map((key) => [key, (read(to[key]) || 0) - (read(from[key]) || 0)])
    .filter(([, value]) => value > 0),
);

const spent = (from = {}, to = {}) => Object.fromEntries(
  Object.keys(to)
    .map((key) => {
      const before = from?.[key]?.g ?? 0;
      const after = to[key]?.g ?? 0;
      return [key, after >= before ? after - before : after];
    })
    .filter(([, value]) => value > 0),
);

const pick = (map, keep) => Object.fromEntries(Object.entries(map).filter(([key]) => keep(key)));

const sumMaps = (a, b) => Object.fromEntries(
  [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, (a[key] ?? 0) + (b[key] ?? 0)]),
);

const measureSegment = (first, last) => (first && last
  ? {
    ms: Math.max(0, last.t - first.t),
    kills: pick(increases(first.bestiary, last.bestiary), isMonsterKey),
    rooms: pick(increases(first.bestiary, last.bestiary), isRoomKey),
    loot: increases(first.loot, last.loot, (entry) => entry?.n),
    supply: spent(first.supply ?? {}, last.supply ?? {}),
  }
  : EMPTY_TOTALS);

const addMeasures = (a, b) => ({
  ms: a.ms + b.ms,
  kills: sumMaps(a.kills, b.kills),
  rooms: sumMaps(a.rooms, b.rooms),
  loot: sumMaps(a.loot, b.loot),
  supply: sumMaps(a.supply ?? {}, b.supply ?? {}),
});

const huntOf = (rooms) => {
  const [top] = Object.entries(rooms).sort(([, a], [, b]) => b - a);
  return top ? top[0].slice(2) : null;
};

export const measure = (session) => addMeasures(session.totals, measureSegment(session.first, session.last));

export const windowOf = (session) => {
  const measured = measure(session);
  return {
    huntId: session.huntId ?? huntOf(measured.rooms),
    minutes: measured.ms / 60000,
    kills: measured.kills,
    rooms: Object.values(measured.rooms).reduce((a, b) => a + b, 0),
    loot: measured.loot,
    supply: measured.supply,
    since: session.since,
  };
};

const lootWentDown = (from, to) => Object.keys(from ?? {}).some((key) => (to[key]?.n ?? 0) < (from[key]?.n ?? 0));

const restart = (session, { reason, t, loot, huntId = session.huntId }) => {
  const last = session.last && loot ? { ...session.last, loot } : session.last;
  return {
    ...session,
    huntId,
    since: { reason, t },
    totals: EMPTY_TOTALS,
    first: last?.bestiary && last?.loot ? { ...last, t } : null,
    last,
  };
};

const followHunt = (session) => {
  const seen = huntOf(measureSegment(session.first, session.last).rooms);
  if (!seen || seen === session.huntId) return session;
  return session.huntId
    ? { ...session, huntId: seen, since: { reason: 'hunt', t: session.first.t }, totals: EMPTY_TOTALS }
    : { ...session, huntId: seen };
};

const supplyWentDown = (from, to) => Object.keys(from ?? {}).some((key) => (to[key]?.g ?? 0) < (from[key]?.g ?? 0));

const rebaseSupply = (session) => ({
  ...session,
  totals: addMeasures(session.totals, measureSegment(session.first, session.last)),
  first: session.first ? { ...session.last, supply: {} } : null,
});

const onSnapshot = (session, { t, bestiary, loot, supply = null }) => {
  if (!bestiary && !loot && !supply) return session;
  const restarted = loot && session.last?.loot && lootWentDown(session.last.loot, loot)
    ? restart(session, { reason: 'analyzer', t, loot: {} })
    : session;
  const base = supply && restarted.last?.supply && supplyWentDown(restarted.last.supply, supply) ? rebaseSupply(restarted) : restarted;
  const last = { t, bestiary: bestiary ?? base.last?.bestiary ?? null, loot: loot ?? base.last?.loot ?? null, supply: supply ?? base.last?.supply ?? null };
  const first = base.first ?? (last.bestiary && last.loot ? last : null);
  return followHunt({ ...base, since: base.since ?? { reason: 'start', t }, first, last });
};

const onReset = (session, { t, reason, loot, huntId }) => restart(session, { reason, t, loot, huntId });

const onConnect = (session, { t }) => ({ ...session, totals: measure(session), first: null, last: null, connectedAt: t });

const HANDLERS = { snapshot: onSnapshot, reset: onReset, connect: onConnect };

export const reduceSession = (session, event) => (HANDLERS[event.type] ?? (() => session))(session, event);

export const segmentOf = (session) => measureSegment(session.first, session.last);

export const isLive = (session) => session.connectedAt == null
  || (session.since?.t ?? -Infinity) >= session.connectedAt
  || (session.huntId != null && huntOf(segmentOf(session).rooms) === session.huntId);

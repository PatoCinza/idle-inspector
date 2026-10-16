export const RECENT_ROOMS = 10;
export const MAX_ROOMS = 300;
export const MIN_RECENT_ROOMS = 3;

const HOUR_MS = 3600000;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const expForLevel = (level) => Math.round((50 / 3) * (level ** 3 - 6 * level ** 2 + 17 * level - 12));

export const totalXp = ({ level, left }) => expForLevel(level + 1) - left;

export const initialXpTrack = () => ({ rooms: [], current: null });

const snapshotOf = (members, t, teamXp) => ({
  t,
  teamXp,
  members: members.map((member) => ({ name: member.name, vocation: member.vocation, level: member.level, xp: totalXp(member), dead: member.dead })),
});

export const reduceXpTrack = (track, { members, room, t }, teamXp) => {
  const base = track ?? initialXpTrack();
  if (!members?.length) return base;
  const current = snapshotOf(members, t, teamXp);
  return room
    ? { current, rooms: [...base.rooms, current].slice(-MAX_ROOMS) }
    : { ...base, current };
};

const byName = (snapshot) => Object.fromEntries(snapshot.members.map((member) => [member.name, member]));

const gained = (from, to) => {
  const before = byName(from);
  return Object.fromEntries(to.members
    .filter((member) => before[member.name])
    .map((member) => [member.name, Math.max(0, member.xp - before[member.name].xp)]));
};

const windowOf = (from, to) => {
  const hours = (to.t - from.t) / HOUR_MS;
  const members = gained(from, to);
  const team = sum(Object.values(members));
  return {
    hours,
    team,
    teamPerHour: hours > 0 ? team / hours : null,
    members: Object.fromEntries(Object.entries(members).map(([name, xp]) => [name, { xp, perHour: hours > 0 ? xp / hours : null }])),
  };
};

const roomWindow = (rooms, count) => {
  const span = Math.min(count, rooms.length - 1);
  return { ...windowOf(rooms[rooms.length - 1 - span], rooms.at(-1)), rooms: span };
};

const deathsOf = (rooms, name) => rooms.filter((room) => room.members.some((member) => member.name === name && member.dead)).length;

export const xpAnalysis = ({ track, pendingTeamXp = 0, now }) => {
  const rooms = track?.rooms ?? [];
  const current = track?.current ?? rooms.at(-1) ?? null;
  if (rooms.length < 2) return { ready: false, rooms: Math.max(0, rooms.length - 1), current };
  const first = rooms[0];
  const last = rooms.at(-1);
  const session = roomWindow(rooms, rooms.length - 1);
  const recent = roomWindow(rooms, RECENT_ROOMS);
  const basis = recent.rooms >= MIN_RECENT_ROOMS ? recent : session;
  const pending = Math.max(0, pendingTeamXp ?? 0);
  const liveHours = (now - first.t) / HOUR_MS;
  const share = (name) => (session.team > 0 ? (session.members[name]?.xp ?? 0) / session.team : 0);
  const members = last.members.map((member) => {
    const perHour = basis.members[member.name]?.perHour ?? null;
    const toLevel = expForLevel(member.level + 1) - member.xp;
    return {
      name: member.name,
      vocation: member.vocation,
      level: member.level,
      dead: current?.members.find((m) => m.name === member.name)?.dead ?? member.dead,
      share: share(member.name),
      sessionPerHour: session.members[member.name]?.perHour ?? null,
      recentPerHour: recent.rooms >= MIN_RECENT_ROOMS ? recent.members[member.name]?.perHour ?? null : null,
      livePerHour: liveHours > 0 ? ((session.members[member.name]?.xp ?? 0) + pending * share(member.name)) / liveHours : null,
      toLevel,
      hoursToLevel: perHour > 0 ? toLevel / perHour : null,
      deaths: deathsOf(rooms, member.name),
    };
  });
  return {
    ready: true,
    rooms: session.rooms,
    since: first.t,
    lastRoomAt: last.t,
    pending,
    team: {
      sessionPerHour: session.teamPerHour,
      recentPerHour: recent.rooms >= MIN_RECENT_ROOMS ? recent.teamPerHour : null,
      livePerHour: liveHours > 0 ? (session.team + pending) / liveHours : null,
      perRoom: session.rooms > 0 ? session.team / session.rooms : null,
      roomSeconds: session.rooms > 0 ? (session.hours * 3600) / session.rooms : null,
    },
    members,
    current,
  };
};

export const AVATAR_MS = 15000;

const transcendence = (payload) => (payload?.rows ?? []).find((row) => row.k === 'transcendence');

const avatarMsOf = (entry) => Number(entry.v) || (Number(entry.n) || 0) * AVATAR_MS;

export const procsFromStats = (payload) => {
  const ms = Number(payload?.ms) || 0;
  const row = transcendence(payload);
  if (!ms || !row) return null;
  return {
    ms,
    avatar: (row.by ?? [])
      .filter((entry) => entry?.name)
      .map((entry) => ({ name: entry.name, vocation: entry.vocation ?? null, ms: avatarMsOf(entry) })),
  };
};

const round1 = (n) => Math.round(n * 10) / 10;

const findAvatar = (procs, member) => procs.avatar.find((entry) => entry.name === member.name)
  ?? procs.avatar.find((entry) => entry.vocation && entry.vocation === member.vocation);

export const avatarUptime = (procs, member) => {
  const entry = procs?.ms > 0 ? findAvatar(procs, member) : null;
  return entry ? round1(Math.min(100, (entry.ms * 100) / procs.ms)) : undefined;
};

export const withAvatar = (party, procs) => party?.map((member) => {
  const uptime = avatarUptime(procs, member);
  return uptime === undefined ? member : { ...member, avatarUptime: uptime };
}) ?? null;

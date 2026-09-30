const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);

export const variance = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
};

export const median = (xs) => {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const summarize = (xs) => ({ n: xs.length, mean: mean(xs), std: Math.sqrt(variance(xs)), median: median(xs) });

export const withoutPauses = (xs, factor = 3) => {
  const limit = factor * median(xs);
  return { kept: xs.filter((x) => x <= limit), dropped: xs.filter((x) => x > limit).length };
};

const T_975 = [[1, 12.71], [2, 4.3], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [8, 2.31], [10, 2.23], [15, 2.13], [20, 2.09], [30, 2.04], [60, 2.0], [Infinity, 1.96]];

export const tCritical = (df) => {
  if (!(df > 1)) return T_975[0][1];
  const upper = T_975.findIndex(([d]) => d >= df);
  const [d1, t1] = T_975[upper - 1];
  const [d2, t2] = T_975[upper];
  return d2 === Infinity ? t2 : t1 + ((df - d1) / (d2 - d1)) * (t2 - t1);
};

const welch = (a, b) => {
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { se: Math.sqrt(va + vb), df };
};

export const rateChange = (base, test) => {
  if (base.length < 2 || test.length < 2) return null;
  const { se, df } = welch(base, test);
  const margin = tCritical(df) * se;
  const diff = mean(test) - mean(base);
  return { change: diff / mean(base), low: (diff - margin) / mean(base), high: (diff + margin) / mean(base), df };
};

export const throughputChange = (baseDurations, testDurations) => rateChange(testDurations, baseDurations);

export const diffMs = (base, test) => {
  if (base.length < 2 || test.length < 2) return null;
  const { se, df } = welch(base, test);
  const diff = mean(test) - mean(base);
  const margin = tCritical(df) * se;
  return { diff, low: diff - margin, high: diff + margin };
};

export const verdict = (interval, [minBreakEven, maxBreakEven]) => {
  if (!interval) return 'sem dados';
  if (interval.low > maxBreakEven) return 'compensa';
  if (interval.high < minBreakEven) return 'não compensa';
  if (interval.low > minBreakEven) return 'compensa se a hunt for limitada por movimento';
  return 'inconclusivo';
};

export const samplesNeeded = (cv, halfWidth) => Math.ceil(2 * ((1.96 * cv) / halfWidth) ** 2);

const diffs = (times) => times.slice(1).map((t, i) => t - times[i]);

export const roomDurations = (timeline) => diffs((timeline.rooms ?? []).map(([t]) => t));

export const phaseDurations = (timeline) => (timeline.phases ?? []).map(([, ms]) => ms).filter((ms) => ms > 0);

const boundaries = (timeline) => [...(timeline.rooms ?? []), ...(timeline.phases ?? [])].map(([t]) => t);
const crosses = (timeline) => {
  const marks = boundaries(timeline);
  return (from, to) => marks.some((t) => t > from && t < to);
};

export const waveGaps = (timeline) => {
  const waves = timeline.waves ?? [];
  const between = crosses(timeline);
  return waves.slice(1).map((wave, i) => ({ ms: wave[0] - waves[i][0], crossesRoom: between(waves[i][0], wave[0]) }));
};

export const engageDelays = (timeline) => {
  const waves = timeline.waves ?? [];
  const engages = timeline.engages ?? [];
  const between = crosses(timeline);
  return waves
    .map((wave, i) => {
      const until = waves[i + 1]?.[0] ?? Infinity;
      const engage = engages.find((t) => t > wave[0] && t < until);
      return engage == null ? null : { ms: engage - wave[0], crossesRoom: between(wave[0], engage) };
    })
    .filter(Boolean);
};

const split = (entries) => ({
  inRoom: entries.filter((e) => !e.crossesRoom).map((e) => e.ms),
  transition: entries.filter((e) => e.crossesRoom).map((e) => e.ms),
});

export const IDLE_RANGE = { min: 2500, max: 20000 };

export const idleTime = (timeline, { min, max } = IDLE_RANGE) => {
  const marks = [...(timeline.waves ?? []), ...(timeline.rooms ?? []), ...(timeline.phases ?? [])].map(([t]) => t);
  const gaps = (timeline.idle ?? [])
    .filter(([, ms]) => ms > min && ms < max)
    .map(([end, ms]) => ({ ms, betweenWaves: marks.some((t) => t > end - ms && t < end) }));
  const total = (list) => sum(list.map((g) => g.ms));
  return { total: total(gaps), betweenWaves: total(gaps.filter((g) => g.betweenWaves)), measured: Boolean(timeline.idle) };
};

export const blockStats = (payload) => {
  const timeline = payload.timeline ?? {};
  const kills = sum(Object.values(payload.kills ?? {}));
  const signatures = [...new Set((timeline.charms ?? []).map(([, sig]) => sig))];
  return {
    label: payload.label ?? null,
    signature: payload.signature ?? signatures.at(-1) ?? null,
    mixedCharms: signatures.length > 1,
    huntId: payload.huntId,
    minutes: payload.minutes,
    kills,
    rooms: payload.rooms ?? 0,
    killsPerHour: payload.minutes > 0 ? (kills * 60) / payload.minutes : 0,
    roomTimes: roomDurations(timeline),
    phaseTimes: phaseDurations(timeline),
    since: payload.since ?? null,
    waveGaps: split(waveGaps(timeline)),
    engage: split(engageDelays(timeline)),
    timed: Boolean(payload.timeline),
    idle: idleTime(timeline),
    charmMs: payload.charmStats?.ms ?? 0,
    procs: Object.fromEntries((payload.charmStats?.rows ?? []).map((row) => [row.id, row.n ?? 0])),
  };
};

export const idleShare = (blocks) => {
  const measured = blocks.filter((b) => b.idle?.measured);
  const ms = sum(measured.map((b) => b.minutes * 60000));
  return ms > 0
    ? { total: sum(measured.map((b) => b.idle.total)) / ms, betweenWaves: sum(measured.map((b) => b.idle.betweenWaves)) / ms }
    : null;
};

export const procsPerHour = (blocks) => {
  const ms = sum(blocks.map((b) => b.charmMs ?? 0));
  const ids = [...new Set(blocks.flatMap((b) => Object.keys(b.procs ?? {})))];
  return ms > 0
    ? Object.fromEntries(ids.map((id) => {
      const n = sum(blocks.map((b) => b.procs?.[id] ?? 0));
      return [id, { n, perHour: (n * 3600000) / ms, low: (Math.max(0, n - 1.96 * Math.sqrt(n)) * 3600000) / ms, high: ((n + 1.96 * Math.sqrt(n)) * 3600000) / ms }];
    }))
    : {};
};

export const roomsFor = (durations, halfWidth) => {
  const cv = Math.sqrt(variance(durations)) / mean(durations);
  return Number.isFinite(cv) ? samplesNeeded(cv, halfWidth) : null;
};

export const groupBlocks = (blocks, keyOf) => blocks.reduce((groups, block) => {
  const key = keyOf(block);
  return { ...groups, [key]: [...(groups[key] ?? []), block] };
}, {});

export const pool = (blocks, pauseFactor = 3) => {
  const flat = (pick) => withoutPauses(blocks.flatMap(pick), pauseFactor).kept;
  const rooms = withoutPauses(blocks.flatMap((b) => b.roomTimes), pauseFactor);
  const phases = withoutPauses(blocks.flatMap((b) => b.phaseTimes ?? []), pauseFactor);
  const minutes = sum(blocks.map((b) => b.minutes));
  return {
    blocks: blocks.length,
    minutes,
    killsPerHour: minutes > 0 ? (sum(blocks.map((b) => b.kills)) * 60) / minutes : 0,
    blockKillsPerHour: blocks.map((b) => b.killsPerHour),
    roomTimes: rooms.kept,
    pauses: rooms.dropped,
    phaseTimes: phases.kept,
    waveGaps: { inRoom: flat((b) => b.waveGaps.inRoom), transition: flat((b) => b.waveGaps.transition) },
    engage: { inRoom: flat((b) => b.engage.inRoom), transition: flat((b) => b.engage.transition) },
    procs: procsPerHour(blocks),
    idle: idleShare(blocks),
  };
};

export const compareGroups = (base, test, breakEven) => {
  const rooms = throughputChange(base.roomTimes, test.roomTimes);
  const phases = throughputChange(base.phaseTimes, test.phaseTimes);
  const blocks = rateChange(base.blockKillsPerHour, test.blockKillsPerHour);
  const primary = rooms ?? phases;
  const samples = rooms ? base.roomTimes : base.phaseTimes;
  const cv = Math.sqrt(variance(samples)) / mean(samples);
  const target = Math.max(0.002, (breakEven[1] - breakEven[0]) / 2);
  return {
    rooms,
    phases,
    blocks,
    killsPerHour: base.killsPerHour > 0 ? test.killsPerHour / base.killsPerHour - 1 : null,
    engageTransition: diffMs(base.engage.transition, test.engage.transition),
    engageInRoom: diffMs(base.engage.inRoom, test.engage.inRoom),
    waveInRoom: diffMs(base.waveGaps.inRoom, test.waveGaps.inRoom),
    verdict: verdict(primary, breakEven),
    roomsNeeded: Number.isFinite(cv) ? samplesNeeded(cv, target) : null,
  };
};

export const signatureParts = (signature) => new Set((signature ?? '').split(',').filter(Boolean));

export const signatureDiff = (base, test) => {
  const a = signatureParts(base);
  const b = signatureParts(test);
  return { removed: [...a].filter((p) => !b.has(p)), added: [...b].filter((p) => !a.has(p)) };
};

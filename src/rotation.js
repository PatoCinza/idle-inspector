import { spellIndex } from './spells.js';

export const TICK_MS = 40;
export const ECHO_SLACK_MS = 300;
export const IDLE_GAP_MS = 10000;
export const MAX_ROOMS = 300;

export const EMPTY_ROTATION = { time: {}, members: {}, rooms: [] };

export const initialAttribution = () => ({ period: 'mobs', t: null, slots: {}, atk: {}, open: [], room: null });

const asList = (payload) => (Array.isArray(payload) ? payload : [payload]).filter(Boolean);

const FROM_MESSAGE = {
  fx: (payload) => asList(payload).flatMap((effect) => {
    if (effect.t === 'cd' && effect.group === 'attack' && effect.words) return [{ kind: 'cast', slot: effect.slot, words: effect.words }];
    if (effect.t === 'atk' && effect.memberId != null) return [{ kind: 'atk', slot: effect.memberId }];
    return [];
  }),
  combatlog: (payload) => asList(payload)
    .filter((entry) => entry.k === 'dealt' && entry.voc && Number.isFinite(entry.amount))
    .map(({ voc, amount, el, crit, foe }) => ({ kind: 'dealt', voc, amount, el, crit: Boolean(crit), foe: foe?.name ?? null })),
  notify: (payload) => {
    if (payload?.kind === 'wave') return [{ kind: 'wave', n: Number(payload.params?.n), total: Number(payload.params?.total) || 10 }];
    if (payload?.kind === 'phase') return [{ kind: 'room', ms: Number(payload.params?.ms) || 0 }];
    return [];
  },
};

export const ROTATION_MESSAGES = new Set(Object.keys(FROM_MESSAGE));

export const inputsFromMessage = (type, payload) => FROM_MESSAGE[type]?.(payload) ?? [];

const latest = (list, keep) => list.reduce((found, item) => (keep(item) ? item : found), null);

const elementMatches = (spell, element) => !spell || spell.element === 'physical' || spell.element === element;

const addCastToRoom = (room, { voc, words, dealt }) => {
  const current = room[voc]?.[words] ?? { casts: 0, dealt: 0, sq: 0 };
  return { ...room, [voc]: { ...room[voc], [words]: { casts: current.casts + 1, dealt: current.dealt + dealt, sq: current.sq + dealt ** 2 } } };
};

const roomWith = (room, casts) => casts.filter((cast) => cast.period === 'mobs').reduce(addCastToRoom, room);

export const rotationOfRoom = (room) => Object.fromEntries(Object.entries(room.spells ?? {}).map(([voc, spells]) => [voc, Object.keys(spells).sort()]));

const replaceCast = (open, from, to) => open.map((cast) => (cast === from ? to : cast));

const slotOf = (slots, voc) => Object.keys(slots).find((slot) => slots[slot] === voc);

const addNormal = (normal, foe, amount) => {
  const key = foe ?? '?';
  const current = normal[key] ?? { hits: 0, dealt: 0, sq: 0 };
  return { ...normal, [key]: { hits: current.hits + 1, dealt: current.dealt + amount, sq: current.sq + amount ** 2 } };
};

const castRecord = ({ voc, words, period, dealt, hits, crits, critDealt, echo, normal }) => ({ r: 'cast', voc, words, period, dealt, hits, crits, critDealt, echo, normal });

const closeDue = (state, t) => {
  const due = state.open.filter((cast) => t > cast.closesAt && cast.voc);
  return {
    state: { ...state, open: state.open.filter((cast) => t <= cast.closesAt), room: state.room && roomWith(state.room, due) },
    records: due.map(castRecord),
  };
};

const elapsed = (state, t) => (state.t !== null && t > state.t && t - state.t <= IDLE_GAP_MS
  ? [{ r: 'time', period: state.period, ms: t - state.t }]
  : []);

const onCast = (index) => (state, { slot, words }, t) => {
  const spell = index[words];
  const own = spell?.vocs?.length === 1 ? spell.vocs[0] : null;
  const voc = own ?? state.slots[slot] ?? null;
  const cast = {
    slot, voc, words, t, period: state.period,
    closesAt: t + (spell?.echoMs ? spell.echoMs + ECHO_SLACK_MS : TICK_MS),
    dealt: 0, hits: 0, crits: 0, critDealt: 0, echo: 0, normal: {},
  };
  const next = { ...state, slots: own ? { ...state.slots, [slot]: own } : state.slots };
  return { state: { ...next, open: [...state.open, cast] }, records: [] };
};

const onAtk = (state, { slot }, t) => ({ state: { ...state, atk: { ...state.atk, [slot]: t } }, records: [] });

const credit = (state, cast, entry, { echo }) => {
  const voc = cast.voc ?? entry.voc;
  const updated = {
    ...cast,
    voc,
    dealt: cast.dealt + entry.amount,
    hits: cast.hits + 1,
    crits: cast.crits + (entry.crit ? 1 : 0),
    critDealt: cast.critDealt + (entry.crit ? entry.amount : 0),
    echo: cast.echo + (echo ? entry.amount : 0),
    normal: entry.crit ? cast.normal : addNormal(cast.normal, entry.foe, entry.amount),
  };
  const resolved = cast.voc ? state : { ...state, slots: { ...state.slots, [cast.slot]: voc } };
  return { state: { ...resolved, open: replaceCast(state.open, cast, updated) }, records: [] };
};

const loose = (state, entry, source) => ({
  state,
  records: [{ r: 'hit', voc: entry.voc, period: state.period, source, amount: entry.amount, crit: entry.crit }],
});

const canOwn = (index, voc) => (cast) => cast.voc === voc
  || (cast.voc === null && (index[cast.words]?.vocs ?? [voc]).includes(voc));

const onDealt = (index) => (state, entry, t) => {
  const fresh = latest(state.open, (cast) => t - cast.t <= TICK_MS && canOwn(index, entry.voc)(cast));
  if (fresh && elementMatches(index[fresh.words], entry.el)) return credit(state, fresh, entry, { echo: false });
  const atkAt = state.atk[slotOf(state.slots, entry.voc)];
  if (atkAt != null && t - atkAt <= TICK_MS) return loose(state, entry, 'auto');
  const echo = latest(state.open, (cast) => {
    const spell = index[cast.words];
    return cast.voc === entry.voc && spell?.echoMs && Math.abs(t - cast.t - spell.echoMs) <= ECHO_SLACK_MS && elementMatches(spell, entry.el);
  });
  if (echo) return credit(state, echo, entry, { echo: true });
  return loose(state, entry, fresh ? 'proc' : 'other');
};

const onWave = (state, { n, total }) => ({ state: { ...state, period: n >= total - 1 ? 'boss' : 'mobs' }, records: [] });

const onRoom = (state, { ms }) => ({
  state: { ...state, period: 'mobs', room: {} },
  records: state.room && ms > 0 ? [{ r: 'room', ms, spells: state.room }] : [],
});

const STEPS = (index) => ({ cast: onCast(index), atk: onAtk, dealt: onDealt(index), wave: onWave, room: onRoom });

const COMBAT = new Set(['cast', 'atk', 'dealt']);

const clocked = (state, inputs, t) => (inputs.some((input) => COMBAT.has(input.kind))
  ? { state: { ...state, t }, records: elapsed(state, t) }
  : { state, records: [] });

export const createAttribution = (spells) => {
  const steps = STEPS(spellIndex(spells));
  return (state, inputs, t) => {
    const clock = clocked(state, inputs, t);
    const closed = closeDue(clock.state, t);
    return inputs.reduce((acc, input) => {
      const step = steps[input.kind](acc.state, input, t);
      return { state: step.state, records: [...acc.records, ...step.records] };
    }, { state: closed.state, records: [...clock.records, ...closed.records] });
  };
};

const sumFields = (a = {}, b = {}) => Object.fromEntries(
  [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, (a[key] ?? 0) + (b[key] ?? 0)]),
);

const mergeKeys = (a = {}, b = {}, merge) => Object.fromEntries(
  [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, merge(a[key], b[key])]),
);

const mergeSpell = (a, b) => {
  const { normal: na, ...ra } = a ?? {};
  const { normal: nb, ...rb } = b ?? {};
  return { ...sumFields(ra, rb), normal: mergeKeys(na, nb, sumFields) };
};

const mergePeriod = (a, b) => ({
  spells: mergeKeys(a?.spells, b?.spells, mergeSpell),
  loose: mergeKeys(a?.loose, b?.loose, sumFields),
});

const mergeMember = (a, b) => mergeKeys(a, b, mergePeriod);

export const mergeRotation = (a, b) => ({
  time: sumFields(a?.time, b?.time),
  members: mergeKeys(a?.members, b?.members, mergeMember),
  rooms: [...(a?.rooms ?? []), ...(b?.rooms ?? [])].slice(-MAX_ROOMS),
});

const castStats = ({ dealt, hits, crits, critDealt, echo, normal }) => ({ casts: 1, dealt, sq: dealt ** 2, hits, crits, critDealt, echo, normal });

const hitStats = ({ amount, crit }) => ({ hits: 1, dealt: amount, crits: crit ? 1 : 0 });

const memberDelta = (voc, period, part) => ({ members: { [voc]: { [period]: part } } });

const RECORD = {
  time: ({ period, ms }) => ({ time: { [period]: ms } }),
  cast: (record) => memberDelta(record.voc, record.period, { spells: { [record.words]: castStats(record) } }),
  hit: (record) => memberDelta(record.voc, record.period, { loose: { [record.source]: hitStats(record) } }),
  room: ({ ms, spells }) => ({ rooms: [{ ms, spells }] }),
};

export const addRecords = (stats, records) => records.reduce((acc, record) => mergeRotation(acc, RECORD[record.r](record)), stats ?? EMPTY_ROTATION);

export const hasRotation = (stats) => Object.keys(stats?.members ?? {}).length > 0 || (stats?.rooms ?? []).length > 0;

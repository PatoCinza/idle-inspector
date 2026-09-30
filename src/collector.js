(() => {
  const VERSION = 6;
  if ((window.blp?.version ?? 0) >= VERSION) {
    console.log('[BLP] O coletor já está ativo nesta aba. Use blp.status() ou blp.report().');
    return;
  }
  const PREFIX = 'BLP1.';
  const decoder = new TextDecoder();

  const readMsgpack = (bytes, start) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = start;
    const str = (n) => { const s = decoder.decode(bytes.subarray(pos, pos + n)); pos += n; return s; };
    const arr = (n) => Array.from({ length: n }, () => next());
    const map = (n) => Object.fromEntries(Array.from({ length: n }, () => [next(), next()]));
    const u = (size, get) => { const v = view[get](pos); pos += size; return v; };
    const next = () => {
      const b = bytes[pos++];
      if (b <= 0x7f) return b;
      if (b >= 0xe0) return b - 256;
      if ((b & 0xe0) === 0xa0) return str(b & 0x1f);
      if ((b & 0xf0) === 0x90) return arr(b & 0x0f);
      if ((b & 0xf0) === 0x80) return map(b & 0x0f);
      switch (b) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xca: return u(4, 'getFloat32');
        case 0xcb: return u(8, 'getFloat64');
        case 0xcc: return u(1, 'getUint8');
        case 0xcd: return u(2, 'getUint16');
        case 0xce: return u(4, 'getUint32');
        case 0xcf: return Number(u(8, 'getBigUint64'));
        case 0xd0: return u(1, 'getInt8');
        case 0xd1: return u(2, 'getInt16');
        case 0xd2: return u(4, 'getInt32');
        case 0xd3: return Number(u(8, 'getBigInt64'));
        case 0xd9: return str(u(1, 'getUint8'));
        case 0xda: return str(u(2, 'getUint16'));
        case 0xdb: return str(u(4, 'getUint32'));
        case 0xdc: return arr(u(2, 'getUint16'));
        case 0xdd: return arr(u(4, 'getUint32'));
        case 0xde: return map(u(2, 'getUint16'));
        case 0xdf: return map(u(4, 'getUint32'));
        default: throw new Error(`msgpack 0x${b.toString(16)}`);
      }
    };
    const value = next();
    return { value, end: pos };
  };

  const printableRuns = (bytes) => {
    const runs = [];
    let from = -1;
    for (let i = 0; i <= bytes.length; i++) {
      const printable = bytes[i] >= 32 && bytes[i] < 127;
      if (printable && from < 0) from = i;
      if (!printable && from >= 0) {
        if (i - from >= 12) runs.push(decoder.decode(bytes.subarray(from, i)));
        from = -1;
      }
    }
    return runs;
  };

  const jsonIn = (text) => {
    const at = text.indexOf('{');
    if (at < 0) return null;
    try { return JSON.parse(text.slice(at)); } catch { return null; }
  };

  const isBestiary = (obj) => obj && typeof obj === 'object' && Object.keys(obj).some((k) => k.startsWith('h:'));
  const isTracker = (obj) => obj && typeof obj === 'object'
    && Object.values(obj).some((v) => v && typeof v === 'object' && 'n' in v && 'g' in v);
  const isLootTracker = (obj) => isTracker(obj) && Object.keys(obj).some((k) => k.endsWith(' coin'));

  const isBackpack = (obj) => obj && typeof obj === 'object' && Array.isArray(obj.gear) && obj.codex;

  const state = {
    startedAt: Date.now(),
    label: null,
    events: [],
    awaitingEngage: false,
    lastAttack: null,
    dealt: { hits: 0, amount: 0 },
    signature: null,
    baseline: { charmStats: null, procStats: null },
    since: { reason: 'script', t: Date.now() },
    combat: {},
    codex: null,
    first: null,
    last: null,
    charms: null,
    charmStats: null,
    procStats: null,
    errors: 0,
    sockets: new WeakSet(),
  };

  const snapshot = (bestiary, loot) => ({ t: Date.now(), bestiary, loot });

  const record = (type, fields = {}) => state.events.push({ t: Date.now(), type, ...fields });

  const REASONS = {
    manual: 'blp.reset()',
    analyzer: 'Hunt Analyzer zerado',
    hunt: 'troca de hunt',
  };

  const rebaseline = (reason, loot = null) => {
    const t = Date.now();
    if (state.last && loot) state.last = { ...state.last, loot };
    state.first = state.last?.bestiary && state.last?.loot ? { ...state.last, t } : null;
    state.events = [];
    state.combat = {};
    state.awaitingEngage = false;
    state.lastAttack = null;
    state.dealt = { hits: 0, amount: 0 };
    state.baseline = { charmStats: state.charmStats, procStats: state.procStats };
    state.since = { reason, t };
    if (state.signature != null) record('charms', { sig: state.signature });
    console.log(`[BLP] Janela reiniciada (${REASONS[reason] ?? reason})${state.label ? ` · bloco "${state.label}"` : ''}.`);
  };

  const lootWentDown = (from, to) => Object.keys(from ?? {}).some((k) => (to[k]?.n ?? 0) < (from[k]?.n ?? 0));

  const isRoomKey = (k) => k.startsWith('h:');
  const isMonsterKey = (k) => !isRoomKey(k) && k !== 'bp';
  const increase = (from, to, keep) => Object.keys(to)
    .filter(keep)
    .reduce((total, k) => total + Math.max(0, (Number(to[k]) || 0) - (Number(from[k]) || 0)), 0);

  const recordProgress = (from, to) => {
    if (!from || !to) return;
    const rooms = increase(from, to, isRoomKey);
    const kills = increase(from, to, isMonsterKey);
    if (kills > 0) record('kill', { n: kills });
    if (rooms > 0) record('room', { n: rooms });
  };

  const onPatch = (bytes) => {
    let bestiary = null;
    let loot = null;
    for (const run of printableRuns(bytes)) {
      const obj = jsonIn(run);
      if (!bestiary && isBestiary(obj)) bestiary = obj;
      else if (!loot && isLootTracker(obj)) loot = obj;
      else if (isBackpack(obj)) state.codex = obj.codex;
    }
    if (!bestiary && !loot) return;
    if (loot && state.last?.loot && lootWentDown(state.last.loot, loot)) rebaseline('analyzer', {});
    if (bestiary) recordProgress(state.last?.bestiary, bestiary);
    const merged = snapshot(bestiary ?? state.last?.bestiary ?? null, loot ?? state.last?.loot ?? null);
    state.last = merged;
    if (!state.first && merged.bestiary && merged.loot) state.first = merged;
  };

  const markEngage = () => {
    if (!state.awaitingEngage) return;
    state.awaitingEngage = false;
    record('engage');
  };

  const IDLE_MS = 1500;

  const onAttack = () => {
    const t = Date.now();
    markEngage();
    if (state.lastAttack != null && t - state.lastAttack > IDLE_MS) record('idle', { ms: t - state.lastAttack });
    state.lastAttack = t;
  };

  const onDamage = (effect) => {
    state.dealt = { hits: state.dealt.hits + 1, amount: state.dealt.amount + (Number(effect.amount) || 0) };
  };

  const onFx = (effect) => {
    if (effect?.t === 'atk') onAttack();
    else if (effect?.t === 'hit' && !effect.player) onDamage(effect);
  };

  const addHit = (entry) => {
    if (entry?.k !== 'dealt' || !entry.name) return;
    markEngage();
    const current = state.combat[entry.name] ?? { hits: 0, dealt: 0, crits: 0 };
    state.combat[entry.name] = {
      hits: current.hits + 1,
      dealt: current.dealt + (Number(entry.amount) || 0),
      crits: current.crits + (entry.crit ? 1 : 0),
    };
  };

  const signatureOf = (slots) => Object.entries(slots ?? {})
    .filter(([, slot]) => slot?.monsterKey)
    .map(([id, slot]) => `${id}>${slot.monsterKey}`)
    .sort()
    .join(',');

  const onCharms = (payload) => {
    state.charms = payload;
    const signature = signatureOf(payload?.slots);
    if (signature === state.signature) return;
    state.signature = signature;
    record('charms', { sig: signature });
  };

  const NOTIFY = {
    wave: (params) => {
      state.awaitingEngage = true;
      record('wave', { n: params?.n ?? null, total: params?.total ?? null });
    },
    phase: (params) => record('phase', { ms: Number(params?.ms) || 0 }),
  };

  const onNotify = (payload) => NOTIFY[payload?.kind]?.(payload.params);

  const HANDLERS = {
    combatlog: (payload) => (Array.isArray(payload) ? payload : []).forEach(addHit),
    charms: onCharms,
    procstats: (payload) => { state.procStats = payload; },
    charmstats: (payload) => { state.charmStats = payload; },
    notify: onNotify,
    fx: (payload) => (Array.isArray(payload) ? payload : [payload]).forEach(onFx),
  };

  const onMessage = (bytes) => {
    try {
      const type = readMsgpack(bytes, 1);
      const handler = HANDLERS[type.value];
      if (handler) handler(readMsgpack(bytes, type.end).value);
    } catch {
      state.errors += 1;
    }
  };

  const listen = (event) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(event.data);
    if (bytes[0] === 15 || bytes[0] === 14) onPatch(bytes);
    else if (bytes[0] === 13) onMessage(bytes);
  };

  const OUTGOING = {
    resetstats: ({ panel } = {}) => {
      if (panel === 'hunt' || panel === 'loot') rebaseline('analyzer', {});
      if (panel === 'charman') state.baseline.charmStats = null;
      if (panel === 'procan') state.baseline.procStats = null;
    },
    stage: () => rebaseline('hunt'),
  };

  const bytesOf = (data) => {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return null;
  };

  const onSend = (data) => {
    const bytes = bytesOf(data);
    if (bytes?.[0] !== 13) return;
    try {
      const type = readMsgpack(bytes, 1);
      const handler = OUTGOING[type.value];
      if (handler) handler(type.end < bytes.length ? readMsgpack(bytes, type.end).value : undefined);
    } catch {
      state.errors += 1;
    }
  };

  const originalSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function send(data) {
    onSend(data);
    if (!state.sockets.has(this)) {
      state.sockets.add(this);
      this.addEventListener('message', listen);
    }
    return originalSend.call(this, data);
  };

  const number = (text) => Number(String(text).replace(/\./g, '').replace(',', '.'));
  const VOCATIONS = /^(Knight|Druid|Sorcerer|Paladin|Monk) · (.+)$/;

  const statsPanel = () => {
    const header = [...document.querySelectorAll('body *')]
      .find((el) => el.children.length === 0 && /^(Bônus|Bonuses) \((itens|items)/.test(el.textContent.trim()));
    let node = header;
    for (let i = 0; node && i < 5 && node.innerText.length < 400; i++) node = node.parentElement;
    return node;
  };

  const parseCharacter = (text) => {
    const head = text.split(/Capacidade|Capacity/)[0];
    const bonus = text.split(/Bônus \(itens|Bonuses \(items/)[1]?.split(/Proficiência|Proficiency|Addon/)[0] ?? '';
    const percent = (pattern) => {
      const match = bonus.match(pattern);
      return match ? Number(match[1].replace(',', '.')) : 0;
    };
    return {
      level: number(head.match(/(?:Nível|Level)\s*([\d.]+)/)?.[1] ?? 0),
      maxHp: number(head.match(/(?:Pontos de Vida|Hit Points)\s*([\d.]+)/)?.[1] ?? 0),
      maxMana: number(head.match(/Mana\s*([\d.]+)/)?.[1] ?? 0),
      lootPct: percent(/Loot\s*\+?([\d.,]+)%/),
      critChance: percent(/(?:Chance de crítico|Crit chance)\s*\+?([\d.,]+)%/),
      critDmg: percent(/(?:Dano crítico|Crit damage)\s*\+?([\d.,]+)%/),
    };
  };

  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  const readParty = async () => {
    const buttons = [...document.querySelectorAll('button,[role=button]')]
      .map((el) => ({ el, match: (el.getAttribute('aria-label') || el.title || el.textContent.trim()).match(VOCATIONS) }))
      .filter((b) => b.match);
    const unique = buttons.filter((b, i) => buttons.findIndex((o) => o.match[2] === b.match[2]) === i);
    const party = [];
    for (const { el, match } of unique) {
      el.click();
      await wait(350);
      const panel = statsPanel();
      party.push({ name: match[2], vocation: match[1].toLowerCase(), ...(panel ? parseCharacter(panel.innerText) : {}) });
    }
    unique[0]?.el.click();
    return party;
  };

  const readCards = () => [...document.querySelectorAll('#charms-modal .charm-card')].map((card) => {
    const frame = card.querySelector('.charm-rune-frame');
    const grade = frame?.style.backgroundImage.match(/grade(\d)/)?.[1];
    return {
      name: card.querySelector('.charm-card-name')?.textContent.trim(),
      tier: grade ? Number(grade) : 0,
      creature: card.querySelector('.charm-creature-box')?.title || null,
    };
  });

  const readCharms = async () => {
    const toggle = document.getElementById('tab-charms');
    const modal = document.getElementById('charms-modal');
    if (!toggle || !modal) return null;
    const wasOpen = !modal.classList.contains('hidden');
    if (!wasOpen) toggle.click();
    await wait(400);
    const cards = [];
    for (const tab of [...document.querySelectorAll('#charms-modal .charm-cat-tab')]) {
      tab.click();
      await wait(350);
      cards.push(...readCards());
    }
    if (!wasOpen) document.getElementById('charms-modal-close')?.click();
    return cards.filter((c) => c.name && c.tier > 0);
  };

  const huntCodex = (codex) => codex && {
    done: (codex.done ?? []).filter((id) => id.startsWith('hunt-')),
    prog: Object.fromEntries(Object.entries(codex.prog ?? {}).filter(([id]) => id.startsWith('hunt-'))),
  };

  const validBase = (base, current) => (base && current && current.ms >= base.ms ? base : null);

  const charmStatsSince = (base, current) => current && base && {
    ...current,
    ms: current.ms - base.ms,
    rows: (current.rows ?? []).map((row) => {
      const before = base.rows?.find((r) => r.id === row.id);
      return { ...row, n: (row.n ?? 0) - (before?.n ?? 0), v: (row.v ?? 0) - (before?.v ?? 0) };
    }),
  };

  const transcendence = (stats, name) => stats?.rows?.find((r) => r.k === 'transcendence')?.by?.find((b) => b.name === name);

  const AVATAR_MS = 15000;
  const avatarUptime = (name) => {
    const row = transcendence(state.procStats, name);
    const base = validBase(state.baseline.procStats, state.procStats);
    const procs = (row?.n ?? 0) - (transcendence(base, name)?.n ?? 0);
    const ms = (state.procStats?.ms ?? 0) - (base?.ms ?? 0);
    return row && ms > 0 ? Number(Math.min(100, (procs * AVATAR_MS * 100) / ms).toFixed(1)) : undefined;
  };

  const withCombat = (member) => {
    const combat = state.combat[member.name];
    const measured = combat?.hits ? { avgHit: Math.round(combat.dealt / combat.hits), hits: combat.hits, dealt: combat.dealt } : {};
    return { ...member, ...measured, avatarUptime: avatarUptime(member.name) };
  };

  const delta = (from = {}, to = {}) => Object.fromEntries(
    Object.keys(to)
      .map((k) => [k, (to[k] ?? 0) - (from[k] ?? 0)])
      .filter(([, v]) => typeof v === 'number' && v > 0),
  );

  const lootDelta = (from = {}, to = {}) => Object.fromEntries(
    Object.keys(to)
      .map((k) => [k, (to[k]?.n ?? 0) - (from[k]?.n ?? 0)])
      .filter(([, v]) => v > 0),
  );

  const timeline = (from, to) => {
    const inWindow = state.events.filter((e) => e.t >= from && e.t <= to);
    const at = (e) => e.t - from;
    const ofType = (type) => inWindow.filter((e) => e.type === type);
    return {
      waves: ofType('wave').map((e) => [at(e), e.n, e.total]),
      engages: ofType('engage').map(at),
      idle: ofType('idle').map((e) => [at(e), e.ms]),
      rooms: ofType('room').map((e) => [at(e), e.n]),
      kills: ofType('kill').map((e) => [at(e), e.n]),
      phases: ofType('phase').map((e) => [at(e), e.ms]),
      charms: [
        ...state.events.filter((e) => e.type === 'charms' && e.t < from).slice(-1).map((e) => [0, e.sig]),
        ...ofType('charms').map((e) => [at(e), e.sig]),
      ],
    };
  };

  const encode = (payload) => PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));

  const report = async (options = {}) => {
    if (!state.first || !state.last || state.last.t === state.first.t) {
      console.warn('[BLP] Ainda sem dados suficientes. Deixe a hunt rodando alguns minutos e chame blp.report() de novo.');
      return null;
    }
    const minutes = (state.last.t - state.first.t) / 60000;
    const kills = delta(state.first.bestiary, state.last.bestiary);
    const huntKey = Object.keys(kills).find((k) => k.startsWith('h:'));
    const monsterKills = Object.fromEntries(Object.entries(kills).filter(([k]) => !k.startsWith('h:') && k !== 'bp'));
    const payload = {
      v: VERSION,
      label: options.label ?? state.label,
      startedAt: state.first.t,
      since: state.since.reason,
      minutes: Number(minutes.toFixed(2)),
      huntId: huntKey ? huntKey.slice(2) : null,
      rooms: huntKey ? kills[huntKey] : null,
      kills: monsterKills,
      bestiary: Object.fromEntries(Object.keys(monsterKills).map((k) => [k, state.last.bestiary[k]])),
      loot: state.first.loot && state.last.loot ? lootDelta(state.first.loot, state.last.loot) : null,
      party: (await readParty()).map(withCombat),
      charms: await readCharms(),
      charmSlots: state.charms?.slots ?? null,
      charmStats: charmStatsSince(validBase(state.baseline.charmStats, state.charmStats), state.charmStats) ?? state.charmStats,
      codex: huntCodex(state.codex),
      signature: state.signature,
      dealt: state.dealt.hits ? { hits: state.dealt.hits, avgHit: Math.round(state.dealt.amount / state.dealt.hits) } : null,
      timeline: timeline(state.first.t, state.last.t),
    };
    const code = encode(payload);
    const copied = await navigator.clipboard.writeText(code).then(() => true, () => false);
    if (copied) console.log('[BLP] Código copiado para a área de transferência.');
    console.log(`[BLP] ${payload.minutes} min · ${Object.values(monsterKills).reduce((a, b) => a + b, 0)} kills · ${payload.rooms ?? '?'} salas`);
    console.log(code);
    return payload;
  };

  const status = () => {
    const minutes = state.first && state.last ? ((state.last.t - state.first.t) / 60000).toFixed(1) : '0';
    const waves = state.first ? state.events.filter((e) => e.type === 'wave' && e.t >= state.first.t).length : 0;
    const label = state.label ? ` · bloco "${state.label}"` : '';
    const since = `desde ${new Date(state.since.t).toLocaleTimeString()} (${REASONS[state.since.reason] ?? 'início do script'})`;
    console.log(`[BLP] coletando há ${minutes} min ${since}${label} · ${waves} waves · charms ${state.charms ? 'capturados' : 'ainda não vistos'}`);
  };

  const reset = (label = null) => {
    state.label = label;
    rebaseline('manual');
  };

  window.blp = { report, status, reset, state, version: VERSION };
  console.log('[BLP] Coletor ativo. Ele começa a medir na próxima mensagem do jogo (até ~60 s). Deixe a hunt rodando 15+ min e rode blp.report().');
})();

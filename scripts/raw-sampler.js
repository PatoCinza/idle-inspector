(() => {
  const ROOM_DATA = 13;
  const STATE_FRAMES = new Set([14, 15]);
  const KEPT = new Set(['combatlog', 'fx', 'procstats', 'charmstats', 'notify', 'testdmgreport', 'testdmgstate', 'dmgbrk']);
  const OTHER_SAMPLES = 3;
  const STATE_HINT = /rotation|spells|"words"/;
  const decoder = new TextDecoder();

  const readMsgpack = (bytes, start) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = start;
    const str = (n) => { const s = decoder.decode(bytes.subarray(pos, pos + n)); pos += n; return s; };
    const arr = (n) => Array.from({ length: n }, () => next());
    const map = (n) => Object.fromEntries(Array.from({ length: n }, () => [next(), next()]));
    const u = (size, get) => { const v = view[get](pos); pos += size; return v; };
    const bin = (n) => { pos += n; return { bin: n }; };
    const ext = (n) => { const type = view.getInt8(pos); pos += 1 + n; return { ext: type }; };
    const FIXED = {
      0xc0: () => null, 0xc2: () => false, 0xc3: () => true,
      0xca: () => u(4, 'getFloat32'), 0xcb: () => u(8, 'getFloat64'),
      0xc4: () => bin(u(1, 'getUint8')), 0xc5: () => bin(u(2, 'getUint16')), 0xc6: () => bin(u(4, 'getUint32')),
      0xc7: () => ext(u(1, 'getUint8')), 0xc8: () => ext(u(2, 'getUint16')), 0xc9: () => ext(u(4, 'getUint32')),
      0xcc: () => u(1, 'getUint8'), 0xcd: () => u(2, 'getUint16'), 0xce: () => u(4, 'getUint32'), 0xcf: () => Number(u(8, 'getBigUint64')),
      0xd0: () => u(1, 'getInt8'), 0xd1: () => u(2, 'getInt16'), 0xd2: () => u(4, 'getInt32'), 0xd3: () => Number(u(8, 'getBigInt64')),
      0xd4: () => ext(1), 0xd5: () => ext(2), 0xd6: () => ext(4), 0xd7: () => ext(8), 0xd8: () => ext(16),
      0xd9: () => str(u(1, 'getUint8')), 0xda: () => str(u(2, 'getUint16')), 0xdb: () => str(u(4, 'getUint32')),
      0xdc: () => arr(u(2, 'getUint16')), 0xdd: () => arr(u(4, 'getUint32')),
      0xde: () => map(u(2, 'getUint16')), 0xdf: () => map(u(4, 'getUint32')),
    };
    const next = () => {
      const b = bytes[pos++];
      if (b <= 0x7f) return b;
      if (b >= 0xe0) return b - 256;
      if ((b & 0xe0) === 0xa0) return str(b & 0x1f);
      if ((b & 0xf0) === 0x90) return arr(b & 0x0f);
      if ((b & 0xf0) === 0x80) return map(b & 0x0f);
      const read = FIXED[b];
      if (!read) throw new Error(`msgpack 0x${b.toString(16)}`);
      return read();
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

  const store = { label: null, started: Date.now(), messages: [], others: {}, state: [], marks: [], errors: 0, attached: 0 };

  const keep = (dir, type, payload) => {
    if (KEPT.has(type)) {
      store.messages.push({ t: Date.now(), dir, label: store.label, type, payload });
      return;
    }
    const other = store.others[`${dir}:${type}`] ?? { n: 0, samples: [] };
    store.others[`${dir}:${type}`] = {
      n: other.n + 1,
      samples: other.samples.length < OTHER_SAMPLES ? [...other.samples, payload] : other.samples,
    };
  };

  const onBytes = (dir) => (bytes) => {
    try {
      if (bytes[0] === ROOM_DATA) {
        const type = readMsgpack(bytes, 1);
        const payload = type.end < bytes.length ? readMsgpack(bytes, type.end).value : undefined;
        keep(dir, type.value, payload);
      } else if (dir === 'in' && STATE_FRAMES.has(bytes[0])) {
        const runs = printableRuns(bytes).filter((run) => STATE_HINT.test(run));
        if (runs.length) store.state.push({ t: Date.now(), label: store.label, runs });
      }
    } catch {
      store.errors += 1;
    }
  };

  const incoming = onBytes('in');
  const outgoing = onBytes('out');
  const listen = (event) => { if (event.data instanceof ArrayBuffer) incoming(new Uint8Array(event.data)); };
  const attached = new WeakSet();
  const originalSend = WebSocket.prototype.send;

  WebSocket.prototype.send = function send(data) {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      outgoing(data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }
    if (!attached.has(this)) {
      attached.add(this);
      store.attached += 1;
      this.addEventListener('message', listen);
    }
    return originalSend.call(this, data);
  };

  const entriesOf = (message) => (Array.isArray(message.payload) ? message.payload : [message.payload]);
  const subtypeOf = (type, entry) => `${type}:${entry?.k ?? entry?.t ?? entry?.kind ?? '-'}`;

  const shapes = () => store.messages
    .flatMap((message) => entriesOf(message).map((entry) => [subtypeOf(message.type, entry), entry]))
    .reduce((acc, [key, entry]) => ({
      ...acc,
      [key]: {
        n: (acc[key]?.n ?? 0) + 1,
        keys: [...new Set([...(acc[key]?.keys ?? []), ...Object.keys(entry ?? {})])],
        sample: acc[key]?.sample ?? entry,
      },
    }), {});

  window.blpRaw = {
    store,
    mark: (label) => { store.label = label; store.marks.push({ t: Date.now(), label }); return label; },
    shapes,
    others: () => Object.fromEntries(Object.entries(store.others).map(([key, { n, samples }]) => [key, { n, sample: samples[0] }])),
    slice: (from, count) => JSON.stringify(store.messages.slice(from, from + count)),
    status: () => ({ attached: store.attached, messages: store.messages.length, state: store.state.length, errors: store.errors, label: store.label }),
  };
  return window.blpRaw.status();
})();

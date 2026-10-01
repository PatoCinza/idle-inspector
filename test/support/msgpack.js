const encoder = new TextEncoder();

const concat = (parts) => Uint8Array.from(parts.flatMap((p) => [...p]));
const be = (value, size) => Uint8Array.from({ length: size }, (_, i) => Math.floor(value / 2 ** (8 * (size - 1 - i))) % 256);

const string = (text) => {
  const bytes = encoder.encode(text);
  if (bytes.length < 32) return concat([[0xa0 | bytes.length], bytes]);
  if (bytes.length < 256) return concat([[0xd9, bytes.length], bytes]);
  return concat([[0xda], be(bytes.length, 2), bytes]);
};

const integer = (n) => {
  if (n >= 0 && n < 128) return Uint8Array.of(n);
  if (n >= 0 && n < 256) return Uint8Array.of(0xcc, n);
  if (n >= 0 && n < 65536) return concat([[0xcd], be(n, 2)]);
  if (n >= 0) return concat([[0xce], be(n, 4)]);
  if (n >= -32) return Uint8Array.of(256 + n);
  return concat([[0xd2], be(n + 2 ** 32, 4)]);
};

const float = (n) => {
  const out = new Uint8Array(9);
  out[0] = 0xcb;
  new DataView(out.buffer).setFloat64(1, n);
  return out;
};

export const encode = (value) => {
  if (value === null) return Uint8Array.of(0xc0);
  if (value === true) return Uint8Array.of(0xc3);
  if (value === false) return Uint8Array.of(0xc2);
  if (typeof value === 'string') return string(value);
  if (typeof value === 'number') return Number.isInteger(value) ? integer(value) : float(value);
  if (Array.isArray(value)) return concat([[0x90 | value.length], ...value.map(encode)]);
  const entries = Object.entries(value);
  return concat([[0x80 | entries.length], ...entries.flatMap(([k, v]) => [encode(k), encode(v)])]);
};

export const roomData = (type, payload) => concat([[13], encode(type), payload === undefined ? [] : encode(payload)]);

export const patchFrame = (code, ...jsonStrings) => concat([
  [code],
  ...jsonStrings.map((json) => concat([[0x01, 0x02], encoder.encode(json), [0x00]])),
]);

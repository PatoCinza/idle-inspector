const decoder = new TextDecoder();

export const readMsgpack = (bytes, start) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = start;
  const str = (n) => { const s = decoder.decode(bytes.subarray(pos, pos + n)); pos += n; return s; };
  const arr = (n) => Array.from({ length: n }, () => next());
  const map = (n) => Object.fromEntries(Array.from({ length: n }, () => [next(), next()]));
  const u = (size, get) => { const v = view[get](pos); pos += size; return v; };
  const bin = (n) => { const data = bytes.slice(pos, pos + n); pos += n; return data; };
  const ext = (n) => { const type = view.getInt8(pos); pos += 1 + n; return { ext: type }; };
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
      case 0xc4: return bin(u(1, 'getUint8'));
      case 0xc5: return bin(u(2, 'getUint16'));
      case 0xc6: return bin(u(4, 'getUint32'));
      case 0xc7: return ext(u(1, 'getUint8'));
      case 0xc8: return ext(u(2, 'getUint16'));
      case 0xc9: return ext(u(4, 'getUint32'));
      case 0xcc: return u(1, 'getUint8');
      case 0xcd: return u(2, 'getUint16');
      case 0xce: return u(4, 'getUint32');
      case 0xcf: return Number(u(8, 'getBigUint64'));
      case 0xd0: return u(1, 'getInt8');
      case 0xd1: return u(2, 'getInt16');
      case 0xd2: return u(4, 'getInt32');
      case 0xd3: return Number(u(8, 'getBigInt64'));
      case 0xd4: return ext(1);
      case 0xd5: return ext(2);
      case 0xd6: return ext(4);
      case 0xd7: return ext(8);
      case 0xd8: return ext(16);
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

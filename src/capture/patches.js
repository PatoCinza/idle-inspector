const decoder = new TextDecoder();

export const printableRuns = (bytes) => {
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

export const jsonIn = (text) => {
  const at = text.indexOf('{');
  if (at < 0) return null;
  try { return JSON.parse(text.slice(at)); } catch { return null; }
};

export const isBestiary = (obj) => obj && typeof obj === 'object' && Object.keys(obj).some((k) => k.startsWith('h:'));
export const isTracker = (obj) => obj && typeof obj === 'object'
  && Object.values(obj).some((v) => v && typeof v === 'object' && 'n' in v && 'g' in v);
export const isLootTracker = (obj) => isTracker(obj) && Object.keys(obj).some((k) => k.endsWith(' coin'));

export const isLootConfig = (obj) => obj && typeof obj === 'object' && Array.isArray(obj.skip) && 'noSell' in obj;

export const isBackpack = (obj) => obj && typeof obj === 'object' && Array.isArray(obj.gear) && obj.codex;

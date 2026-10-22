export const perObject = (build) => {
  const cache = new WeakMap();
  return (object) => {
    if (!cache.has(object)) cache.set(object, build(object));
    return cache.get(object);
  };
};

export const perObjectAndKey = (build) => {
  const byObject = perObject(() => new Map());
  return (object, key) => {
    const cache = byObject(object);
    if (!cache.has(key)) cache.set(key, build(object, key));
    return cache.get(key);
  };
};

export const perObjectPair = (build) => {
  const byFirst = perObject(() => new WeakMap());
  return (first, second) => {
    const cache = byFirst(first);
    if (!cache.has(second)) cache.set(second, build(first, second));
    return cache.get(second);
  };
};

const sameRefs = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

export const lastBy = (keysOf, compute) => {
  let last = null;
  return (...args) => {
    const keys = keysOf(...args);
    if (!last || !sameRefs(last.keys, keys)) last = { keys, value: compute(...args) };
    return last.value;
  };
};

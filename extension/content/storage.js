const api = globalThis.browser ?? globalThis.chrome;

export const extensionStorage = {
  get: async (key) => (await api.storage.local.get(key))[key],
  set: (items) => api.storage.local.set(items),
};

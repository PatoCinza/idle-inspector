import { buildEvents, emptyUsage, countUsage, initialCursor, KEYS, FLUSH_MS } from '../../src/telemetry.js';

export const startTelemetry = ({ api, storage, dataset }) => {
  let usage = emptyUsage();
  let latest = null;
  let flushing = Promise.resolve();

  const send = (events) => api.runtime.sendMessage({ type: 'blp-telemetry', events }).catch(() => null);

  const flushNow = async (app) => {
    const cursor = (await storage.get(KEYS.cursor).catch(() => undefined)) ?? initialCursor();
    const built = buildEvents({ dataset, app, cursor, usage });
    if (!built.events.length) return;
    const response = await send(built.events);
    if (!response || (response.consent && !response.ok)) return;
    usage = emptyUsage();
    await storage.set({ [KEYS.cursor]: built.cursor }).catch(() => {});
  };

  const flush = (app = latest) => {
    flushing = flushing.then(() => flushNow(app)).catch(() => {});
    return flushing;
  };


  setInterval(() => flush(), FLUSH_MS);

  return {
    observe: (app) => {
      if (latest && latest.session.since !== app.session.since) flush(latest);
      latest = app;
    },
    track: (action) => { usage = countUsage(usage, action); },
    flush,
    consentState: () => api.runtime.sendMessage({ type: 'blp-consent-state' }).catch(() => ({ granted: false })),
    openOptions: () => api.runtime.sendMessage({ type: 'blp-open-options' }).catch(() => null),
  };
};

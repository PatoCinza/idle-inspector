import { TAG, HOOK_EVENTS } from './capture/protocol.js';
import { reduceApp, restoreApp } from './app-state.js';

export const STORAGE_KEY = 'blp.app';

const defaultSchedule = (task) => setTimeout(task, 1000);

export const createBridge = ({ win, storage, now = Date.now, schedule = defaultSchedule, onChange = () => {}, reduce = reduceApp }) => {
  let app = null;
  let queued = [];
  let saving = false;

  const persist = async () => {
    saving = false;
    if (app) await storage.set({ [STORAGE_KEY]: app }).catch(() => {});
  };

  const requestSave = () => {
    if (saving) return;
    saving = true;
    schedule(persist);
  };

  const apply = (event) => {
    app = reduce(app, event);
    onChange(app);
    requestSave();
  };

  const fromHook = (message) => message.source === win
    && message.data?.source === TAG
    && HOOK_EVENTS.has(message.data.event?.type);

  win.addEventListener('message', (message) => {
    if (!fromHook(message)) return;
    if (app) apply(message.data.event);
    else queued = [...queued, message.data.event];
  });

  const ready = storage.get(STORAGE_KEY).catch(() => undefined).then((stored) => {
    app = reduce(restoreApp(stored), { type: 'connect', t: now() });
    onChange(app);
    const pending = queued;
    queued = [];
    pending.forEach(apply);
    return app;
  });

  return { ready, dispatch: (event) => ready.then(() => apply({ t: now(), ...event })), flush: persist, getState: () => app };
};

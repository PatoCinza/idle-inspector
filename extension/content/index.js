import dataset from '../../data/game.json';
import { createBridge } from '../../src/bridge.js';
import { reduceApp } from '../../src/app-state.js';
import { extensionStorage } from './storage.js';
import { mountOverlay } from './overlay.js';
import { readParty, readCharmCards } from '../../src/dom/reader.js';
import { slotsFromCards } from '../../src/dom/charms.js';
import { readSummary } from '../../src/dom/summary.js';
import { startTelemetry } from './telemetry.js';
import { KEYS } from '../../src/telemetry.js';
import { needsNotice } from '../../src/posthog.js';

const UI_KEY = 'blp.ui';
const api = globalThis.browser ?? globalThis.chrome;

const iconUrl = (id) => api.runtime.getURL(`img/items/${id}.png`);
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const telemetry = startTelemetry({ api, storage: extensionStorage, dataset });

const markNoticeShown = () => extensionStorage.set({ [KEYS.asked]: true }).catch(() => {});
const saveConsent = (granted) => extensionStorage.set({ [KEYS.consent]: { granted, at: Date.now() }, [KEYS.asked]: true }).catch(() => {});

const consentNotice = async () => {
  const state = await telemetry.consentState();
  const show = Boolean(state) && needsNotice(state);
  if (show) await markNoticeShown();
  return show;
};

const overlay = Promise.all([extensionStorage.get(UI_KEY).catch(() => undefined), consentNotice()]).then(([ui, consentPrompt]) => mountOverlay({
  doc: document,
  dataset,
  iconUrl,
  ui,
  consentPrompt,
  saveUi: (next) => extensionStorage.set({ [UI_KEY]: next }).catch(() => {}),
  actions: {
    readParty: () => readPartyAndCharms(),
    track: telemetry.track,
    openOptions: () => {
      telemetry.track({ type: 'options' });
      return telemetry.openOptions();
    },
    keepConsent: () => saveConsent(true),
    declineConsent: () => saveConsent(false),
  },
}));

const readPartyAndCharms = async () => {
  const members = await readParty({ doc: document, wait });
  if (members.length) await bridge.dispatch({ type: 'party', members });
  const cards = await readCharmCards({ doc: document, wait });
  if (cards) await bridge.dispatch({ type: 'charms', slots: slotsFromCards(dataset, cards) });
  return readSummary({ members, cards });
};

const bridge = createBridge({
  win: window,
  storage: extensionStorage,
  reduce: (app, event) => reduceApp(app, event, { dataset }),
  onChange: (app) => {
    telemetry.observe(app);
    overlay.then((mounted) => mounted.update(app));
  },
});

window.addEventListener('pagehide', () => {
  bridge.flush();
  telemetry.flush();
});

api.runtime.onMessage.addListener((message) => {
  if (message?.type === 'blp-reveal') overlay.then((mounted) => mounted.reveal());
});

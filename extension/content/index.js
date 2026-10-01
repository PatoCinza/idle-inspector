import dataset from '../../data/game.json';
import { createBridge } from '../../src/bridge.js';
import { extensionStorage } from './storage.js';
import { mountOverlay } from './overlay.js';
import { readParty, readCharmCards } from '../../src/dom/reader.js';
import { slotsFromCards } from '../../src/dom/charms.js';
import { readCharmAnalyzer } from '../../src/dom/analyzer.js';
import { readSummary } from '../../src/dom/summary.js';

const UI_KEY = 'blp.ui';
const api = globalThis.browser ?? globalThis.chrome;

const iconUrl = (id) => api.runtime.getURL(`img/items/${id}.png`);
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const overlay = extensionStorage.get(UI_KEY).catch(() => undefined).then((ui) => mountOverlay({
  doc: document,
  dataset,
  iconUrl,
  ui,
  saveUi: (next) => extensionStorage.set({ [UI_KEY]: next }).catch(() => {}),
  actions: { readParty: () => readPartyAndCharms() },
}));

const readPartyAndCharms = async () => {
  const members = await readParty({ doc: document, wait });
  if (members.length) await bridge.dispatch({ type: 'party', members });
  const cards = await readCharmCards({ doc: document, wait });
  if (cards) await bridge.dispatch({ type: 'charms', slots: slotsFromCards(dataset, cards) });
  const stats = readCharmAnalyzer({ doc: document, dataset });
  if (stats) await bridge.dispatch({ type: 'charmStats', stats });
  return readSummary({ members, cards });
};

const bridge = createBridge({
  win: window,
  storage: extensionStorage,
  onChange: (app) => overlay.then((mounted) => mounted.update(app)),
});

window.addEventListener('pagehide', () => bridge.flush());

api.runtime.onMessage.addListener((message) => {
  if (message?.type === 'blp-reveal') overlay.then((mounted) => mounted.reveal());
});

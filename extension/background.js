import { POSTHOG, KEYS, DELIVERY, batchOf, consentGranted, deliveryOf } from '../src/posthog.js';

const api = globalThis.browser ?? globalThis.chrome;

const warnMissingAccess = (tabId) => Promise.all([
  api.action.setBadgeText({ tabId, text: '!' }),
  api.action.setTitle({ tabId, title: 'Sem acesso a baiakidle.com/jogar/. Abra a página do jogo e conceda a permissão do site à extensão.' }),
]);

api.action.onClicked.addListener((tab) => {
  api.tabs.sendMessage(tab.id, { type: 'blp-reveal' }).catch(() => warnMissingAccess(tab.id));
});

const installId = async () => {
  const stored = (await api.storage.local.get(KEYS.installId))[KEYS.installId];
  if (stored) return stored;
  const id = crypto.randomUUID();
  await api.storage.local.set({ [KEYS.installId]: id });
  return id;
};

const sendEvents = async ({ events }) => {
  if (!(await consentGranted(api))) return { ok: false, consent: false, delivery: DELIVERY.noConsent };
  if (!events?.length) return { ok: true, consent: true, delivery: DELIVERY.sent };
  const body = JSON.stringify(batchOf({ events, installId: await installId(), version: api.runtime.getManifest().version, now: Date.now() }));
  const response = await fetch(POSTHOG.ingestUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }).catch(() => null);
  const delivery = deliveryOf(response?.status ?? null);
  return { ok: delivery === DELIVERY.sent, consent: true, delivery };
};

const HANDLERS = {
  'blp-telemetry': sendEvents,
  'blp-consent-state': async () => ({ granted: await consentGranted(api) }),
  'blp-open-options': async () => {
    await api.runtime.openOptionsPage();
    return { ok: true };
  },
};

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  handler(message).then(sendResponse, () => sendResponse({ ok: false, delivery: DELIVERY.retry }));
  return true;
});

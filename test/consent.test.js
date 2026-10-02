import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, storedConsent, firefoxConsent, consentDetails, needsNotice } from '../src/posthog.js';

const fakeApi = ({ permissions = { permissions: [], origins: [] }, saved = {} } = {}) => ({
  permissions: { getAll: async () => (permissions instanceof Error ? Promise.reject(permissions) : permissions) },
  storage: { local: { get: async (keys) => Object.fromEntries(keys.filter((key) => key in saved).map((key) => [key, saved[key]])) } },
});

const firefox = (granted) => ({ permissions: [], origins: [], data_collection: granted });

test('a escolha salva vale; sem escolha, liga depois que o aviso apareceu', () => {
  assert.equal(storedConsent({ choice: undefined, noticeShown: undefined }), false);
  assert.equal(storedConsent({ choice: undefined, noticeShown: true }), true);
  assert.equal(storedConsent({ choice: { granted: false }, noticeShown: true }), false);
  assert.equal(storedConsent({ choice: { granted: true }, noticeShown: false }), true);
});

test('a coleta do Firefox 140+ é detectada pelo getAll; nos outros navegadores fica null', async () => {
  assert.equal(await firefoxConsent(fakeApi()), null);
  assert.equal(await firefoxConsent(fakeApi({ permissions: new Error('sem suporte') })), null);
  assert.equal(await firefoxConsent(fakeApi({ permissions: firefox(['technicalAndInteraction']) })), true);
  assert.equal(await firefoxConsent(fakeApi({ permissions: firefox([]) })), false);
});

test('Chrome e Firefox antigo: aviso uma vez, depois ligado até a pessoa desligar', async () => {
  const fresh = await consentDetails(fakeApi());
  assert.deepEqual([fresh.granted, needsNotice(fresh)], [false, true]);
  const afterNotice = await consentDetails(fakeApi({ saved: { [KEYS.asked]: true } }));
  assert.deepEqual([afterNotice.granted, needsNotice(afterNotice)], [true, false]);
  const declined = await consentDetails(fakeApi({ saved: { [KEYS.asked]: true, [KEYS.consent]: { granted: false } } }));
  assert.deepEqual([declined.granted, needsNotice(declined)], [false, false]);
});

test('Firefox 140+: vale o que ficou marcado na instalação, sem aviso no overlay', async () => {
  const kept = await consentDetails(fakeApi({ permissions: firefox(['technicalAndInteraction']), saved: { [KEYS.consent]: { granted: false } } }));
  assert.deepEqual([kept.granted, needsNotice(kept)], [true, false]);
  const unchecked = await consentDetails(fakeApi({ permissions: firefox([]) }));
  assert.deepEqual([unchecked.granted, needsNotice(unchecked)], [false, false]);
});

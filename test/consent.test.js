import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, storedConsent, firefoxConsent, consentDetails, needsNotice } from '../src/posthog.js';

const fakeApi = ({ permissions = { permissions: [], origins: [] }, saved = {} } = {}) => ({
  permissions: { getAll: async () => (permissions instanceof Error ? Promise.reject(permissions) : permissions) },
  storage: { local: { get: async (keys) => Object.fromEntries(keys.filter((key) => key in saved).map((key) => [key, saved[key]])) } },
});

const firefox = (granted) => ({ permissions: [], origins: [], data_collection: granted });

test('só liga com a escolha salva; ver o aviso não liga nada', () => {
  assert.equal(storedConsent({ choice: undefined }), false);
  assert.equal(storedConsent({ choice: { granted: false } }), false);
  assert.equal(storedConsent({ choice: { granted: true } }), true);
});

test('a coleta do Firefox 140+ é detectada pelo getAll; nos outros navegadores fica null', async () => {
  assert.equal(await firefoxConsent(fakeApi()), null);
  assert.equal(await firefoxConsent(fakeApi({ permissions: new Error('sem suporte') })), null);
  assert.equal(await firefoxConsent(fakeApi({ permissions: firefox(['technicalAndInteraction']) })), true);
  assert.equal(await firefoxConsent(fakeApi({ permissions: firefox([]) })), false);
});

test('Chrome e Firefox antigo: desligado, aviso uma vez pedindo para ligar', async () => {
  const fresh = await consentDetails(fakeApi());
  assert.deepEqual([fresh.granted, needsNotice(fresh)], [false, true]);
  const afterNotice = await consentDetails(fakeApi({ saved: { [KEYS.asked]: true } }));
  assert.deepEqual([afterNotice.granted, needsNotice(afterNotice)], [false, false]);
  const accepted = await consentDetails(fakeApi({ saved: { [KEYS.asked]: true, [KEYS.consent]: { granted: true } } }));
  assert.deepEqual([accepted.granted, needsNotice(accepted)], [true, false]);
  const declined = await consentDetails(fakeApi({ saved: { [KEYS.asked]: true, [KEYS.consent]: { granted: false } } }));
  assert.deepEqual([declined.granted, needsNotice(declined)], [false, false]);
});

test('Firefox 140+: precisa da permissão da instalação e do sim no aviso; desmarcada na instalação, nem pergunta', async () => {
  const checkedOnly = await consentDetails(fakeApi({ permissions: firefox(['technicalAndInteraction']) }));
  assert.deepEqual([checkedOnly.granted, needsNotice(checkedOnly)], [false, true]);
  const accepted = await consentDetails(fakeApi({ permissions: firefox(['technicalAndInteraction']), saved: { [KEYS.asked]: true, [KEYS.consent]: { granted: true } } }));
  assert.deepEqual([accepted.granted, needsNotice(accepted)], [true, false]);
  const unchecked = await consentDetails(fakeApi({ permissions: firefox([]), saved: { [KEYS.consent]: { granted: true } } }));
  assert.deepEqual([unchecked.granted, needsNotice(unchecked)], [false, false]);
});

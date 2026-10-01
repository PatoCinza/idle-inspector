import { KEYS, DATA_COLLECTION, consentGranted } from '../../src/posthog.js';

const api = globalThis.browser ?? globalThis.chrome;
const toggle = document.getElementById('consent');
const status = document.getElementById('status');

const show = (granted) => {
  toggle.checked = granted;
  status.textContent = granted ? 'Ligado: os resumos são enviados a cada 10 minutos.' : 'Desligado: nada é enviado.';
  status.classList.toggle('on', granted);
};

const askFirefox = (granted) => {
  try {
    const permissions = { data_collection: DATA_COLLECTION };
    return (granted ? api.permissions.request(permissions) : api.permissions.remove(permissions)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
};

const save = (granted) => api.storage.local.set({ [KEYS.consent]: { granted, at: Date.now() }, [KEYS.asked]: true });

toggle.addEventListener('change', async () => {
  const wanted = toggle.checked;
  const firefox = await askFirefox(wanted);
  const granted = firefox === null ? wanted : wanted && firefox;
  await save(granted);
  show(await consentGranted(api));
});

consentGranted(api).then(show);

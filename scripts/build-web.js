import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PACKAGE_NAME } from '../src/site.js';
import { DOWNLOADS_DIR, newestFirst, fileNames, updateManifest, redirects, headers } from '../src/web/releases.js';
import { renderLanding } from '../src/web/landing.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = (relative) => `${root}${relative}`;

const OUT_DIR = path('dist/web');
const SIGNED_DIR = path('web/signed');
const RELEASE_DIR = path('dist/release');
const SIGNED_FILE = new RegExp(`^${PACKAGE_NAME}-(\\d+\\.\\d+\\.\\d+)-firefox\\.xpi$`);

const readJson = async (relative) => JSON.parse(await readFile(path(relative), 'utf8'));

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

const signedBuilds = async () => {
  const files = (await readdir(SIGNED_DIR).catch(() => [])).filter((file) => SIGNED_FILE.test(file));
  return Promise.all(files.map(async (file) => ({ file, version: file.match(SIGNED_FILE)[1], sha256: await sha256(`${SIGNED_DIR}/${file}`) })));
};

const assertLatestMatchesManifest = (latest, manifest) => {
  if (latest.version !== manifest.version) {
    throw new Error(`web/releases.json começa na ${latest.version}, mas o manifest está na ${manifest.version}. Adicione as novidades da versão nova.`);
  }
};

export const buildWeb = async () => {
  const [releases, manifest] = await Promise.all([readJson('web/releases.json').then(newestFirst), readJson('extension/manifest.json')]);
  const [latest] = releases;
  assertLatestMatchesManifest(latest, manifest);
  const signed = await signedBuilds();
  const names = fileNames(latest.version);
  const files = {
    chromium: names.chromium,
    firefox: signed.some(({ version }) => version === latest.version) ? names.firefox : null,
  };
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(`${OUT_DIR}/${DOWNLOADS_DIR}`, { recursive: true });
  await mkdir(`${OUT_DIR}/planner`, { recursive: true });
  await Promise.all([
    writeFile(`${OUT_DIR}/index.html`, renderLanding({ releases, files })),
    writeFile(`${OUT_DIR}/updates.json`, `${JSON.stringify(updateManifest(signed), null, 2)}\n`),
    writeFile(`${OUT_DIR}/_redirects`, redirects(files)),
    writeFile(`${OUT_DIR}/_headers`, headers(signed)),
    copyFile(path('dist/index.html'), `${OUT_DIR}/planner/index.html`),
    copyFile(`${RELEASE_DIR}/${names.chromium}`, `${OUT_DIR}/${DOWNLOADS_DIR}/${names.chromium}`),
    ...signed.map(({ file }) => copyFile(`${SIGNED_DIR}/${file}`, `${OUT_DIR}/${DOWNLOADS_DIR}/${file}`)),
  ]);
  return { version: latest.version, firefox: Boolean(files.firefox), signed: signed.map(({ version }) => version) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, firefox, signed } = await buildWeb();
  console.log(`dist/web pronto: versão ${version}, Firefox ${firefox ? 'disponível' : 'aguardando o .xpi assinado'}${signed.length ? ` (assinadas: ${signed.join(', ')})` : ''}`);
}

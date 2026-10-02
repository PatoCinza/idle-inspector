import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_NAME } from '../src/site.js';
import { fileNames } from '../src/web/releases.js';
import { packageExtension } from './package-extension.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = (relative) => join(root, relative);

const KEY_PAGE = 'https://addons.mozilla.org/developers/addon/api/key/';
const REQUIRED_ENV = ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET'];

const assertCredentials = () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Defina ${missing.join(' e ')} com as chaves de ${KEY_PAGE}`);
};

const assertNotSigned = (target) => {
  if (existsSync(target)) throw new Error(`${target} já existe. Suba a versão no manifest antes de assinar de novo.`);
};

const sign = ({ artifactsDir, sourceZip }) => execFileSync('npx', [
  '--yes', 'web-ext@8', 'sign',
  '--channel', 'unlisted',
  '--source-dir', path('dist/extension/firefox'),
  '--artifacts-dir', artifactsDir,
  '--upload-source-code', sourceZip,
], { cwd: root, stdio: 'inherit' });

const signedArtifact = async (dir) => {
  const [file] = (await readdir(dir)).filter((name) => name.endsWith('.xpi'));
  if (!file) throw new Error('O web-ext terminou sem gerar o .xpi assinado.');
  return join(dir, file);
};

export const signFirefox = async () => {
  assertCredentials();
  const { version } = await packageExtension();
  const target = path(`web/signed/${fileNames(version).firefox}`);
  assertNotSigned(target);
  const artifactsDir = await mkdtemp(join(tmpdir(), 'blp-sign-'));
  sign({ artifactsDir, sourceZip: path(`dist/release/${PACKAGE_NAME}-${version}-source.zip`) });
  await copyFile(await signedArtifact(artifactsDir), target);
  await rm(artifactsDir, { recursive: true, force: true });
  return { version, target };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, target } = await signFirefox();
  console.log(`${version} assinada: ${target}\nPublique com npm run deploy:web.`);
}

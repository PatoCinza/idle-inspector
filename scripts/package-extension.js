import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildExtension } from './build-extension.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = (relative) => `${root}${relative}`;

const NAME = 'baiak-loot-planner';
const RELEASE_DIR = path('dist/release');
const STAGING_DIR = `${RELEASE_DIR}/staging`;
const CHROME_GUIDE = path('scripts/release/COMO-INSTALAR-CHROME.txt');

const run = (command, args, { cwd = root, input } = {}) => execFileSync(command, args, { cwd, input, encoding: 'utf8', stdio: [input ? 'pipe' : 'ignore', 'pipe', 'inherit'] });

const zip = ({ cwd, output, entries }) => run('zip', ['-q', '-r', '-X', output, ...entries], { cwd });

const zipList = ({ output, files }) => run('zip', ['-q', '-X', output, '-@'], { input: files.join('\n') });

const sourceFiles = () => run('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
  .split('\n')
  .filter((file) => file && existsSync(path(file)));

const firefoxPackage = ({ dir, version }) => {
  const output = `${RELEASE_DIR}/${NAME}-${version}-firefox.zip`;
  zip({ cwd: dir, output, entries: ['.'] });
  return output;
};

const chromePackage = async ({ dir, version }) => {
  const folder = `${STAGING_DIR}/${NAME}`;
  await cp(dir, folder, { recursive: true });
  await cp(CHROME_GUIDE, `${folder}/COMO-INSTALAR.txt`);
  const output = `${RELEASE_DIR}/${NAME}-${version}-chrome.zip`;
  zip({ cwd: STAGING_DIR, output, entries: [NAME] });
  return output;
};

const sourcePackage = ({ version }) => {
  const output = `${RELEASE_DIR}/${NAME}-${version}-source.zip`;
  zipList({ output, files: sourceFiles() });
  return output;
};

export const packageExtension = async () => {
  const { version } = JSON.parse(await readFile(path('extension/manifest.json'), 'utf8'));
  await rm(RELEASE_DIR, { recursive: true, force: true });
  await mkdir(STAGING_DIR, { recursive: true });
  const built = Object.fromEntries((await buildExtension()).map(({ target, dir }) => [target, dir]));
  const outputs = [
    firefoxPackage({ dir: built.firefox, version }),
    await chromePackage({ dir: built.chrome, version }),
    sourcePackage({ version }),
  ];
  await rm(STAGING_DIR, { recursive: true, force: true });
  return { version, outputs };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, outputs } = await packageExtension();
  console.log(`versão ${version}`);
  outputs.forEach((output) => console.log(output));
}

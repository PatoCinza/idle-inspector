import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LEVELS = ['major', 'minor', 'patch'];
const SEMVER = /^\d+\.\d+\.\d+$/;

export const nextVersion = (current, level = 'patch') => {
  if (SEMVER.test(level)) return level;
  const index = LEVELS.indexOf(level);
  if (index < 0 || !SEMVER.test(current)) throw new Error(`use major, minor, patch ou x.y.z (atual: ${current})`);
  return current.split('.').map(Number).map((part, i) => (i < index ? part : i === index ? part + 1 : 0)).join('.');
};

const root = new URL('../', import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, root));

const readJson = async (file) => JSON.parse(await readFile(path(file), 'utf8'));
const writeJson = (file, data) => writeFile(path(file), `${JSON.stringify(data, null, 2)}\n`);

const withLockVersion = (lock, version) => ({
  ...lock,
  version,
  packages: { ...lock.packages, '': { ...lock.packages?.[''], version } },
});

const bump = async (level) => {
  const pkg = await readJson('package.json');
  const version = nextVersion(pkg.version, level);
  const [manifest, lock] = await Promise.all([readJson('extension/manifest.json'), readJson('package-lock.json')]);
  await Promise.all([
    writeJson('package.json', { ...pkg, version }),
    writeJson('extension/manifest.json', { ...manifest, version }),
    writeJson('package-lock.json', withLockVersion(lock, version)),
  ]);
  return { from: pkg.version, to: version };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { from, to } = await bump(process.argv[2]);
  console.log(`${from} → ${to}`);
}

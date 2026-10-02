import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SITE, GECKO_ID, UPDATES_PATH } from '../src/site.js';

const root = new URL('../', import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, root));

export { GECKO_ID } from '../src/site.js';

const ENTRIES = [
  { source: 'extension/page/hook.js', output: 'page-hook.js' },
  { source: 'extension/content/index.js', output: 'content.js' },
  { source: 'extension/background.js', output: 'background.js' },
  { source: 'extension/options/options.js', output: 'options.js' },
];

const STATIC_FILES = [{ source: 'extension/options/options.html', output: 'options.html' }];

const withDynamicUrl = (resource) => ({ ...resource, use_dynamic_url: true });

export const TARGETS = {
  chrome: (manifest) => ({
    ...manifest,
    minimum_chrome_version: '111',
    background: { service_worker: 'background.js' },
    web_accessible_resources: manifest.web_accessible_resources.map(withDynamicUrl),
  }),
  firefox: (manifest) => ({
    ...manifest,
    background: { scripts: ['background.js'] },
    host_permissions: ['https://baiakidle.com/*'],
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        update_url: `${SITE.url}${UPDATES_PATH}`,
        strict_min_version: '128.0',
        data_collection_permissions: { required: ['none'], optional: ['technicalAndInteraction'] },
      },
    },
  }),
};

const bundle = (entry, outfile) => build({
  entryPoints: [path(entry)],
  outfile,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  legalComments: 'none',
});

const itemIcons = async () => {
  const dir = path('site/img/items/');
  const files = await readdir(dir).catch(() => []);
  return files.filter((file) => /^\d+\.png$/.test(file)).map((file) => ({ from: `${dir}${file}`, name: file }));
};

const buildTarget = async (outDir, target, icons) => {
  const dir = `${outDir}/${target}`;
  const base = JSON.parse(await readFile(path('extension/manifest.json'), 'utf8'));
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/img/items`, { recursive: true });
  await Promise.all([
    ...ENTRIES.map(({ source, output }) => bundle(source, `${dir}/${output}`)),
    writeFile(`${dir}/manifest.json`, `${JSON.stringify(TARGETS[target](base), null, 2)}\n`),
    ...icons.map(({ from, name }) => copyFile(from, `${dir}/img/items/${name}`)),
    ...STATIC_FILES.map(({ source, output }) => copyFile(path(source), `${dir}/${output}`)),
  ]);
  return { target, dir, icons: icons.length };
};

export const buildExtension = async ({ outDir = path('dist/extension'), targets = Object.keys(TARGETS) } = {}) => {
  const icons = await itemIcons();
  return Promise.all(targets.map((target) => buildTarget(outDir, target, icons)));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = await buildExtension();
  built.forEach(({ target, dir, icons }) => console.log(`${target}: ${dir} (${icons} ícones)`));
}

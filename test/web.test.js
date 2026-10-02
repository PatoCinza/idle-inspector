import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { SITE, GECKO_ID } from '../src/site.js';
import { compareVersions, newestFirst, fileNames, updateManifest, redirects, headers } from '../src/web/releases.js';
import { renderLanding } from '../src/web/landing.js';
import { TABS } from '../src/overlay/welcome-view.js';

const releases = newestFirst([
  { version: '0.2.0', date: '2026-10-02', notes: ['Primeira versão <distribuída>.'] },
  { version: '0.10.0', date: '2026-12-01', notes: ['Mais tarde.'] },
]);

const page = (files) => parseHTML(renderLanding({ releases, files })).document;

test('versões são comparadas por número, não por texto', () => {
  assert.ok(compareVersions('0.10.0', '0.2.0') > 0);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.deepEqual(releases.map(({ version }) => version), ['0.10.0', '0.2.0']);
});

test('updates.json do Firefox aponta para o site, com hash', () => {
  const manifest = updateManifest([{ version: '0.2.0', file: 'baiak-loot-planner-0.2.0-firefox.xpi', sha256: 'abc' }]);
  assert.deepEqual(manifest.addons[GECKO_ID].updates, [{
    version: '0.2.0',
    update_link: `${SITE.url}/downloads/baiak-loot-planner-0.2.0-firefox.xpi`,
    update_hash: 'sha256:abc',
  }]);
  assert.match(SITE.url, /^https:\/\//);
});

test('links curtos e cabeçalhos do .xpi', () => {
  const files = fileNames('0.2.0');
  assert.equal(redirects({ chromium: files.chromium, firefox: null }), [
    '/chrome /downloads/baiak-loot-planner-0.2.0-chrome-edge-opera.zip 302',
    '/edge /downloads/baiak-loot-planner-0.2.0-chrome-edge-opera.zip 302',
    '/opera /downloads/baiak-loot-planner-0.2.0-chrome-edge-opera.zip 302',
    '/firefox /#firefox 302',
  ].join('\n').concat('\n'));
  assert.match(redirects(files), /^\/firefox \/downloads\/baiak-loot-planner-0\.2\.0-firefox\.xpi 302$/m);
  assert.match(headers([{ file: files.firefox }]), /\/downloads\/baiak-loot-planner-0\.2\.0-firefox\.xpi\n {2}Content-Type: application\/x-xpinstall/);
});

test('a página mostra a versão mais nova, os downloads, o tutorial e escapa as novidades', () => {
  const files = fileNames('0.10.0');
  const doc = page(files);
  const hrefs = [...doc.querySelectorAll('a.button')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, [`/downloads/${files.firefox}`, `/downloads/${files.chromium}`]);
  assert.match(doc.querySelector('.meta').textContent, /Versão 0\.10\.0/);
  assert.equal(doc.querySelectorAll('#como-usar .grid .card').length, TABS.length);
  assert.ok(doc.querySelector('#dados'));
  assert.ok(doc.querySelector('a[href="/planner/"]'));
  assert.match(doc.querySelector('#novidades').innerHTML, /&lt;distribuída&gt;/);
});

test('sem .xpi assinado, o botão do Firefox fica desativado', () => {
  const doc = page({ chromium: fileNames('0.10.0').chromium, firefox: null });
  assert.equal(doc.querySelectorAll('a.button').length, 1);
  assert.match(doc.querySelector('.button.disabled').textContent, /assinatura do Mozilla/);
});

test('o deploy usa o mesmo projeto do update_url', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['deploy:web'], new RegExp(`--project-name ${SITE.project}\\b`));
  assert.equal(SITE.url, `https://${SITE.project}.pages.dev`);
});

test('as novidades começam na versão do manifest', () => {
  const [latest] = newestFirst(JSON.parse(readFileSync(new URL('../web/releases.json', import.meta.url), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(latest.version, manifest.version);
});

test('o .xpi assinado é reconhecido pelo manifest de dentro, com qualquer nome', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { readSignedXpi } = await import('../scripts/build-web.js');
  const xpi = async ({ id = GECKO_ID, signed = true }) => {
    const dir = await mkdtemp(`${tmpdir()}/blp-xpi-`);
    await writeFile(`${dir}/manifest.json`, JSON.stringify({ version: '0.2.1', browser_specific_settings: { gecko: { id } } }));
    if (signed) await mkdir(`${dir}/META-INF`).then(() => writeFile(`${dir}/META-INF/mozilla.rsa`, 'x'));
    execFileSync('zip', ['-q', '-r', 'qualquer-nome.xpi', '.'], { cwd: dir });
    return `${dir}/qualquer-nome.xpi`;
  };
  const build = await readSignedXpi(await xpi({}));
  assert.equal(build.version, '0.2.1');
  assert.equal(build.file, 'baiak-loot-planner-0.2.1-firefox.xpi');
  assert.match(build.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(readSignedXpi(await xpi({ signed: false })), /não está assinado/);
  await assert.rejects(readSignedXpi(await xpi({ id: 'outra@ext' })), /outra extensão/);
});

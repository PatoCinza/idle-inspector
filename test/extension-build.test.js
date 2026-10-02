import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExtension, GECKO_ID } from '../scripts/build-extension.js';
import { POSTHOG } from '../src/posthog.js';

let outDir;
const read = async (target, file) => readFile(join(outDir, target, file), 'utf8');
const manifest = async (target) => JSON.parse(await read(target, 'manifest.json'));
const exists = (file) => access(file).then(() => true, () => false);

before(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'blp-ext-'));
  await buildExtension({ outDir });
});

after(() => rm(outDir, { recursive: true, force: true }));

test('o hook roda no mundo MAIN em document_start e a ponte no mundo isolado', async () => {
  const { content_scripts: scripts } = await manifest('chrome');
  const hook = scripts.find((s) => s.js.includes('page-hook.js'));
  const bridge = scripts.find((s) => s.js.includes('content.js'));
  assert.equal(hook.world, 'MAIN');
  assert.equal(hook.run_at, 'document_start');
  assert.equal(bridge.run_at, 'document_start');
  assert.equal(bridge.world, undefined);
  scripts.forEach((s) => assert.deepEqual(s.matches, ['https://baiakidle.com/jogar/*']));
});

test('permissões mínimas: storage, sem host de envio (o relay responde CORS); firefox pede o site do jogo explicitamente', async () => {
  for (const target of ['chrome', 'firefox']) {
    const m = await manifest(target);
    assert.deepEqual(m.permissions, ['storage']);
    assert.equal(m.manifest_version, 3);
    assert.deepEqual(m.options_ui, { page: 'options.html', open_in_tab: true });
    assert.ok(m.description.length <= 132);
  }
  assert.equal((await manifest('chrome')).host_permissions, undefined);
  assert.deepEqual((await manifest('firefox')).host_permissions, ['https://baiakidle.com/*']);
});

test('a versão do manifest acompanha a do package.json', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const target of ['chrome', 'firefox']) assert.equal((await manifest(target)).version, pkg.version);
});

test('página de opções é empacotada', async () => {
  for (const target of ['chrome', 'firefox']) {
    assert.match(await read(target, 'options.html'), /options\.js/);
    assert.match(await read(target, 'options.js'), /blp\.consent/);
  }
});

test('botão da barra existe e o background segue o formato de cada navegador', async () => {
  const chrome = await manifest('chrome');
  const firefox = await manifest('firefox');
  assert.ok(chrome.action.default_title);
  assert.deepEqual(chrome.background, { service_worker: 'background.js' });
  assert.deepEqual(firefox.background, { scripts: ['background.js'] });
});

test('firefox declara id, versão mínima com world MAIN e coleta técnica só opcional', async () => {
  const { browser_specific_settings: gecko } = await manifest('firefox');
  assert.equal(gecko.gecko.id, GECKO_ID);
  assert.match(gecko.gecko.update_url, /^https:\/\/[^/]+\/updates\.json$/);
  assert.ok(parseInt(gecko.gecko.strict_min_version, 10) >= 140);
  assert.ok(parseInt(gecko.gecko_android.strict_min_version, 10) >= 142);
  assert.deepEqual(gecko.gecko.data_collection_permissions, { required: ['none'], optional: ['technicalAndInteraction'] });
  assert.equal((await manifest('chrome')).browser_specific_settings, undefined);
});

test('chrome usa URL dinâmica nos recursos expostos e firefox não', async () => {
  assert.equal((await manifest('chrome')).web_accessible_resources[0].use_dynamic_url, true);
  assert.equal((await manifest('firefox')).web_accessible_resources[0].use_dynamic_url, undefined);
});

test('todo arquivo referenciado pelo manifest existe no pacote', async () => {
  for (const target of ['chrome', 'firefox']) {
    const m = await manifest(target);
    const files = [...m.content_scripts.flatMap((s) => s.js), 'background.js'];
    for (const file of files) assert.ok(await exists(join(outDir, target, file)), `${target}/${file}`);
  }
});

test('ícones dos itens vão empacotados dentro da extensão', async () => {
  const icons = await readdir(join(outDir, 'chrome/img/items'));
  assert.ok(icons.length > 800);
  assert.ok(icons.every((f) => /^\d+\.png$/.test(f)));
});

test('só o background faz chamada de rede, e só para o relay', async () => {
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|new\s+EventSource|importScripts|https?:\/\/(?!baiakidle\.com)/;
  const ingestHost = new URL(POSTHOG.ingestUrl).host.replace(/\./g, '\\.');
  const otherHosts = new RegExp(`XMLHttpRequest|sendBeacon|new\\s+WebSocket|new\\s+EventSource|importScripts|https?:\\/\\/(?!baiakidle\\.com|${ingestHost})`);
  for (const target of ['chrome', 'firefox']) {
    for (const file of ['page-hook.js', 'content.js', 'options.js']) {
      assert.doesNotMatch(await read(target, file), forbidden, `${target}/${file}`);
    }
    const background = await read(target, 'background.js');
    assert.doesNotMatch(background, otherHosts, `${target}/background.js`);
    assert.equal((background.match(/\bfetch\s*\(/g) ?? []).length, 1);
  }
});

test('nenhum bundle monta HTML com innerHTML e afins (aviso do AMO)', async () => {
  const unsafe = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|createContextualFragment|document\.write/;
  for (const target of ['chrome', 'firefox']) {
    for (const file of ['page-hook.js', 'content.js', 'background.js', 'options.js']) {
      assert.doesNotMatch(await read(target, file), unsafe, `${target}/${file}`);
    }
  }
});

test('bundles são ASCII puro, sem depender da decodificação do navegador', async () => {
  for (const target of ['chrome', 'firefox']) {
    for (const file of ['page-hook.js', 'content.js', 'background.js', 'options.js']) {
      assert.doesNotMatch(await read(target, file), /[^\x00-\x7F]/, `${target}/${file}`);
    }
  }
});

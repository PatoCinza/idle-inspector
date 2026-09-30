import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const safe = (text) => text.replace(/<\/(script)/gi, '<\\/$1');

const bundle = async (entry, format) => {
  const result = await build({ entryPoints: [new URL(entry, root).pathname], bundle: true, minify: true, format, target: 'es2020', write: false });
  return result.outputFiles[0].text.trim();
};

const itemImages = async () => {
  const dir = new URL('site/img/items/', root);
  const files = await readdir(dir).catch(() => []);
  const pngs = files.filter((f) => /^\d+\.png$/.test(f));
  const entries = await Promise.all(pngs.map(async (f) => [f.replace('.png', ''), (await readFile(new URL(f, dir))).toString('base64')]));
  return Object.fromEntries(entries);
};

const [template, game, example, app, collector, images] = await Promise.all([
  read('site/index.html'),
  read('data/game.json'),
  read('site/example.json'),
  bundle('site/app.js', 'iife'),
  bundle('src/collector.js', 'iife'),
  itemImages(),
]);

const version = JSON.parse(game).version;
const fill = (text, pairs) => pairs.reduce((out, [token, value]) => out.split(token).join(value), text);

const page = fill(template, [
  ['__DATA_VERSION__', version],
  ['__GAME_DATA__', safe(game)],
  ['__EXAMPLE_DATA__', safe(JSON.stringify(JSON.parse(example)))],
  ['__COLLECTOR__', safe(collector)],
  ['__ITEM_IMAGES__', JSON.stringify(images)],
  ['__APP__', safe(app)],
]);

const standalone = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`;

await mkdir(new URL('dist/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('dist/artifact.html', root), page),
  writeFile(new URL('dist/index.html', root), standalone),
  writeFile(new URL('dist/collector.min.js', root), `${collector}\n`),
]);
console.log(`dist/ pronto (${version}, ${Object.keys(images).length} imagens, ${(page.length / 1024).toFixed(0)} KB)`);

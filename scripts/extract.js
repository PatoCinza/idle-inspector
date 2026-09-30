import { writeFile, mkdir } from 'node:fs/promises';
import { extractDataset } from '../src/extract.js';

const ORIGIN = process.env.BAIAK_ORIGIN ?? 'https://baiakidle.com';

const bundleUrl = async () => {
  const html = await fetch(`${ORIGIN}/jogar/`).then((r) => r.text());
  const path = html.match(/\/jogar\/assets\/index-[\w-]+\.js/)?.[0];
  if (!path) throw new Error('bundle do jogo não encontrado em /jogar/');
  return `${ORIGIN}${path}`;
};

const url = await bundleUrl();
const source = await fetch(url).then((r) => r.text());
const dataset = extractDataset(source, { version: url.split('/').pop() });
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/game.json', import.meta.url), JSON.stringify(dataset));
console.log(`${dataset.version}: ${Object.keys(dataset.monsters).length} monstros, ${dataset.hunts.length} hunts, ${dataset.charms.length} charms`);

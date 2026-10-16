import { writeFile, mkdir } from 'node:fs/promises';
import { extractDataset } from '../src/extract.js';
import { hookSpells } from '../src/spells.js';

const ORIGIN = process.env.BAIAK_ORIGIN ?? 'https://baiakidle.com';

const DATA_ANCHOR = 'troll:{name:"Troll"';

const scriptPaths = (html) => [...new Set(html.match(/\/jogar\/assets\/[\w-]+\.js/g) ?? [])];

const fetchText = (url) => fetch(url).then((r) => r.text());

const findBundle = async () => {
  const html = await fetchText(`${ORIGIN}/jogar/`);
  for (const path of scriptPaths(html)) {
    const url = `${ORIGIN}${path}`;
    const source = await fetchText(url);
    if (source.includes(DATA_ANCHOR)) return { url, source };
  }
  throw new Error('bundle do jogo não encontrado em /jogar/');
};

const { url, source } = await findBundle();
const dataset = extractDataset(source, { version: url.split('/').pop() });
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/game.json', import.meta.url), JSON.stringify(dataset));
await writeFile(new URL('../data/spells.json', import.meta.url), JSON.stringify({ version: dataset.version, spells: hookSpells(dataset.spells) }));
console.log(`${dataset.version}: ${Object.keys(dataset.monsters).length} monstros, ${dataset.hunts.length} hunts, ${dataset.charms.length} charms, ${dataset.spells.length} magias`);

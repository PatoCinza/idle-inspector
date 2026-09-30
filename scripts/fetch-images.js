import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const ORIGIN = process.env.BAIAK_ORIGIN ?? 'https://baiakidle.com';
const CONCURRENCY = 4;
const dir = new URL('../site/img/items/', import.meta.url);

const dataset = JSON.parse(await readFile(new URL('../data/game.json', import.meta.url), 'utf8'));
await mkdir(dir, { recursive: true });
const existing = new Set(await readdir(dir));
const ids = [...new Set(Object.values(dataset.itemIds ?? {}))].filter((id) => !existing.has(`${id}.png`));

const download = async (id) => {
  const response = await fetch(`${ORIGIN}/api/things/object/${id}.png?v=4`);
  if (!response.ok) return { id, ok: false, status: response.status };
  await writeFile(new URL(`${id}.png`, dir), Buffer.from(await response.arrayBuffer()));
  return { id, ok: true };
};

const worker = async (queue, results) => {
  for (let id = queue.shift(); id != null; id = queue.shift()) results.push(await download(id).catch(() => ({ id, ok: false })));
  return results;
};

const queue = [...ids];
const results = (await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue, [])))).flat();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length} imagens baixadas, ${existing.size} já existiam${failed.length ? `, ${failed.length} falharam: ${failed.map((f) => f.id).join(', ')}` : ''}`);

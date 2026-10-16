import { readFile } from 'node:fs/promises';
import { huntRuns } from '../src/run.js';

const dataset = JSON.parse(await readFile(new URL('../data/game.json', import.meta.url), 'utf8'));
const csv = process.argv.includes('--csv');
const int = (n) => Math.round(n);
const elements = (byElement) => Object.entries(byElement).sort(([, a], [, b]) => b - a).map(([el, dps]) => `${el} ${int(dps)}`).join(' / ');

const rows = huntRuns(dataset)
  .sort((a, b) => a.minLevel - b.minLevel || b.xp - a.xp)
  .map((run) => ({
    hunt: run.name,
    level: run.minLevel,
    xp: int(run.xp),
    mobXp: int(run.mobXp),
    bossXp: int(run.bossXp),
    hp: int(run.hp),
    mobDps: int(run.mobDps),
    packDps: int(run.packDps),
    boss: run.boss?.name ?? '',
    bossDps: int(run.boss?.dps ?? 0),
    mobElements: elements(run.mobElements),
  }));

const quote = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
if (csv) console.log([Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(quote).join(','))].join('\n'));
else console.table(rows);

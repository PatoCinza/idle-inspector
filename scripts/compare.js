import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { decodePayload } from '../src/payload.js';
import { blockStats, compareGroups, groupBlocks, mean, pool, roomsFor, signatureDiff, summarize } from '../src/experiment.js';

const USAGE = `Uso: node scripts/compare.js <arquivos com códigos BLP1> [opções]

  --by label|signature   agrupa por rótulo do bloco ou pela distribuição de charms (padrão: label quando todos têm)
  --base <grupo>         grupo de referência (padrão: o primeiro bloco lido)
  --break-even 0.6,1.9   ganho mínimo em % para compensar (limitado por movimento, limitado por dano)
  --pause 3              descarta salas mais longas que N× a mediana (pausas, mortes, reconexões)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string' },
    base: { type: 'string' },
    'break-even': { type: 'string', default: '0.6,1.9' },
    pause: { type: 'string', default: '3' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !positionals.length) {
  console.log(USAGE);
  process.exit(positionals.length ? 0 : 1);
}

const dataset = JSON.parse(await readFile(new URL('../data/game.json', import.meta.url), 'utf8'));
const charmName = Object.fromEntries(dataset.charms.map((c) => [String(c.id), c.name]));
const monsterName = (key) => dataset.monsters[key]?.name ?? key;
const prettyPart = (part) => {
  const [id, monster] = part.split('>');
  return `${charmName[id] ?? `#${id}`} → ${monsterName(monster)}`;
};

const CODE = /BLP1\.[A-Za-z0-9+/=]+/g;
const texts = await Promise.all(positionals.map((path) => readFile(path, 'utf8').then((text) => ({ path, text }))));
const payloads = texts.flatMap(({ path, text }) => (text.match(CODE) ?? []).map((code) => ({ path, payload: decodePayload(code) })));

const blocks = payloads.map(({ path, payload }) => ({ ...blockStats(payload), path }));
const untimed = blocks.filter((b) => !b.timed);
const hunts = [...new Set(blocks.map((b) => b.huntId))];
const by = values.by ?? (blocks.every((b) => b.label) ? 'label' : 'signature');
const keyOf = by === 'label' ? (b) => b.label ?? '(sem rótulo)' : (b) => b.signature ?? '(sem charms)';
const groups = groupBlocks(blocks, keyOf);
const keys = Object.keys(groups);
const breakEven = values['break-even'].split(',').map((v) => Number(v) / 100);
const pauseFactor = Number(values.pause);

const pct = (x, digits = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`);
const sec = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '—');
const signedSec = (ms) => (Number.isFinite(ms) ? `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(2)} s` : '—');
const interval = (r, format) => (r ? `${format(r.change ?? r.diff)}  [${format(r.low)} a ${format(r.high)}]` : '—');
const stat = (xs) => {
  const s = summarize(xs);
  return s.n ? `${sec(s.mean)} ± ${sec(s.std)} (n=${s.n})` : '—';
};

const describeGroup = (key, index) => ({
  key,
  name: by === 'label' ? key : `config ${index + 1}`,
  pooled: pool(groups[key], pauseFactor),
  signature: groups[key].find((b) => b.signature)?.signature,
});

const printGroup = ({ name, pooled, signature }, isBase) => {
  console.log(`\n■ ${name}${isBase ? '  (referência)' : ''}`);
  if (signature) console.log(`  charms: ${signature.split(',').map(prettyPart).join(' · ')}`);
  console.log(`  ${pooled.blocks} bloco(s) · ${pooled.minutes.toFixed(1)} min · ${pooled.killsPerHour.toFixed(0)} kills/h`);
  console.log(`  sala (relógio): ${stat(pooled.roomTimes)}${pooled.pauses ? ` · ${pooled.pauses} descartada(s) como pausa` : ''}`);
  console.log(`  fase (timer do jogo): ${stat(pooled.phaseTimes)}`);
  console.log(`  entre waves (mesma sala): ${stat(pooled.waveGaps.inRoom)}`);
  if (pooled.engage.inRoom.length) console.log(`  primeiro golpe após wave: ${stat(pooled.engage.inRoom)}`);
  if (pooled.engage.transition.length) console.log(`  primeiro golpe na sala nova: ${stat(pooled.engage.transition)}`);
  if (pooled.idle) console.log(`  parado (ninguém ataca por 2,5–20 s): ${pct(pooled.idle.total).replace('+', '')} do tempo · entre waves: ${pct(pooled.idle.betweenWaves).replace('+', '')}`);
  const procs = Object.entries(pooled.procs).filter(([, p]) => p.n > 0);
  if (procs.length) console.log(`  procs/h: ${procs.map(([id, p]) => `${charmName[id] ?? `#${id}`} ${p.perHour.toFixed(0)} [${p.low.toFixed(0)}–${p.high.toFixed(0)}]`).join(' · ')}`);
  const times = pooled.phaseTimes.length ? pooled.phaseTimes : pooled.roomTimes;
  if (times.length > 2) {
    const hours = (n) => `${((n * mean(times)) / 3600000).toFixed(1)} h`;
    console.log(`  salas por grupo para medir ±1%: ${roomsFor(times, 0.01)} (${hours(roomsFor(times, 0.01))}) · ±3%: ${roomsFor(times, 0.03)} (${hours(roomsFor(times, 0.03))})`);
  }
};

const printComparison = (base, test) => {
  const result = compareGroups(base.pooled, test.pooled, breakEven);
  const diff = signatureDiff(base.signature, test.signature);
  console.log(`\n▶ ${test.name} vs ${base.name}`);
  if (diff.removed.length || diff.added.length) {
    console.log(`  sai: ${diff.removed.map(prettyPart).join(' · ') || '—'}`);
    console.log(`  entra: ${diff.added.map(prettyPart).join(' · ') || '—'}`);
  }
  console.log(`  salas/h (pelo tempo de sala): ${interval(result.rooms, pct)}`);
  console.log(`  salas/h (timer do jogo):      ${interval(result.phases, pct)}`);
  console.log(`  kills/h (média dos blocos):   ${interval(result.blocks, pct)}`);
  console.log(`  kills/h (total):              ${pct(result.killsPerHour)}`);
  console.log(`  primeiro golpe na sala nova:  ${interval(result.engageTransition, signedSec)}`);
  console.log(`  primeiro golpe após wave:     ${interval(result.engageInRoom, signedSec)}`);
  console.log(`  entre waves:                  ${interval(result.waveInRoom, signedSec)}`);
  console.log(`  break-even: ${pct(breakEven[0])} (movimento) a ${pct(breakEven[1])} (dano)`);
  console.log(`  veredito: ${result.verdict}`);
  if (result.verdict === 'inconclusivo' && result.roomsNeeded) {
    console.log(`  para separar os dois break-evens: ~${result.roomsNeeded} salas por grupo`);
  }
};

if (!blocks.length) {
  console.error('Nenhum código BLP1 encontrado nos arquivos.');
  process.exit(1);
}
if (untimed.length) console.warn(`Aviso: ${untimed.length} bloco(s) sem timeline (coletor antes da v4). Entram só em kills/h.`);
if (hunts.length > 1) console.warn(`Aviso: blocos de hunts diferentes (${hunts.join(', ')}). A comparação só faz sentido na mesma hunt.`);
blocks.filter((b) => b.mixedCharms).forEach((b) => console.warn(`Aviso: os charms mudaram no meio do bloco ${b.label ?? b.path}.`));
const described = keys.map(describeGroup);
const base = values.base ? described.find((g) => g.name === values.base || g.key === values.base) : described[0];
if (!base) {
  console.error(`Grupo de referência "${values.base}" não existe. Grupos: ${described.map((g) => g.name).join(', ')}`);
  process.exit(1);
}

console.log(`${blocks.length} bloco(s) · agrupados por ${by === 'label' ? 'rótulo' : 'charms'} · hunt ${hunts.join(', ')}`);
described.forEach((group) => printGroup(group, group === base));
described.filter((g) => g !== base).forEach((test) => printComparison(base, test));

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { decodePayload } from '../src/payload.js';
import { compareGroups, groupBlocks, mean, pool, roomsFor, signatureDiff, signatureParts, splitBlock, summarize } from '../src/experiment.js';
import { isHuntCreature } from '../src/model.js';

const USAGE = `Uso: node scripts/compare.js <arquivos com códigos BLP1> [opções]

  --by label|signature|charm:<chave>
                         agrupa por rótulo do bloco, pela distribuição de charms ou por ter um charm
                         numa criatura da hunt, ex.: charm:adrenaline_burst (padrão: label quando todos têm)
  --base <grupo>         grupo de referência (padrão: o primeiro bloco lido; em charm:, o grupo sem o charm)

Só contam charms em criaturas da hunt do bloco (incluindo o boss). Quando um deles muda no meio
do bloco, as salas são divididas pela distribuição ativa em cada trecho.
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

const knownHunt = (huntId) => dataset.hunts.some((h) => h.id === huntId);
const keepOf = (huntId) => (knownHunt(huntId) ? isHuntCreature(dataset, huntId) : () => true);
const parsed = payloads.map(({ path, payload }) => ({ path, payload, parts: splitBlock(payload, keepOf(payload.huntId)) }));
const blocks = parsed.flatMap(({ path, parts }) => parts.map((part) => ({ ...part, path })));
const nameOf = ({ path, payload }) => payload.label ?? `${path} (${new Date(payload.startedAt ?? 0).toLocaleString('pt-BR')})`;
const outsideHunt = ({ payload }) => {
  const seen = (payload.timeline?.charms ?? []).map(([, sig]) => sig).concat(payload.signature ?? []);
  const keep = keepOf(payload.huntId);
  return [...new Set(seen.flatMap((sig) => [...signatureParts(sig)]))].filter((part) => !keep(part.split('>')[1]));
};
const untimed = blocks.filter((b) => !b.timed);
const hunts = [...new Set(blocks.map((b) => b.huntId))];
const by = values.by ?? (blocks.every((b) => b.label) ? 'label' : 'signature');
const charmKey = by.startsWith('charm:') ? by.slice('charm:'.length) : null;
const charmId = charmKey ? dataset.charms.find((c) => c.key === charmKey)?.id : null;
if (charmKey && charmId == null) {
  console.error(`Charm "${charmKey}" não existe. Use a chave, ex.: adrenaline_burst.`);
  process.exit(1);
}
const hasCharm = (b) => [...signatureParts(b.signature)].some((part) => part.startsWith(`${charmId}>`));
const KEYS = {
  label: (b) => b.label ?? '(sem rótulo)',
  signature: (b) => b.signature ?? '(sem charms)',
  charm: (b) => `${hasCharm(b) ? 'com' : 'sem'} ${charmName[charmId]}`,
};
const keyOf = KEYS[charmKey ? 'charm' : by] ?? KEYS.signature;
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
  name: by === 'signature' ? `config ${index + 1}` : key,
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
parsed.filter(({ parts }) => parts.length > 1).forEach((block) => console.warn(`Aviso: os charms da hunt mudaram no meio do bloco ${nameOf(block)}. Ele foi dividido em ${block.parts.length} trechos e as salas que cruzam a troca ficaram de fora.`));
parsed.filter(({ payload }) => !knownHunt(payload.huntId)).forEach((block) => console.warn(`Aviso: hunt desconhecida no bloco ${nameOf(block)}. Todos os charms contam.`));
parsed.map((block) => [block, outsideHunt(block)]).filter(([, parts]) => parts.length)
  .forEach(([block, parts]) => console.warn(`Fora da hunt (não contam) no bloco ${nameOf(block)}: ${parts.map(prettyPart).join(' · ')}`));
const described = keys.map(describeGroup);
const defaultBase = described.find((g) => charmKey && g.key.startsWith('sem ')) ?? described[0];
const base = values.base ? described.find((g) => g.name === values.base || g.key === values.base) : defaultBase;
if (!base) {
  console.error(`Grupo de referência "${values.base}" não existe. Grupos: ${described.map((g) => g.name).join(', ')}`);
  process.exit(1);
}

const BY_NAME = { label: 'rótulo', signature: 'charms na hunt' };
console.log(`${parsed.length} bloco(s), ${blocks.length} trecho(s) · agrupados por ${BY_NAME[by] ?? `${charmName[charmId]} na hunt`} · hunt ${hunts.join(', ')}`);
described.forEach((group) => printGroup(group, group === base));
described.filter((g) => g !== base).forEach((test) => printComparison(base, test));

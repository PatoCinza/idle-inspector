import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCharacter, VOCATIONS, STATS_HEADER } from '../src/dom/parse.js';
import { readParty, readCharmCards } from '../src/dom/reader.js';
import { slotsFromCards } from '../src/dom/charms.js';
import { readSummary } from '../src/dom/summary.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const panelPt = readFileSync(new URL('./fixtures/status-panel-pt.txt', import.meta.url), 'utf8');
const panelPtInline = readFileSync(new URL('./fixtures/status-panel-pt-inline.txt', import.meta.url), 'utf8');

const panelEn = [
  'Level', '1.204', 'XP', '1', 'Hit Points', '9.870', 'Mana', '4.500', 'Capacity', '1',
  'BONUSES (ITEMS + BUILD + PROFICIENCY)', 'Crit chance', '+12,5%', 'Crit damage', '+80%', 'Loot', '+9,8%',
  'PROFICIENCY (WEAPON)', 'Loot', '+50%',
].join('\n');

test('painel real em português, com cabeçalhos em maiúsculas, é lido por inteiro', () => {
  assert.deepEqual(parseCharacter(panelPt), {
    level: 956, maxHp: 5544, maxMana: 37669, lootPct: 4, critChance: 24.472, critDmg: 153.534,
  });
});

test('painel atual, com o texto do painel sem quebras de linha entre rótulo e valor, é lido por inteiro', () => {
  assert.deepEqual(parseCharacter(panelPtInline), {
    level: 974, maxHp: 5688, maxMana: 38361, lootPct: 4, critChance: 24.472, critDmg: 153.534,
  });
});

test('painel em inglês é lido e o bônus da proficiência não entra no Loot', () => {
  assert.deepEqual(parseCharacter(panelEn), {
    level: 1204, maxHp: 9870, maxMana: 4500, lootPct: 9.8, critChance: 12.5, critDmg: 80,
  });
});

test('texto sem a seção de bônus devolve bônus zero', () => {
  assert.equal(parseCharacter('Nível\n10\nCapacidade\n1').lootPct, 0);
});

test('rótulos dos botões da party e do cabeçalho de status', () => {
  assert.equal('Sorcerer · Pato Mago'.match(VOCATIONS)[2], 'Pato Mago');
  assert.equal('KnightTank · corpo a corpo'.match(VOCATIONS), null);
  assert.ok(STATS_HEADER.test('Bônus (itens + build)'));
  assert.ok(!STATS_HEADER.test('Tática'));
});

const fakeNode = (props = {}) => ({ children: [], parentElement: null, innerText: '', textContent: '', ...props });

const fakeParty = (members) => {
  const log = [];
  let selected = null;
  const buttons = members.map((member) => ({
    label: `${member.vocation} · ${member.name}`,
    member,
    getAttribute: () => `${member.vocation} · ${member.name}`,
    title: '',
    textContent: `${member.vocation} · ${member.name}`,
    click: () => { selected = member; log.push(member.name); },
  }));
  const header = fakeNode({ textContent: 'Bônus (itens + build)' });
  const panel = fakeNode({ children: [header] });
  Object.defineProperty(panel, 'innerText', { get: () => selected.text });
  header.parentElement = panel;
  Object.defineProperty(header, 'innerText', { get: () => 'Bônus (itens + build)' });
  const doc = {
    querySelectorAll: (selector) => (selector === 'body *' ? [header] : [...buttons, buttons[0]]),
  };
  return { doc, log };
};

test('readParty clica em cada membro, lê o painel e devolve a seleção ao primeiro', async () => {
  const text = (level, loot) => `${'x'.repeat(400)}Nível\n${level}\nCapacidade\n1\nBônus (itens)\nLoot\n+${loot}%\nAddon`;
  const { doc, log } = fakeParty([
    { vocation: 'Sorcerer', name: 'Pato Mago', text: text(956, 4) },
    { vocation: 'Knight', name: 'PatoCinza', text: text(900, 9.8) },
  ]);
  const members = await readParty({ doc, wait: async () => {} });
  assert.deepEqual(log, ['Pato Mago', 'PatoCinza', 'Pato Mago']);
  assert.deepEqual(members.map((m) => [m.name, m.vocation, m.level, m.lootPct]), [
    ['Pato Mago', 'sorcerer', 956, 4],
    ['PatoCinza', 'knight', 900, 9.8],
  ]);
});

test('readParty sem botões devolve lista vazia', async () => {
  const members = await readParty({ doc: { querySelectorAll: () => [] }, wait: async () => {} });
  assert.deepEqual(members, []);
});

const fakeCharmsModal = ({ open }) => {
  const clicks = [];
  const card = (name, grade, creature) => ({
    querySelector: (selector) => ({
      '.charm-rune-frame': { style: { backgroundImage: `url(grade${grade}.png)` } },
      '.charm-card-name': { textContent: name },
      '.charm-creature-box': { title: creature },
    }[selector] ?? null),
  });
  let tabIndex = -1;
  const pages = [[card('Gut', 3, 'Branchy Crawler'), card('Scavenge', 0, '')], [card('Fatal Hold', 2, null)]];
  const tabs = pages.map((_, index) => ({ click: () => { tabIndex = index; clicks.push(`tab${index}`); } }));
  const modal = { classList: { contains: () => !open } };
  const doc = {
    getElementById: (id) => ({
      'tab-charms': { click: () => clicks.push('open') },
      'charms-modal': modal,
      'charms-modal-close': { click: () => clicks.push('close') },
    }[id] ?? null),
    querySelectorAll: (selector) => (selector.endsWith('.charm-cat-tab') ? tabs : pages[tabIndex] ?? []),
  };
  return { doc, clicks };
};

test('readCharmCards abre a janela, percorre as abas, filtra sem tier e fecha de novo', async () => {
  const { doc, clicks } = fakeCharmsModal({ open: false });
  const cards = await readCharmCards({ doc, wait: async () => {} });
  assert.deepEqual(clicks, ['open', 'tab0', 'tab1', 'close']);
  assert.deepEqual(cards, [
    { name: 'Gut', tier: 3, creature: 'Branchy Crawler' },
    { name: 'Fatal Hold', tier: 2, creature: null },
  ]);
});

test('readCharmCards não fecha uma janela que já estava aberta pelo usuário', async () => {
  const { doc, clicks } = fakeCharmsModal({ open: true });
  await readCharmCards({ doc, wait: async () => {} });
  assert.deepEqual(clicks, ['tab0', 'tab1']);
});

test('readCharmCards devolve null quando a janela de Charms não existe', async () => {
  assert.equal(await readCharmCards({ doc: { getElementById: () => null }, wait: async () => {} }), null);
});

test('cards viram slots por id de charm e chave da criatura', () => {
  const gut = dataset.charms.find((c) => c.key === 'gut');
  const crawler = Object.entries(dataset.monsters).find(([, m]) => m.name === 'Branchy Crawler')[0];
  const slots = slotsFromCards(dataset, [
    { name: 'Gut', tier: 3, creature: 'Branchy Crawler' },
    { name: 'Scavenge', tier: 2, creature: null },
    { name: 'Charm inexistente', tier: 1, creature: 'Troll' },
  ]);
  assert.deepEqual(slots[gut.id], { tier: 3, monsterKey: crawler });
  assert.deepEqual(slots[dataset.charms.find((c) => c.key === 'scavenge').id], { tier: 2 });
  assert.equal(Object.keys(slots).length, 2);
});

test('resumo da leitura avisa quando não achou a party, o painel ou os charms', () => {
  assert.equal(readSummary({ members: [], cards: [] }).ok, false);
  const partial = readSummary({ members: [{ name: 'A', level: 10 }, { name: 'B' }], cards: [1, 2] });
  assert.equal(partial.ok, false);
  assert.ok(partial.message.includes('B'));
  assert.ok(readSummary({ members: [{ name: 'A', level: 10 }], cards: null }).message.includes('Charms não encontrada'));
  assert.deepEqual(readSummary({ members: [{ name: 'A', level: 10 }], cards: [1] }), { ok: true, message: 'Party lida (A) · 1 charms.' });
});

test('cards reais do jogo mapeiam Gut e Scavenge para as criaturas certas', () => {
  const cards = [
    { name: 'Bloated Man-Maggot', tier: 0, creature: null },
    { name: 'Scavenge', tier: 3, creature: 'Bloated Man-Maggot' },
    { name: 'Gut', tier: 3, creature: 'Oozing Corpus' },
    { name: 'Savage Blow', tier: 3, creature: 'Bloated Man-Maggot' },
    { name: 'Void Inversion', tier: 3, creature: null },
  ];
  const slots = slotsFromCards(dataset, cards);
  const idOf = (key) => dataset.charms.find((c) => c.key === key).id;
  const keyOf = (name) => Object.entries(dataset.monsters).find(([, m]) => m.name === name)[0];
  assert.deepEqual(slots[idOf('scavenge')], { tier: 3, monsterKey: keyOf('Bloated Man-Maggot') });
  assert.deepEqual(slots[idOf('gut')], { tier: 3, monsterKey: keyOf('Oozing Corpus') });
});

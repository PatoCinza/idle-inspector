import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCharacter } from '../src/dom/parse.js';
import { metaRotation, metaSpells, spellPower } from '../src/mage-meta.js';
import { idiotCheck, charmCheck } from '../src/check.js';
import { renderCheck } from '../src/overlay/check-view.js';
import { offenseOf } from '../src/recommend.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'wanderingpillar-cave');
const spell = (name) => dataset.spells.find((s) => s.name === name);
const flat = { physical: 0, energy: 0, earth: 0, fire: 0, ice: 0, holy: 0, death: 0 };

const sorcerer = (elements = {}) => ({ name: 'Pato Mago', vocation: 'sorcerer', level: 1300, magicLevel: 170, critChance: 20, critDmg: 100, elements });
const druid = (elements = {}) => ({ name: 'Pato Druida', vocation: 'druid', level: 1204, magicLevel: 140, elements });

const rotationOf = (vocation, names) => ({ members: { [vocation]: { mobs: { spells: Object.fromEntries(names.map((name) => [spell(name).words, { casts: 10 }])) } } } });

test('bônus por elemento e perk de dano base de uma magia vêm do painel de status', () => {
  const text = 'Nível\n1300\nCapacidade\n1\nBônus (itens + build + proficiência + Codex + boosts)Proteção energy+16.604%Dano energy+25.2%Dano crítico+150%Proficiência (arma na mão)Soultainternível 9/9Magic level de energy+4Penetração de ice+10%Chance de crítico em magias e runas de energy+3%Thunderstorm — Dano base+15%Death Echo — Dano crítico+12,5%Stats dos itensSoulshanks +3Dano energy+5%';
  const parsed = parseCharacter(text);
  assert.deepEqual(parsed.elements, { energy: { dmgPct: 25.2, magicLevel: 4, critChance: 3 }, ice: { pierce: 10 } });
  assert.deepEqual(parsed.spellAugments, { Thunderstorm: 15 });
});

test('MS: as duas Ultimate Explosions, Death Echo opcional e a runa do elemento com bônus', () => {
  const rotation = metaRotation({ dataset, member: sorcerer({ energy: { dmgPct: 40 } }), resist: flat });
  assert.deepEqual(rotation.ultimates.map((s) => s.name), ['Rage of the Skies', "Hell's Core"]);
  assert.equal(rotation.rune.name, 'Thunderstorm');
  assert.deepEqual(rotation.optional.map((s) => s.name), ['Death Echo']);
  assert.equal(rotation.fork, null);
  assert.equal(metaRotation({ dataset, member: sorcerer({ ice: { dmgPct: 40 } }), resist: flat }).rune.name, 'Avalanche');
});

test('a resistência da sala pesa contra o bônus do personagem', () => {
  const member = sorcerer({ energy: { dmgPct: 20 } });
  assert.equal(metaRotation({ dataset, member, resist: { ...flat, energy: 50 } }).rune.name !== 'Thunderstorm', true);
  const pierced = sorcerer({ energy: { dmgPct: 20, pierce: 50 } });
  assert.equal(metaRotation({ dataset, member: pierced, resist: { ...flat, energy: 50 } }).rune.name, 'Thunderstorm');
});

test('ED: fork de ice ou earth pela resistência e pelo bônus', () => {
  const rotation = metaRotation({ dataset, member: druid(), resist: { ...flat, ice: 50 } });
  assert.deepEqual(rotation.ultimates.map((s) => s.name), ['Wrath of Nature', 'Eternal Winter']);
  assert.equal(rotation.fork.name, 'Forked Thorns');
  assert.equal(rotation.rune.element, 'earth');
  assert.equal(metaRotation({ dataset, member: druid(), resist: flat }).fork.name, 'Forked Glacier');
});

test('runa Max só entra com o level e se o personagem já foi visto usando', () => {
  const member = { ...sorcerer({ energy: { dmgPct: 40 } }), level: 1600 };
  assert.equal(metaRotation({ dataset, member, resist: flat }).rune.name, 'Thunderstorm');
  const cast = new Set([spell('Max Thunderstorm').words]);
  assert.equal(metaRotation({ dataset, member, resist: flat, cast }).rune.name, 'Max Thunderstorm');
});

test('perk de dano base da magia aumenta o poder dela', () => {
  const base = spellPower({ spell: spell('Avalanche'), member: sorcerer(), resist: flat });
  const boosted = spellPower({ spell: spell('Avalanche'), member: { ...sorcerer(), spellAugments: { Avalanche: 50 } }, resist: flat });
  assert.ok(Math.abs(boosted / base - 1.5) < 1e-9);
});

test('recomendação de hunts mostra a rotação de mage', () => {
  const offense = offenseOf({ dataset, hunt, members: [sorcerer({ energy: { dmgPct: 40 } }), druid()], mix: null });
  const [ms, ed] = offense.members;
  assert.deepEqual(ms.spells.slice(0, 2).map((s) => s.name), ['Rage of the Skies', "Hell's Core"]);
  assert.ok(ms.spells.some((s) => s.name === 'Death Echo' && s.role === 'optional'));
  assert.ok(ed.spells.some((s) => s.role === 'fork'));
  assert.equal(metaSpells(null).length, 0);
});

test('conferir: falta de Ultimate Explosion é erro e runa pior que a do bônus é atenção', () => {
  const member = sorcerer({ energy: { dmgPct: 60 } });
  const rotation = rotationOf('sorcerer', ['Rage of the Skies', 'Great Fireball', 'Death Echo', 'Energy Strike']);
  const check = idiotCheck({ dataset, hunt, party: [member], rotation, charms: null });
  const [ms] = check.members;
  const texts = ms.spells.map((i) => `${i.level} ${i.text}`);
  assert.ok(texts.some((t) => t.startsWith('bad Falta Hell')));
  assert.ok(texts.some((t) => t.startsWith('warn Troque Great Fireball por Thunderstorm')));
  assert.ok(texts.some((t) => t.startsWith('warn Fora da rotação padrão: Energy Strike')));
  assert.ok(!texts.some((t) => t.includes('Death Echo')));
  assert.equal(ms.level, 'bad');
  assert.equal(check.level, 'bad');
});

test('conferir: rotação certa fica ok e a build lembra o elemento', () => {
  const member = sorcerer({ energy: { dmgPct: 60 } });
  const rotation = rotationOf('sorcerer', ['Rage of the Skies', "Hell's Core", 'Thunderstorm']);
  const [ms] = idiotCheck({ dataset, hunt, party: [member], rotation, charms: null }).members;
  assert.ok(ms.spells.every((i) => i.level === 'ok'));
  assert.match(ms.build[0].text, /dano de energy e magic level de energy/);
  const offBuild = sorcerer({ holy: { dmgPct: 60 } });
  const [other] = idiotCheck({ dataset, hunt, party: [offBuild], rotation, charms: null }).members;
  assert.ok(other.build.some((i) => i.level === 'warn' && /A build não dá dano/.test(i.text)));
});

test('conferir: ED sem fork é erro; vocação sem regra não acusa nada', () => {
  const rotation = { members: { ...rotationOf('druid', ['Wrath of Nature', 'Eternal Winter', 'Avalanche']).members } };
  const check = idiotCheck({ dataset, hunt, party: [druid(), { name: 'PatoCinza', vocation: 'knight', level: 1193 }], rotation, charms: null });
  assert.ok(check.members[0].spells.some((i) => i.level === 'bad' && /Falta o fork/.test(i.text)));
  assert.ok(check.members[1].spells.every((i) => i.level === 'ok'));
});

const charmTableOf = (overrides = {}) => ({
  ready: true,
  rows: [
    { name: 'Cave Devourer', majorName: 'Low Blow', minorName: 'Gut', equipped: ['Low Blow', 'Gut'] },
    { name: 'Wandering Pillar', majorName: 'Dodge', minorName: null, equipped: ['Dodge'] },
  ],
  currentDamage: 0.3,
  damageTotal: 0.3,
  ...overrides,
});

test('charms: iguais ao plano ficam ok; um fora é atenção, dois ou mais é erro', () => {
  assert.deepEqual(charmCheck(charmTableOf()).items.map((i) => i.level), ['ok']);
  const one = charmCheck(charmTableOf({ rows: [{ name: 'Cave Devourer', majorName: 'Low Blow', minorName: null, equipped: ['Wound'] }] }));
  assert.deepEqual(one.items.map((i) => i.level), ['warn']);
  assert.match(one.items[0].text, /Low Blow deveria estar em Cave Devourer/);
  const many = charmCheck(charmTableOf({ rows: [{ name: 'Cave Devourer', majorName: 'Low Blow', minorName: 'Gut', equipped: [] }], currentDamage: 0.2 }));
  assert.ok(many.items.filter((i) => i.level === 'bad').length >= 2);
  assert.ok(many.items.some((i) => /rendem 33% menos/.test(i.text)));
  assert.deepEqual(charmCheck({ ready: false, reason: 'window' }), { ready: false, reason: 'window', items: [] });
});

test('aba Conferir mostra cada personagem, magias, build e charms', () => {
  const rotation = rotationOf('sorcerer', ['Rage of the Skies', 'Great Fireball']);
  const html = renderCheck(idiotCheck({ dataset, hunt, party: [sorcerer({ energy: { dmgPct: 60 } })], rotation, charms: { ready: false, reason: 'charms' } }));
  assert.match(html, /Pato Mago/);
  assert.match(html, /<h4>Magias<\/h4>/);
  assert.match(html, /<h4>Build<\/h4>/);
  assert.match(html, /pill bad">errado/);
  assert.match(html, /Ler party e charms/);
  assert.match(renderCheck(idiotCheck({ dataset, hunt: null })), /Entre numa hunt/);
});

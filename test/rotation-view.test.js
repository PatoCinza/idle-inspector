import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rotationTable } from '../src/rotation-table.js';
import { renderRotation } from '../src/overlay/rotation-view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const rotation = JSON.parse(readFileSync(new URL('./fixtures/rotation-stats-bloated.json', import.meta.url)));
const mage = { name: 'Pato Mago', vocation: 'sorcerer', level: 974, magicLevel: 168, spellDmgPct: 115.579, critChance: 24.472, critDmg: 153.534, proficiency: { weapon: 'Soultainter', level: 8, maxLevel: 9, bonuses: [{ label: 'Dano crítico', value: 20, pct: true }] } };

test('aba Rotação mostra cada personagem, as magias, a comparação com a reserva e as salas', () => {
  const html = renderRotation(rotationTable({ dataset, rotation, party: [mage] }));
  ['Pato Mago (Sorcerer)', 'Druid', 'Knight', 'Death Echo', 'Thunderstorm', 'eco ', 'rende menos', 'empate', 'Executioner', 'Salas por rotação', 'Forked Glacier', 'Soultainter 8/9', 'data-rotation="boss"'].forEach((text) => assert.ok(html.includes(text), text));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('NaN'));
});

test('sem party lida avisa que falta level e magic level', () => {
  const html = renderRotation(rotationTable({ dataset, rotation, party: null }));
  assert.ok(html.includes('Level e magic level não lidos'));
});

test('período sem dados mostra a espera e mantém as abas', () => {
  const html = renderRotation(rotationTable({ dataset, rotation: null, party: null, period: 'boss' }));
  assert.ok(html.includes('sala do boss'));
  assert.ok(html.includes('data-rotation="mobs"'));
});

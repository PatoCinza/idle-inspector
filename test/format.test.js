import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInteger, formatCount, formatGold, formatPercent, formatDuration, formatMinutes } from '../src/overlay/format.js';

test('contagens usam vírgula decimal e menos casas quando o número é grande', () => {
  assert.equal(formatCount(2.345), '2,35');
  assert.equal(formatCount(34.56), '34,6');
  assert.equal(formatCount(1234.5), '1.235');
  assert.equal(formatCount(Infinity), '—');
});

test('ouro usa k e kk', () => {
  assert.equal(formatGold(950), '950');
  assert.equal(formatGold(12500), '12,5 k');
  assert.equal(formatGold(2_340_000), '2,34 kk');
  assert.equal(formatGold(NaN), '—');
});

test('chance mostra 3 algarismos significativos', () => {
  assert.equal(formatPercent(0.653), '65,3%');
  assert.equal(formatPercent(0.0008), '0,08%');
  assert.equal(formatPercent(1), '100%');
});

test('duração escolhe segundos, minutos, horas ou dias', () => {
  assert.equal(formatDuration(0.004), '14 s');
  assert.equal(formatDuration(0.25), '15,0 min');
  assert.equal(formatDuration(3.5), '3,50 h');
  assert.equal(formatDuration(72), '3,00 d');
  assert.equal(formatDuration(Infinity), '—');
});

test('minutos medidos viram min ou h e min', () => {
  assert.equal(formatMinutes(12.34), '12,3 min');
  assert.equal(formatMinutes(65.9), '1 h 05 min');
});

test('inteiros arredondam e usam separador de milhar', () => {
  assert.equal(formatInteger(2181.4), '2.181');
  assert.equal(formatInteger(0), '0');
  assert.equal(formatInteger(Infinity), '—');
});

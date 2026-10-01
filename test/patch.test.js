import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { patchHtml } from '../src/overlay/patch.js';

const setup = (html) => {
  const { document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const root = document.getElementById('root');
  root.innerHTML = html;
  return root;
};

const table = (rows) => `<p class="status">${rows.length} linhas</p><div class="scroll"><table><tbody>${rows.map((r) => `<tr><td>${r}</td></tr>`).join('')}</tbody></table></div>`;

test('só troca o que mudou e mantém o contêiner de rolagem', () => {
  const root = setup(table(['a', 'b', 'c']));
  const scroll = root.querySelector('.scroll');
  const firstRow = root.querySelector('tr');
  patchHtml(root, table(['a', 'b', 'd']));
  assert.equal(root.querySelector('.scroll'), scroll);
  assert.equal(root.querySelector('tr'), firstRow);
  assert.equal(root.querySelectorAll('td')[2].textContent, 'd');
});

test('atributo diferente troca o elemento, estrutura diferente troca tudo', () => {
  const root = setup('<button class="tab">A</button><button class="tab active">B</button>');
  const [first, second] = root.querySelectorAll('button');
  patchHtml(root, '<button class="tab active">A</button><button class="tab">B</button>');
  assert.notEqual(root.querySelectorAll('button')[0], first);
  assert.notEqual(root.querySelectorAll('button')[1], second);
  assert.equal(root.querySelector('.active').textContent, 'A');
  patchHtml(root, '<p>outra aba</p>');
  assert.equal(root.innerHTML, '<p>outra aba</p>');
});

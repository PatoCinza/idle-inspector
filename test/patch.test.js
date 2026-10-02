import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { patchHtml, setHtml, htmlFragment } from '../src/overlay/patch.js';

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

test('setHtml monta estilo, tabela e texto escapado sem innerHTML', () => {
  const root = setup('');
  setHtml(root, `<style>.a { color: red }</style>${table(['&lt;b&gt;x&lt;/b&gt;'])}`);
  assert.equal(root.querySelector('style').textContent, '.a { color: red }');
  assert.equal(root.querySelectorAll('td').length, 1);
  assert.equal(root.querySelector('td').textContent, '<b>x</b>');
  assert.equal(root.querySelector('b'), null);
  setHtml(root, '');
  assert.equal(root.childNodes.length, 0);
});

test('o fragmento pertence ao documento de destino', () => {
  const root = setup('');
  const fragment = htmlFragment(root.ownerDocument, '<span>a</span><button data-action="x">b</button>');
  assert.equal(fragment.childNodes.length, 2);
  assert.ok([...fragment.childNodes].every((node) => node.ownerDocument === root.ownerDocument));
});

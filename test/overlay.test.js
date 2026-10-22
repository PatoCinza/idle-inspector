import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { mountOverlay } from '../extension/content/overlay.js';
import { initialApp, reduceApp } from '../src/app-state.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));

const page = () => {
  const { document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  const createElement = document.createElement.bind(document);
  const opened = {};
  document.createElement = (tag) => {
    const element = createElement(tag);
    const attach = element.attachShadow?.bind(element);
    if (attach) element.attachShadow = (init) => { opened.shadow = attach(init); return opened.shadow; };
    return element;
  };
  const setHidden = (next) => {
    hidden = next;
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'));
  };
  return { document, opened, setHidden };
};

const mount = (ui = {}) => {
  const { document, opened, setHidden } = page();
  const overlay = mountOverlay({ doc: document, dataset, iconUrl: () => null, ui, saveUi: () => {} });
  const bodyText = () => opened.shadow.querySelector('.body').textContent.trim();
  return { overlay, bodyText, setHidden };
};

const app = reduceApp(initialApp(), { type: 'connect', t: 0 }, { dataset });

test('painel visível renderiza depois do atraso', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { overlay, bodyText } = mount();
  overlay.update(app);
  assert.equal(bodyText(), '');
  t.mock.timers.tick(500);
  assert.notEqual(bodyText(), '');
});

test('painel recolhido não renderiza até ser expandido', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { overlay, bodyText } = mount({ collapsed: true });
  overlay.update(app);
  t.mock.timers.tick(5000);
  assert.equal(bodyText(), '');
  overlay.reveal();
  assert.notEqual(bodyText(), '');
});

test('aba do navegador escondida não renderiza até voltar', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { overlay, bodyText, setHidden } = mount();
  setHidden(true);
  overlay.update(app);
  t.mock.timers.tick(5000);
  assert.equal(bodyText(), '');
  setHidden(false);
  assert.notEqual(bodyText(), '');
});

const MIN = 60000;
const hunting = (minutes) => [0, minutes].reduce((state, m) => reduceApp(state, {
  type: 'snapshot', t: m * MIN, bestiary: { 'h:rottengolem-cave': m, rotten_golem: m * 10 }, loot: { 'gold coin': { n: m, g: m } },
}, { dataset }), app);

test('trocar de aba não herda a espera longa da aba anterior', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { document, opened } = page();
  const overlay = mountOverlay({ doc: document, dataset, iconUrl: () => null, ui: { tab: 'hunts' }, saveUi: () => {} });
  const status = () => opened.shadow.querySelector('.body .status')?.textContent ?? '';
  overlay.update(hunting(1));
  t.mock.timers.tick(500);
  overlay.update(hunting(2));
  t.mock.timers.tick(500);
  opened.shadow.querySelector('[data-tab="drops"]').dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
  assert.match(status(), /2,0 min/);
  overlay.update(hunting(3));
  t.mock.timers.tick(1500);
  assert.match(status(), /3,0 min/);
});

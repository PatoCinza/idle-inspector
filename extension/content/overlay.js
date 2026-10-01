import { dropsTable } from '../../src/drops.js';
import { windowOf } from '../../src/session.js';
import { renderBody, nextSort, DEFAULT_SORT } from '../../src/overlay/view.js';
import { bestiaryTable } from '../../src/bestiary.js';
import { codexTable } from '../../src/codex.js';
import { charmTable } from '../../src/charm-plan.js';
import { renderBestiary, renderCodex, renderCharms } from '../../src/overlay/plans-view.js';
import { STYLES } from '../../src/overlay/styles.js';

const RENDER_DELAY_MS = 500;
const VISIBLE_GRIP_PX = 80;
const ISOLATED_EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'contextmenu'];

const SHELL = `<style>${STYLES}</style>
<section class="panel">
  <header class="bar" data-drag>
    <strong>Baiak Loot Planner</strong>
    <div class="actions">
      <button class="ghost" data-action="read-party" title="Lê o bônus de loot da party e os charms equipados">Ler party e charms</button>
      <button class="ghost" data-action="toggle" title="Recolher ou expandir">▾</button>
    </div>
  </header>
  <nav class="tabs"></nav>
  <div class="body"></div>
</section>`;

const TABS = [
  { id: 'drops', label: 'Drops' },
  { id: 'bestiary', label: 'Bestiário' },
  { id: 'codex', label: 'Codex' },
  { id: 'charms', label: 'Charms' },
];

export const defaultUi = () => ({ x: null, y: null, collapsed: false, sort: DEFAULT_SORT, tab: 'drops' });

export const mountOverlay = ({ doc, dataset, iconUrl, ui: stored, saveUi, actions = {} }) => {
  let ui = { ...defaultUi(), ...stored };
  let app = null;
  let timer = null;
  let notice = null;
  let busy = false;

  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = SHELL;
  ISOLATED_EVENTS.forEach((type) => host.addEventListener(type, (event) => event.stopPropagation()));

  const panel = shadow.querySelector('.panel');
  const body = shadow.querySelector('.body');
  const view = doc.defaultView;

  const clamp = (value, max) => Math.min(Math.max(0, value), Math.max(0, max));

  const applyUi = () => {
    panel.classList.toggle('collapsed', ui.collapsed);
    if (ui.x === null) {
      Object.assign(panel.style, { left: '', top: '', right: '' });
      return;
    }
    panel.style.left = `${clamp(ui.x, view.innerWidth - VISIBLE_GRIP_PX)}px`;
    panel.style.top = `${clamp(ui.y, view.innerHeight - VISIBLE_GRIP_PX)}px`;
    panel.style.right = 'auto';
  };

  const updateUi = (patch) => {
    ui = { ...ui, ...patch };
    applyUi();
    saveUi(ui);
  };

  const tabsNav = shadow.querySelector('.tabs');

  const renderTabs = () => {
    tabsNav.innerHTML = TABS.map(({ id, label }) => `<button class="tab${id === ui.tab ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('');
  };

  const dropsOf = (window) => dropsTable({ dataset, window, party: app.party?.members ?? null, charmSlots: app.charmSlots });

  const views = {
    drops: (window) => renderBody({
      table: dropsOf(window),
      window, sort: ui.sort, iconUrl, dataVersion: dataset.version, notice,
    }),
    codex: (window) => {
      const drops = dropsOf(window);
      return renderCodex(codexTable({ dataset, hunt: drops.hunt, rows: drops.rows, codex: app.codex }));
    },
    charms: (window) => renderCharms(charmTable({
      dataset,
      window,
      party: app.party?.members ?? null,
      charmSlots: app.charmSlots,
      charmStats: app.charmStats,
      procs: app.procs ?? null,
      combat: app.combat ?? null,
      bestiary: app.session.last?.bestiary ?? null,
    })),
    bestiary: (window) => renderBestiary(bestiaryTable({ dataset, window, counts: app.session.last?.bestiary ?? null })),
  };

  const render = () => {
    if (!app) return;
    const window = windowOf(app.session);
    const scrollTop = shadow.querySelector('.scroll')?.scrollTop ?? 0;
    renderTabs();
    body.innerHTML = (views[ui.tab] ?? views.drops)(window);
    const scroll = shadow.querySelector('.scroll');
    if (scroll) scroll.scrollTop = scrollTop;
  };

  const scheduleRender = () => {
    timer ??= setTimeout(() => {
      timer = null;
      render();
    }, RENDER_DELAY_MS);
  };

  const readButton = shadow.querySelector('[data-action="read-party"]');

  const setBusy = (next) => {
    busy = next;
    readButton.disabled = next;
    readButton.textContent = next ? 'Lendo…' : 'Ler party e charms';
  };

  const readParty = async () => {
    if (busy) return;
    setBusy(true);
    notice = await actions.readParty().catch(() => ({ ok: false, message: 'Falha ao ler a party.' }));
    setBusy(false);
    render();
  };

  const ownActions = {
    toggle: () => updateUi({ collapsed: !ui.collapsed }),
    'read-party': readParty,
  };

  const onActivate = (event) => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) {
      updateUi({ tab });
      render();
      return;
    }
    const sortKey = event.target.closest('[data-sort]')?.dataset.sort;
    if (sortKey) {
      updateUi({ sort: nextSort(ui.sort, sortKey) });
      render();
      return;
    }
    ownActions[event.target.closest('[data-action]')?.dataset.action]?.();
  };

  shadow.addEventListener('click', onActivate);
  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.closest('[data-sort]')) onActivate(event);
  });

  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const bar = event.currentTarget;
    const rect = panel.getBoundingClientRect();
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    bar.setPointerCapture(event.pointerId);
    const move = (next) => {
      ui = { ...ui, x: next.clientX - offset.x, y: next.clientY - offset.y };
      applyUi();
    };
    const stop = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', stop);
      saveUi(ui);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', stop);
  };

  shadow.querySelector('[data-drag]').addEventListener('pointerdown', startDrag);
  view.addEventListener('resize', applyUi);

  applyUi();
  doc.documentElement.append(host);

  return {
    reveal: () => updateUi({ x: null, y: null, collapsed: false }),
    update: (next) => {
      app = next;
      scheduleRender();
    },
    renderNow: (next) => {
      app = next;
      render();
    },
  };
};

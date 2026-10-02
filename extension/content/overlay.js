import { dropsTable, plannedDropsTable } from '../../src/drops.js';
import { planFor } from '../../src/plan.js';
import { renderBody, renderHuntPicker, nextSort, DEFAULT_SORT } from '../../src/overlay/view.js';
import { bestiaryTable, planKillRates } from '../../src/bestiary.js';
import { codexTable, codexSection } from '../../src/codex.js';
import { charmTable } from '../../src/charm-plan.js';
import { renderBestiary, renderCodex, renderCodexNav, renderCodexSection, renderCharms, renderSample, UNREAD_CODEX } from '../../src/overlay/plans-view.js';
import { sampleTable, measuredQuantities } from '../../src/drop-log.js';
import { skippedItems } from '../../src/model.js';
import { STYLES } from '../../src/overlay/styles.js';
import { renderWelcome, welcomeChecklist } from '../../src/overlay/welcome-view.js';
import { patchHtml, setHtml } from '../../src/overlay/patch.js';

const RENDER_DELAY_MS = 500;
const VISIBLE_GRIP_PX = 80;
const ISOLATED_EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'contextmenu', 'change', 'input'];

const SHELL = `<style>${STYLES}</style>
<section class="panel">
  <header class="bar" data-drag>
    <strong>Baiak Loot Planner</strong>
    <div class="actions">
      <button class="ghost" data-action="read-party" title="Lê o bônus de loot da party e os charms equipados">Ler party e charms</button>
      <button class="ghost" data-action="options" title="Dados de uso anônimos: o que é enviado e como desligar">Dados</button>
      <button class="ghost" data-action="toggle" title="Recolher ou expandir">▾</button>
    </div>
  </header>
  <div class="consent"></div>
  <nav class="tabs"></nav>
  <div class="planner"></div>
  <div class="body"></div>
</section>`;

const TABS = [
  { id: 'welcome', label: 'Início' },
  { id: 'drops', label: 'Drops' },
  { id: 'bestiary', label: 'Bestiário' },
  { id: 'codex', label: 'Codex' },
  { id: 'charms', label: 'Charms' },
  { id: 'sample', label: 'Amostra' },
];

export const defaultUi = () => ({ x: null, y: null, collapsed: false, sort: DEFAULT_SORT, tab: 'welcome', codexSection: 'hunt', plannedHunt: null, charmObjective: 'profit' });

const PLANNER_TABS = new Set(['drops', 'codex', 'bestiary', 'sample']);

const CONSENT_PROMPT = `<span>Os dados de uso anônimos vêm ligados: a cada 10 minutos, a extensão envia um resumo das suas hunts, sem nomes e sem IP, para calibrar o modelo de loot e de charms. Dá para desligar aqui ou no botão Dados.</span>
  <button class="ghost" data-action="options">Ver o que é enviado</button>
  <button class="ghost" data-action="consent-off">Desligar</button>
  <button class="ghost" data-action="consent-keep">Ok</button>`;

export const mountOverlay = ({ doc, dataset, iconUrl, ui: stored, saveUi, actions = {}, consentPrompt = false }) => {
  let ui = { ...defaultUi(), ...stored };
  let app = null;
  let timer = null;
  let notice = null;
  let busy = false;

  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  setHtml(shadow, SHELL);
  ISOLATED_EVENTS.forEach((type) => host.addEventListener(type, (event) => event.stopPropagation()));

  const panel = shadow.querySelector('.panel');
  const body = shadow.querySelector('.body');
  const consent = shadow.querySelector('.consent');
  const track = actions.track ?? (() => {});
  const setConsentPrompt = (visible) => setHtml(consent, visible ? CONSENT_PROMPT : '');
  setConsentPrompt(consentPrompt);
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
    patchHtml(tabsNav, TABS.map(({ id, label }) => `<button class="tab${id === ui.tab ? ' active' : ''}" data-tab="${id}">${label}</button>`).join(''));
  };

  const planner = shadow.querySelector('.planner');
  let plannerHtml = null;

  const party = () => app.party?.members ?? null;
  const quantities = () => measuredQuantities(app.dropLog);
  const skipped = () => skippedItems(app.lootConfig);

  const dropsOf = (plan) => (plan.mode === 'saved' || plan.mode === 'perKill'
    ? plannedDropsTable({ dataset, hunt: plan.hunt, saved: plan.mode === 'saved' ? plan.saved : null, party: party(), charmSlots: app.charmSlots, quantities: quantities(), skipped: skipped() })
    : dropsTable({ dataset, window: plan.live, party: party(), charmSlots: app.charmSlots, quantities: quantities(), skipped: skipped() }));

  let sectionCache = null;

  const cachedSection = (section, hunt) => {
    const key = { codex: app.codex, section, hunt: hunt?.id ?? null };
    const fresh = sectionCache && sectionCache.key.codex === key.codex && sectionCache.key.section === key.section && sectionCache.key.hunt === key.hunt;
    if (!fresh) sectionCache = { key, value: codexSection({ dataset, section, codex: app.codex, hunt }) };
    return sectionCache.value;
  };

  const huntCodex = (plan) => {
    const drops = dropsOf(plan);
    const rows = drops.unit === 'hour' ? drops.rows : [];
    const others = cachedSection('hunt', plan.hunt);
    if (!plan.hunt) return renderCodexSection(others, dataset.rarities);
    const detail = renderCodex(codexTable({ dataset, hunt: plan.hunt, rows, codex: app.codex }), { warnUnread: false });
    return `${app.codex ? '' : UNREAD_CODEX}<div class="split">
      <section class="pane major">${detail}</section>
      <section class="pane minor">${renderCodexSection(others, dataset.rarities, { warnUnread: false })}</section>
    </div>`;
  };

  const views = {
    drops: (plan) => renderBody({
      table: dropsOf(plan),
      window: plan.live, sort: ui.sort, iconUrl, dataVersion: dataset.version, notice, measuring: plan.measuring,
    }),
    codex: (plan) => {
      const section = ui.codexSection;
      const content = section === 'hunt'
        ? huntCodex(plan)
        : renderCodexSection(cachedSection(section, plan.hunt), dataset.rarities);
      return renderCodexNav(section) + content;
    },
    charms: (plan) => renderCharms(charmTable({
      dataset,
      window: plan.live,
      party: party(),
      charmSlots: app.charmSlots,
      charmStats: app.charmStats,
      procs: app.procs ?? null,
      combat: app.combat ?? null,
      bestiary: app.session.last?.bestiary ?? null,
      quantities: quantities(),
      skipped: skipped(),
      xp: app.xp ?? 0,
      objective: ui.charmObjective,
    }), ui.charmObjective),
    bestiary: (plan) => renderBestiary(bestiaryTable({
      dataset,
      hunt: plan.hunt,
      killsByMonster: plan.hunt ? planKillRates(plan) : null,
      counts: app.bestiary ?? app.session.last?.bestiary ?? null,
      mode: plan.mode,
      saved: plan.saved,
    })),
    welcome: (plan) => renderWelcome({ checklist: welcomeChecklist({ dataset, app, plan }) }),
    sample: (plan) => renderSample(sampleTable({ dataset, hunt: plan.hunt, log: app.dropLog, skipped: skipped() })),
  };

  const renderPlanner = (plan) => {
    const liveHunt = dataset.hunts.find((hunt) => hunt.id === plan.live.huntId) ?? null;
    const html = PLANNER_TABS.has(ui.tab) ? renderHuntPicker({ hunts: dataset.hunts, selected: ui.plannedHunt, liveHunt }) : '';
    if (html === plannerHtml) return;
    plannerHtml = html;
    setHtml(planner, html);
  };

  const render = () => {
    if (!app) return;
    const plan = planFor({ dataset, app, plannedHunt: ui.plannedHunt });
    renderTabs();
    renderPlanner(plan);
    panel.classList.toggle('fill', (ui.tab === 'codex' && ui.codexSection === 'hunt' && Boolean(plan.hunt)) || ui.tab === 'charms');
    patchHtml(body, (views[ui.tab] ?? views.drops)(plan));
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
    'read-party': () => {
      track({ type: 'readParty' });
      return readParty();
    },
    options: () => {
      setConsentPrompt(false);
      return actions.openOptions?.();
    },
    'consent-keep': () => {
      setConsentPrompt(false);
      return actions.keepConsent?.();
    },
    'consent-off': () => {
      setConsentPrompt(false);
      return actions.declineConsent?.();
    },
  };

  const onActivate = (event) => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) {
      track({ type: 'tab', tab });
      updateUi({ tab });
      render();
      return;
    }
    const codexSectionId = event.target.closest('[data-codex]')?.dataset.codex;
    if (codexSectionId) {
      updateUi({ codexSection: codexSectionId });
      render();
      return;
    }
    const objective = event.target.closest('[data-objective]')?.dataset.objective;
    if (objective) {
      track({ type: 'objective' });
      updateUi({ charmObjective: objective });
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
  shadow.addEventListener('change', (event) => {
    if (!event.target.matches('[data-hunt]')) return;
    track({ type: 'planner' });
    updateUi({ plannedHunt: event.target.value || null });
    render();
  });
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

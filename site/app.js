import {
  huntLoot, groupByItem, totals, monsterBreakdown, bestiaryPlan, codexPlan, hoursFor, evenSplit, isCurrency, creatures,
} from '../src/model.js';
import {
  charmPlan, currentDamage, measuredCharms, partyAvgHit, calibrate,
} from '../src/charms.js';
import { decodePayload, inputsFromPayload, mergeParty } from '../src/payload.js';

const dataset = JSON.parse(document.getElementById('game-data').textContent);
const collectorSource = document.getElementById('collector-source').textContent.trim();
const example = JSON.parse(document.getElementById('example-data').textContent);
const itemImages = JSON.parse(document.getElementById('item-images').textContent);
const IMAGE_ORIGIN = 'https://baiakidle.com/api/things/object';

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (x, digits = 2) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: x < 0.0001 ? 3 : digits })}%`;
const signedPct = (x) => `+${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = (s) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const monsterName = (key) => dataset.monsters[key]?.name ?? key;
const charmName = (key) => dataset.charms.find((c) => c.key === key)?.name ?? key;

const imageSource = (id) => (itemImages[id] ? `data:image/png;base64,${itemImages[id]}` : `${IMAGE_ORIGIN}/${id}.png?v=4`);
const itemIcon = (name) => {
  const id = dataset.itemIds?.[name.toLowerCase()];
  return id ? `<img class="item-icon" src="${imageSource(id)}" alt="" width="32" height="32" loading="lazy">` : '<span class="item-icon"></span>';
};
const itemLabel = (name) => `<span class="item">${itemIcon(name)}${esc(title(name))}</span>`;

document.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains('item-icon')) event.target.replaceWith(Object.assign(document.createElement('span'), { className: 'item-icon' }));
}, true);

const duration = (hours) => {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 1 / 60) return '< 1 min';
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} min`;
  if (hours < 48) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}`;
  return `${nf1.format(hours / 24)} dias`;
};

const huntById = (id) => dataset.hunts.find((h) => h.id === id);

const initialState = () => ({
  source: 'example',
  sourceNote: example.note,
  huntId: example.huntId,
  killsByMonster: example.killsByMonster,
  roomsPerHour: example.roomsPerHour,
  party: example.party,
  owned: example.owned,
  assigned: example.assigned,
  bossRollsLoot: true,
  bestiary: example.bestiary,
  codex: example.codex,
  charmStats: null,
  observed: example.observed,
  tab: 'charms',
  sort: { key: 'value', dir: -1 },
  filter: '',
  message: null,
});

let state = initialState();
const setState = (patch) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  render();
};

const hunt = () => huntById(state.huntId);
const lootPcts = () => state.party.map((p) => Number(p.lootPct) || 0);
const totalKills = () => Object.values(state.killsByMonster).reduce((a, b) => a + b, 0);

const model = () => {
  const h = hunt();
  const common = {
    dataset, hunt: h, killsByMonster: state.killsByMonster, roomsPerHour: state.roomsPerHour,
    lootPcts: lootPcts(), bossRollsLoot: state.bossRollsLoot,
  };
  const measured = measuredCharms({ ...common, charmStats: state.charmStats, assigned: state.assigned });
  const fallbackHit = partyAvgHit(measured);
  const calibration = calibrate({ ...common, party: state.party, measured, assigned: state.assigned, fallbackHit, source: `sua coleta em ${h.name}` });
  const plan = charmPlan({ ...common, party: state.party, owned: state.owned, bestiary: state.bestiary, fallbackHit, calibration });
  const rows = huntLoot({ ...common, charms: plan.loot.charms });
  const items = groupByItem(rows);
  const noCharms = totals(huntLoot(common)).total;
  const currentLoot = { gut: state.assigned.gut, scavenge: state.assigned.scavenge };
  const knowsMajors = Object.keys(state.assigned).some((key) => dataset.charms.find((c) => c.key === key)?.category === 'major');
  const current = Object.keys(state.assigned).length
    ? {
      loot: totals(huntLoot({ ...common, charms: currentLoot })).total,
      damage: knowsMajors ? currentDamage({ ...common, party: state.party, assigned: state.assigned, fallbackHit, calibration }) : null,
    }
    : null;
  return { common, plan, rows, items, totals: totals(rows), noCharms, current, measured, calibration, fallbackHit };
};

const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

const huntOptions = () => {
  const group = (avail, label) => `<optgroup label="${label}">${dataset.hunts
    .filter((h) => h.avail === avail)
    .map((h) => option(h.id, `${h.name} · lvl ${h.minLevel}+`, h.id === state.huntId))
    .join('')}</optgroup>`;
  return group('on', 'Disponíveis') + group('test', 'Em teste');
};

const charmRow = (charm) => `
  <label class="charm-row"><span>${esc(charm.name)}</span>
    <select data-owned="${esc(charm.key)}" aria-label="${esc(charm.name)}">
      ${option(0, '—', !state.owned[charm.key])}${[1, 2, 3].map((t) => option(t, `T${t}`, state.owned[charm.key] === t)).join('')}
    </select></label>`;

const memberFields = [
  ['lootPct', 'Loot %', '0.1'],
  ['level', 'Level', '1'],
  ['critChance', 'Crítico %', '0.1'],
  ['critDmg', 'Dano crít. %', '1'],
  ['avgHit', 'Golpe médio', '10'],
  ['avatarUptime', 'Avatar % do tempo', '1'],
];

const renderControls = () => {
  const h = hunt();
  const byCategory = (category) => dataset.charms.filter((c) => c.category === category).map(charmRow).join('');
  document.getElementById('controls').innerHTML = `
    <section class="panel">
      <h2>Seus dados</h2>
      <p class="hint">Rode o coletor no console do jogo durante a hunt e cole aqui o código que ele gerar.</p>
      <ol class="steps">
        <li>No jogo, abra o console (F12 → Console) e cole o script.</li>
        <li>Deixe a hunt rodar 15 min ou mais.</li>
        <li>Rode <code>blp.report()</code> e cole o código abaixo.</li>
      </ol>
      <div class="row-actions">
        <button type="button" class="ghost" data-action="copy-collector">Copiar script do coletor</button>
      </div>
      <textarea id="payload-input" rows="3" placeholder="BLP1.…" spellcheck="false"></textarea>
      <div class="row-actions">
        <button type="button" data-action="apply-code">Aplicar código</button>
        <button type="button" class="ghost" data-action="reset">Voltar ao exemplo</button>
      </div>
      <p class="status" id="status" role="status"></p>
    </section>

    <section class="panel">
      <h2>Hunt</h2>
      <label class="field"><span>Hunt</span><select id="hunt">${huntOptions()}</select></label>
      <div class="grid2">
        <label class="field"><span>Kills/h (total)</span><input id="kills-total" type="number" min="0" step="10" value="${Math.round(totalKills())}"></label>
        <label class="field"><span>Salas/h</span><input id="rooms" type="number" min="0" step="0.1" value="${nf1.format(state.roomsPerHour).replace(',', '.')}"></label>
      </div>
      <div class="monster-kills">
        ${h.monsters.map((k) => `
          <label class="field inline"><span>${esc(monsterName(k))}${k === h.bossKey ? ' <em>boss</em>' : ''}</span>
            <input type="number" min="0" step="1" data-kills="${esc(k)}" value="${Math.round(state.killsByMonster[k] ?? 0)}"></label>`).join('')}
      </div>
      <label class="check"><input type="checkbox" id="boss-loot"${state.bossRollsLoot ? ' checked' : ''}> O boss da sala rola a tabela normal</label>
    </section>

    <section class="panel">
      <h2>Party</h2>
      <div class="party">
        ${state.party.map((p, i) => `
          <div class="member">
            <input class="member-name" data-party="${i}" data-field="name" value="${esc(p.name ?? `Personagem ${i + 1}`)}" aria-label="Nome">
            ${memberFields.map(([field, label, step]) => `
              <label class="field inline"><span>${label}</span><input type="number" step="${step}" data-party="${i}" data-field="${field}" value="${p[field] ?? 0}"${field === 'avgHit' && !(p.avgHit > 0) ? ' placeholder="estimado"' : ''}></label>`).join('')}
          </div>`).join('')}
      </div>
      <p class="hint">Golpe médio vazio usa os procs medidos dos seus charms ou, sem eles, uma estimativa pelo level. "Avatar % do tempo" é quanto tempo o personagem passa na forma avatar (todo golpe crita); o coletor mede pelo contador de procs.</p>
    </section>

    <section class="panel">
      <h2>Seus charms</h2>
      <p class="hint">Uma criatura pode ter um major e um minor. Cada charm vai para uma criatura só.</p>
      <h4>Majors</h4><div class="charm-grid">${byCategory('major')}</div>
      <h4>Minors</h4><div class="charm-grid">${byCategory('minor')}</div>
    </section>`;
  const status = document.getElementById('status');
  status.textContent = state.message?.text ?? (state.source === 'example' ? state.sourceNote : '');
  status.className = `status ${state.message?.kind ?? ''}`;
};

const minorLabel = (minor) => {
  if (!minor) return '<span class="muted">livre</span>';
  if (minor.kind === 'loot') return `${esc(charmName(minor.charm))}`;
  return `${esc(charmName(minor.charm))} <span class="gain-tag">${signedPct(minor.creatureGain)}</span>`;
};

const unlockHint = (plan) => {
  const best = plan.rows.filter((r) => r.locked?.huntGain > 0).sort((a, b) => b.locked.huntGain - a.locked.huntGain)[0];
  return best
    ? `<p class="gain muted">Completar o bestiário de ${esc(best.name)} (${duration(best.locked.hours)}) libera ${esc(charmName(best.locked.charm))}: ${signedPct(best.locked.huntGain)} de dano na hunt.</p>`
    : '';
};

const summary = (m) => {
  const h = hunt();
  const itemsShare = m.totals.total ? m.totals.items / m.totals.total : 0;
  const lootDelta = m.current ? m.totals.total - m.current.loot : null;
  const damageDelta = m.current?.damage != null ? m.plan.damageTotal - m.current.damage : null;
  return `
    <section class="summary">
      <div class="headline">
        <p class="eyebrow">${esc(h.name)} · ${nf.format(totalKills())} kills/h · ${nf1.format(state.roomsPerHour)} salas/h</p>
        <p class="big"><span class="num">${compact.format(m.totals.total)}</span> <span class="unit">gold/h esperado</span></p>
        <div class="split" aria-label="Divisão entre moedas e itens">
          <span class="coins" style="flex:${1 - itemsShare}"></span><span class="items" style="flex:${itemsShare}"></span>
        </div>
        <p class="legend"><span class="dot coins"></span> Moedas ${compact.format(m.totals.currency)} <span class="dot items"></span> Itens ${compact.format(m.totals.items)}</p>
      </div>
      <div class="reco">
        <p class="eyebrow">Plano de charms</p>
        <ul class="plan-list">${m.plan.rows.map((r) => `
          <li><span class="who">${esc(r.name)}${r.boss ? ' <em>+ boss</em>' : ''}</span>
            <span class="what">${r.major ? esc(charmName(r.major.charm)) : `<span class="locked">${r.locked ? 'major bloqueado' : '—'}</span>`} · ${r.minor ? esc(charmName(r.minor.charm)) : '<span class="muted">livre</span>'}</span></li>`).join('')}
        </ul>
        ${unlockHint(m.plan)}
        <p class="gain">+${compact.format(m.plan.loot.gain)}/h de loot · ${signedPct(m.plan.damageTotal)} de dano na hunt${m.current ? ` · vs. atual: ${lootDelta > 1 ? `+${compact.format(lootDelta)}/h` : 'mesmo loot'}${damageDelta == null ? '' : `, ${damageDelta > 0.0005 ? signedPct(damageDelta) : 'mesmo dano'}`}` : ''}</p>
      </div>
    </section>`;
};

const tabs = (m) => {
  const list = [['charms', 'Charms'], ['drops', 'Drops/h'], ['codex', 'Codex'], ['bestiary', 'Bestiário'], ...(state.observed ? [['calibration', 'Calibração']] : [])];
  const bodies = { charms: charmsTab, drops: dropsTab, codex: codexTab, bestiary: bestiaryTab, calibration: calibrationTab };
  return `<nav class="tabs" role="tablist">${list.map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${label}</button>`).join('')}</nav>
    <div class="tab-body">${bodies[state.tab](m)}</div>`;
};

const currentOn = (monster, category) => Object.entries(state.assigned)
  .filter(([key, a]) => a.monster === monster && dataset.charms.find((c) => c.key === key)?.category === category)
  .map(([key]) => charmName(key))
  .join(', ') || '—';

const majorCell = (r) => {
  if (r.major) return esc(charmName(r.major.charm));
  if (!r.locked) return '<span class="muted">sem major de dano</span>';
  const unlock = r.locked.charm ? ` · depois: ${esc(charmName(r.locked.charm))}` : '';
  return `<span class="pill warn">bestiário ${nf.format(r.locked.have)}/${nf.format(r.locked.goal)}</span>
    <small class="muted locked-hint">faltam ${duration(r.locked.hours)}${unlock}</small>`;
};

const heat = (value, max) => `style="--heat:${max > 0 ? Math.min(1, value / max).toFixed(3) : 0}"`;

const charmsTab = (m) => {
  const { plan } = m;
  const keys = creatures(hunt());
  const chosen = new Set(plan.rows.filter((r) => r.major).map((r) => `${r.major.charm}|${r.monster}`));
  const lockedKeys = new Set(plan.rows.filter((r) => r.locked).map((r) => r.monster));
  const maxGain = Math.max(0, ...plan.majors.flatMap((c) => keys.map((k) => c.perCreature[k])));
  return `
    <h3>Plano por criatura</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Criatura</th><th class="n">HP na hunt</th><th>Major</th><th class="n">Dano na criatura</th><th>Minor</th><th>Atual (major · minor)</th></tr></thead>
      <tbody>${plan.rows.map((r) => `
        <tr>
          <td>${esc(r.name)}${r.boss ? ' <span class="pill">+ boss</span>' : ''}</td>
          <td class="n">${pct(r.weight, 0)}</td>
          <td>${majorCell(r)}</td>
          <td class="n">${r.major ? signedPct(r.major.creatureGain) : r.locked?.huntGain ? `<span class="muted">${signedPct(r.locked.huntGain / r.weight)}</span>` : '—'}</td>
          <td>${minorLabel(r.minor)}</td>
          <td class="muted">${esc(currentOn(r.monster, 'major'))} · ${esc(currentOn(r.monster, 'minor'))}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">"HP na hunt" é a parte do HP total que a party tira de cada criatura por hora; o boss da sala entra com ${dataset.bossWave?.hpMult ?? 3}× o HP na criatura dele, então os charms dela também valem nele. Major só entra em criatura com o bestiário completo; nas outras, a coluna de dano mostra quanto ele renderia depois de completar. Gut e Scavenge são escolhidos primeiro pelo loot; a Fatal Hold vai para a criatura que sobrar.${plan.estimatedHit ? ' O golpe médio está estimado; a calibração compensa boa parte disso, mas uma coleta nesta hunt deixa a comparação mais precisa.' : ''}</p>

    ${m.measured.length ? `
    <h3>Seus charms, medidos</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Charm</th><th>Criatura</th><th class="n">Procs/h</th><th class="n">Dano/h</th><th class="n">Dano/proc</th></tr></thead>
      <tbody>${m.measured.map((c) => `
        <tr><td>${esc(c.name)}</td><td>${c.monster ? esc(monsterName(c.monster)) : '—'}</td>
          <td class="n">${c.procsPerHour ? nf.format(c.procsPerHour) : '—'}</td>
          <td class="n">${c.damagePerHour ? compact.format(c.damagePerHour) : '—'}</td>
          <td class="n">${c.perProc && c.damagePerHour ? nf.format(c.perProc) : '—'}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}

    <h3>Majors: dano a mais em cada criatura</h3>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>Charm</th>${keys.map((k) => `<th class="n">${esc(monsterName(k))}${lockedKeys.has(k) ? ' <span class="pill warn">bestiário</span>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${plan.majors.map((c) => `
        <tr><td>${esc(c.name)} <span class="muted">T${c.tier}</span></td>${keys.map((k) => `
          <td class="n heat${chosen.has(`${c.key}|${k}`) ? ' chosen' : ''}" ${heat(c.perCreature[k], maxGain)}>${c.perCreature[k] > 0 ? signedPct(c.perCreature[k]) : '—'}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${keys.length + 1}" class="muted">Marque em "Seus charms" os majors de dano que você tem.</td></tr>`}</tbody>
    </table></div>
    <p class="note">Procs elementais: chance × o menor entre 2× o level e 5% do HP do alvo, descontada a resistência, dividido pelo golpe médio. Savage Blow e Low Blow: ganho no dano esperado com o crítico de cada personagem, contando o tempo na forma avatar. Calibrado com o dano real dos charms (${esc(m.calibration.source ?? 'sem medição')}): procs ×${nf1.format(m.calibration.proc)}, crítico ×${nf1.format(m.calibration.crit)}. Em hunts limitadas pelo spawn, mais dano não aumenta kills/h.</p>

    <h3>Gut e Scavenge</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Gut</th><th>Scavenge</th><th class="n">Total/h</th><th class="n">vs. melhor</th></tr></thead>
      <tbody>${plan.lootPlans.filter((p) => p.gut || p.scavenge).slice(0, 6).map((p, i) => `
        <tr class="${i === 0 ? 'best' : ''}">
          <td>${p.gut ? esc(monsterName(p.gut)) : '—'}</td><td>${p.scavenge ? esc(monsterName(p.scavenge)) : '—'}</td>
          <td class="n">${compact.format(p.total)}</td>
          <td class="n">${i === 0 ? '<span class="pill good">melhor</span>' : `−${compact.format(plan.loot.total - p.total)}`}</td>
        </tr>`).join('')}</tbody>
    </table></div>

    <h3>Valor por criatura</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Criatura</th><th class="n">Kills/h</th><th class="n">Moedas/kill</th><th class="n">Itens/kill</th><th class="n">Moedas/h</th><th class="n">Itens/h</th></tr></thead>
      <tbody>${monsterBreakdown(m.common).map((b) => {
        const kills = Math.max(1e-9, b.lootKills);
        return `<tr><td>${esc(b.name)}</td><td class="n">${nf.format(b.kills)}</td>
          <td class="n">${nf.format(b.currency / kills)}</td><td class="n">${nf.format(b.items / kills)}</td>
          <td class="n">${compact.format(b.currency)}</td><td class="n">${compact.format(b.items)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
};

const sortRows = (rows) => {
  const { key, dir } = state.sort;
  return [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
};

const dropsTab = (m) => {
  const needle = state.filter.trim().toLowerCase();
  const dropped = state.observed?.loot;
  const rows = sortRows(m.items
    .map((r) => ({ ...r, chance: Math.max(...r.sources.map((s) => s.chance)), every: 1 / r.count, dropped: dropped?.[r.item] ?? 0 }))
    .filter((r) => !needle || r.item.includes(needle) || r.sources.some((s) => monsterName(s.monster).toLowerCase().includes(needle))));
  const header = (key, label, numeric = true) => `<th class="${numeric ? 'n ' : ''}sortable" data-sort="${key}" aria-sort="${state.sort.key === key ? (state.sort.dir < 0 ? 'descending' : 'ascending') : 'none'}">${label}</th>`;
  const windowTitle = state.observed?.minutes ? ` title="Nos ${duration(state.observed.minutes / 60)} medidos pelo coletor"` : '';
  const droppedHeader = dropped ? header('dropped', 'Caiu').replace('<th ', `<th${windowTitle} `) : '';
  const droppedCell = (r) => (dropped ? `<td class="n">${r.dropped ? nf.format(r.dropped) : '<span class="muted">0</span>'}</td>` : '');
  return `
    <div class="tools">
      <label class="field grow"><span>Filtrar</span><input id="filter" type="search" value="${esc(state.filter)}" placeholder="item ou criatura"></label>
    </div>
    <div class="table-wrap"><table class="drops">
      <thead><tr>${header('item', 'Item', false)}<th>Criaturas</th>${header('chance', 'Chance/kill')}${header('count', 'Drops/h')}${header('value', 'Valor/h')}${header('every', '1 a cada')}${droppedHeader}</tr></thead>
      <tbody>${rows.map((r) => `
        <tr class="${r.currency ? 'coin' : ''}">
          <td>${itemLabel(r.item)}${r.priced ? '' : ' <span class="pill muted">sem preço</span>'}</td>
          <td class="sources">${r.sources.map((s) => esc(monsterName(s.monster))).join(', ')}</td>
          <td class="n">${pct(r.chance)}</td>
          <td class="n">${r.count >= 10 ? nf.format(r.count) : nf1.format(r.count)}</td>
          <td class="n">${r.value ? compact.format(r.value) : '—'}</td>
          <td class="n">${duration(r.every)}</td>
          ${droppedCell(r)}
        </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Chance/kill é a da tabela, antes dos bônus. Drops/h já inclui a rolagem de cada membro da party, o bônus de loot de cada um e a Gut do plano. As bags (bag you desire, bag you covet e primal bag) são a exceção: rolam uma vez por kill, sem bônus de loot e sem Gut. Itens empilháveis usam a média entre 1 e o máximo; alguns (como poções) vêm um pouco abaixo disso.${dropped ? ` Caiu é o que o coletor viu cair${state.observed.minutes ? ` nos ${duration(state.observed.minutes / 60)} medidos` : ''}; a comparação com o previsto fica na aba Calibração.` : ''}</p>`;
};

const codexTab = (m) => {
  const perHour = Object.fromEntries(m.items.map((r) => [r.item, r.count]));
  const plan = codexPlan({ dataset, hunt: hunt(), perHour, progress: state.codex ?? {} });
  if (!plan.length) return '<p class="note">Esta hunt não tem Codex de domínio.</p>';
  const status = (entry) => (entry.complete ? '<span class="pill good">completo</span>' : `<b>${duration(entry.hours)}</b> de hunt`);
  return `
    ${state.codex ? '' : '<p class="note">Sem progresso do Codex: os números abaixo contam do zero. O coletor lê o seu progresso.</p>'}
    ${plan.map((entry) => `
      <h3>Domínio: ${esc(hunt().name)} ${entry.step} <span class="entry-status">${status(entry)}</span></h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th class="n">Tem</th><th class="n">Precisa</th><th class="n">Faltam</th><th class="n">Drops/h</th><th class="n">Tempo</th><th>Progresso</th></tr></thead>
        <tbody>${entry.items.map((i) => `
          <tr class="${i.hours === entry.hours && i.remaining ? 'bottleneck' : ''}">
            <td>${itemLabel(i.item)}</td><td class="n">${nf.format(i.have)}</td><td class="n">${nf.format(i.need)}</td>
            <td class="n">${nf.format(i.remaining)}</td><td class="n">${nf1.format(i.perHour)}</td>
            <td class="n">${i.remaining ? duration(i.hours) : '<span class="pill good">ok</span>'}</td>
            <td><span class="meter"><span style="width:${Math.min(100, (i.have / i.need) * 100)}%"></span></span></td>
          </tr>`).join('')}</tbody>
      </table></div>`).join('')}
    <p class="note">O tempo de cada etapa é o do item mais lento (linha destacada). Cada etapa pede a mesma lista, com 1×, 5× e 15× a quantidade base.</p>`;
};

const bestiaryTab = () => {
  const rows = bestiaryPlan({ dataset, hunt: hunt(), killsByMonster: state.killsByMonster, current: state.bestiary });
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Criatura</th><th class="n">Meta</th><th class="n">Você tem</th><th class="n">Faltam</th><th class="n">Tempo</th><th>Progresso</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr><td>${esc(r.name)}</td><td class="n">${nf.format(r.goal)}</td><td class="n">${nf.format(r.have)}</td><td class="n">${nf.format(r.remaining)}</td>
          <td class="n">${r.remaining ? duration(r.hours) : '<span class="pill good">completo</span>'}</td>
          <td><span class="meter"><span style="width:${Math.min(100, (r.have / r.goal) * 100)}%"></span></span></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">A meta segue a faixa de experiência da criatura (250, 500, 1.000 ou 2.500 kills). As kills do boss da sala contam para a criatura dele.</p>`;
};

const calibrationTab = () => {
  const obs = state.observed;
  const rows = groupByItem(huntLoot({
    dataset, hunt: hunt(), killsByMonster: obs.kills, roomsPerHour: obs.rooms,
    lootPcts: lootPcts(), charms: obs.charms ?? {}, bossRollsLoot: state.bossRollsLoot,
  }));
  const predicted = Object.fromEntries(rows.map((r) => [r.item, r.count]));
  const items = Object.keys(obs.loot).sort((a, b) => obs.loot[b] - obs.loot[a]);
  const tone = (ratio) => (Math.abs(ratio - 1) <= 0.15 ? 'good' : Math.abs(ratio - 1) <= 0.35 ? 'warn' : 'bad');
  return `
    <p class="note">Compara o que caiu na janela medida com o que o modelo prevê para as mesmas kills. Itens raros variam muito em janelas curtas; olhe o conjunto.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th class="n">Caiu</th><th class="n">Previsto</th><th class="n">Razão</th></tr></thead>
      <tbody>${items.map((item) => {
        const ratio = predicted[item] ? obs.loot[item] / predicted[item] : null;
        return `<tr><td>${itemLabel(item)}${isCurrency(item) ? ' <span class="pill muted">moeda</span>' : ''}</td><td class="n">${nf.format(obs.loot[item])}</td>
          <td class="n">${predicted[item] ? nf1.format(predicted[item]) : '—'}</td>
          <td class="n">${ratio ? `<span class="pill ${tone(ratio)}">${nf1.format(ratio * 100)}%</span>` : '—'}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
};

const render = () => {
  const m = model();
  document.getElementById('results').innerHTML = summary(m) + tabs(m);
};

const scaleKills = (total) => {
  const current = totalKills();
  return current > 0
    ? Object.fromEntries(Object.entries(state.killsByMonster).map(([k, v]) => [k, (v / current) * total]))
    : evenSplit(hunt(), total);
};

const applyCode = () => {
  try {
    const inputs = inputsFromPayload(dataset, decodePayload(document.getElementById('payload-input').value));
    state = {
      ...state,
      source: 'code',
      huntId: inputs.huntId,
      killsByMonster: inputs.killsByMonster,
      roomsPerHour: inputs.roomsPerHour,
      party: inputs.party ? mergeParty(state.party, inputs.party) : state.party,
      charmStats: inputs.charmStats,
      owned: inputs.charms?.owned ?? state.owned,
      assigned: inputs.charms?.assigned ?? {},
      bestiary: inputs.bestiary,
      codex: inputs.codex,
      observed: inputs.observedLoot ? {
        loot: inputs.observedLoot,
        kills: inputs.observedKills,
        rooms: (inputs.roomsPerHour * inputs.minutes) / 60,
        minutes: inputs.minutes,
        charms: { gut: inputs.charms?.assigned.gut, scavenge: inputs.charms?.assigned.scavenge },
      } : null,
      message: inputs.minutes < 10
        ? { kind: 'warn', text: `Código aplicado, mas a janela tem só ${nf1.format(inputs.minutes)} min. Com menos de 10 min os números oscilam muito; colete 15 min ou mais.` }
        : { kind: 'ok', text: `Código aplicado: ${nf1.format(inputs.minutes)} min medidos em ${huntById(inputs.huntId).name}.` },
      tab: state.tab === 'calibration' && !inputs.observedLoot ? 'charms' : state.tab,
    };
    renderControls();
    render();
  } catch (error) {
    state = { ...state, message: { kind: 'error', text: error.message } };
    renderControls();
  }
};

const copyCollector = async (button) => {
  const done = await navigator.clipboard.writeText(collectorSource).then(() => true, () => false);
  if (done) {
    button.textContent = 'Script copiado';
    setTimeout(() => { button.textContent = 'Copiar script do coletor'; }, 1800);
    return;
  }
  const area = document.getElementById('payload-input');
  area.value = collectorSource;
  area.select();
  state = { ...state, message: { kind: 'warn', text: 'Não consegui copiar sozinho. O script está selecionado na caixa acima: copie com Ctrl+C.' } };
  renderControls();
  document.getElementById('payload-input').value = collectorSource;
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action],[data-tab],[data-sort]');
  if (!target) return;
  if (target.dataset.tab) setState({ tab: target.dataset.tab });
  if (target.dataset.sort) {
    const key = target.dataset.sort;
    setState((s) => ({ sort: { key, dir: s.sort.key === key ? -s.sort.dir : key === 'item' || key === 'every' ? 1 : -1 } }));
  }
  if (target.dataset.action === 'apply-code') applyCode();
  if (target.dataset.action === 'copy-collector') copyCollector(target);
  if (target.dataset.action === 'reset') { state = initialState(); renderControls(); render(); }
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.id === 'hunt') {
    const h = huntById(el.value);
    state = {
      ...state, huntId: h.id, killsByMonster: evenSplit(h, totalKills() || 1800), bestiary: {}, codex: state.codex, charmStats: null,
      observed: null, source: 'manual', message: null, tab: state.tab === 'calibration' ? 'charms' : state.tab,
    };
    renderControls();
    render();
  }
  if (el.id === 'boss-loot') setState({ bossRollsLoot: el.checked });
  if (el.dataset.owned) {
    const tier = Number(el.value);
    setState((s) => {
      const { [el.dataset.owned]: removed, ...rest } = s.owned;
      return { owned: tier ? { ...rest, [el.dataset.owned]: tier } : rest };
    });
  }
});

const keepFocus = (id, caret) => {
  const again = document.getElementById(id);
  if (!again) return;
  again.focus();
  if (caret != null) again.setSelectionRange(caret, caret);
};

document.addEventListener('input', (event) => {
  const el = event.target;
  const value = Number(el.value);
  if (el.id === 'kills-total' && value >= 0) setState({ killsByMonster: scaleKills(value) });
  if (el.id === 'rooms' && value >= 0) setState({ roomsPerHour: value });
  if (el.dataset.kills && value >= 0) {
    setState((s) => ({ killsByMonster: { ...s.killsByMonster, [el.dataset.kills]: value } }));
    document.getElementById('kills-total').value = Math.round(totalKills());
  }
  if (el.dataset.party) {
    const i = Number(el.dataset.party);
    const field = el.dataset.field;
    setState((s) => ({ party: s.party.map((p, j) => (j === i ? { ...p, [field]: field === 'name' ? el.value : value } : p)) }));
  }
  if (el.id === 'filter') {
    const caret = el.selectionStart;
    setState({ filter: el.value });
    keepFocus('filter', caret);
  }
});

renderControls();
render();

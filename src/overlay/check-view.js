import { escapeHtml } from './view.js';

const VOCATION_SHORT = { sorcerer: 'MS', knight: 'EK', druid: 'ED', paladin: 'RP', monk: 'EM' };

const MARK = { ok: ['good', 'ok'], warn: ['warn', 'atenção'], bad: ['bad', 'errado'] };

const CHARM_REASONS = {
  hunt: 'Charms: entre numa hunt para comparar com o plano.',
  window: 'Charms: cace alguns minutos para o plano ficar pronto.',
  party: 'Charms: use "Ler party e charms".',
  charms: 'Charms: use "Ler party e charms" para ler os equipados.',
};

const pill = (level) => {
  const [kind, label] = MARK[level] ?? MARK.ok;
  return `<span class="pill ${kind}">${label}</span>`;
};

const list = (items) => `<ul class="checks">${items.map(({ level, text }) => `<li>${pill(level)} ${escapeHtml(text)}</li>`).join('')}</ul>`;

const section = (title, items) => (items.length ? `<h4>${escapeHtml(title)}</h4>${list(items)}` : '');

const memberBlock = (member) => `<section class="check">
  <h3>${escapeHtml(member.name)} <small class="dim">${VOCATION_SHORT[member.vocation] ?? member.vocation}</small>${member.level ? ` ${pill(member.level)}` : ''}</h3>
  ${section('Magias', member.spells)}
  ${section('Build', member.build)}
</section>`;

const charmBlock = (charms) => `<section class="check">
  <h3>Charms</h3>
  ${charms.ready ? list(charms.items) : `<p class="status">${escapeHtml(CHARM_REASONS[charms.reason] ?? CHARM_REASONS.hunt)}</p>`}
</section>`;

export const renderCheck = (check) => {
  if (!check.ready) return '<p class="waiting">Entre numa hunt para conferir build, magias e charms.</p>';
  const members = check.members.length
    ? check.members.map(memberBlock).join('')
    : '<p class="warn">Party não lida: use "Ler party e charms".</p>';
  return `<div class="checkview"><p class="status"><b>${escapeHtml(check.hunt.name)}</b> ${pill(check.level)}</p>
    ${members}
    ${charmBlock(check.charms)}
    <p class="foot">Magias: mages usam as duas Ultimate Explosions nos slots 1 e 2; o MS pode usar Death Echo; o ED usa o fork de ice ou earth; e todo mage usa a runa de área (Avalanche, Thunderstorm, Stone Shower ou Great Fireball) que mais rende aqui, pesando o bônus do personagem no elemento e a resistência da sala. Só a rotação contra criaturas conta; o slot exato não aparece no tráfego. Build: lembrete do elemento que mais rende na hunt. Charms: compara com o plano da aba Charms.</p></div>`;
};

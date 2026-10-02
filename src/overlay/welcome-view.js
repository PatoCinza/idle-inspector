import { escapeHtml } from './view.js';
import { formatMinutes, formatClock } from './format.js';
import { MIN_MINUTES } from '../drops.js';
import { isEmptyCombat } from '../combat.js';

const step = (done, label, detail, action = null) => ({ done, label, detail, action });

export const welcomeChecklist = ({ dataset, app, plan }) => {
  const live = plan?.live;
  const hunt = dataset.hunts.find((h) => h.id === live?.huntId) ?? null;
  const members = app?.party?.members ?? [];
  return [
    step(Boolean(app?.session?.last), 'Jogo conectado', app?.session?.last ? 'A extensão está recebendo os dados do jogo.' : 'Abra o jogo nesta aba; os dados chegam na primeira atualização do servidor.'),
    step(Boolean(hunt), 'Hunt identificada', hunt ? hunt.name : 'Entre numa hunt: ela é reconhecida na primeira kill ou sala.'),
    step((live?.minutes ?? 0) >= MIN_MINUTES, `Medição com ${MIN_MINUTES} min`, live?.minutes > 0 ? `${formatMinutes(live.minutes)} medidos.` : 'Os drops/h e o plano de charms aparecem depois de 2 min caçando.'),
    step(members.length > 0, 'Party lida', members.length ? `${members.length} membro(s), lidos às ${formatClock(app.party.readAt)}.` : 'Clique em "Ler party e charms" para trazer o bônus de loot, o crítico e o level de cada membro.', members.length ? null : 'read-party'),
    step(Boolean(app?.charmSlots), 'Charms lidos', app?.charmSlots ? 'Charms equipados e tiers conhecidos.' : 'Chegam ao abrir a janela de Charms do jogo ou pelo botão "Ler party e charms".', app?.charmSlots ? null : 'read-party'),
    step(!isEmptyCombat(app?.combat), 'Combate medido', isEmptyCombat(app?.combat) ? 'O dano de cada golpe chega sozinho pelo log de combate enquanto você caça.' : 'Golpe médio, crítico e dano por criatura medidos.'),
    step(Boolean(app?.codex), 'Codex lido', app?.codex ? 'Progresso do Codex conhecido.' : 'Chega sozinho quando o jogo envia o inventário (ao abrir a mochila, por exemplo).'),
  ];
};

const ACTIONS = { 'read-party': 'Ler party e charms' };

const checklistItem = (item) => `<li class="${item.done ? 'done' : 'todo'}">
  <span class="mark">${item.done ? '✓' : '•'}</span>
  <span><b>${escapeHtml(item.label)}</b> <span class="dim">${escapeHtml(item.detail)}</span>${item.action ? ` <button class="ghost inline" data-action="${item.action}">${ACTIONS[item.action]}</button>` : ''}</span>
</li>`;

export const TABS = [
  {
    id: 'drops',
    name: 'Drops',
    what: 'Quanto cada item rende por hora, de quanto em quanto tempo cai e quanto já caiu na medição.',
    how: 'Cace pelo menos 2 min. Clique nos títulos das colunas para ordenar. Itens marcados como "Não coletar" no Gerenciar loot aparecem como não coletados e ficam fora do valor/h.',
  },
  {
    id: 'bestiary',
    name: 'Bestiário',
    what: 'Quantas kills você tem de cada criatura, quanto falta para completar e em quanto tempo.',
    how: 'O tempo usa o ritmo da medição ao vivo ou o da última medição salva da hunt.',
  },
  {
    id: 'codex',
    name: 'Codex',
    what: 'Horas até cada etapa do Codex de domínio da hunt, e o que falta em bosses e equipamento.',
    how: 'As linhas em destaque pedem um item que a hunt escolhida dropa. A etapa mais lenta define o tempo.',
  },
  {
    id: 'charms',
    name: 'Charms',
    what: 'O melhor major e minor por criatura, com o ganho de cada um, Gut e Scavenge pelo loot e o dano recebido para Parry e Dodge.',
    how: 'Precisa da party e dos charms lidos e de 2 min de medição. Use "Otimizar Lucro/h" ou "Otimizar XP/h" conforme o seu objetivo.',
  },
  {
    id: 'sample',
    name: 'Amostra',
    what: 'Chance e quantidade de cada drop medidas kill a kill, comparadas com a tabela do jogo.',
    how: 'Cresce sozinha enquanto você caça e não zera com o Hunt Analyzer. Com 30 drops de um item, a quantidade medida passa a valer nas outras abas.',
  },
];

const tabCard = (tab) => `<div class="card">
  <h4><button class="ghost inline" data-tab="${tab.id}">${tab.name} →</button></h4>
  <p>${escapeHtml(tab.what)}</p>
  <p class="dim">${escapeHtml(tab.how)}</p>
</div>`;

export const CONTROLS = [
  ['Ler party e charms', 'Abre rapidamente o painel de cada membro e a janela de Charms do jogo para ler level, bônus de loot, crítico e os charms que você tem. Use ao começar e sempre que trocar equipamento ou charms.'],
  ['Dados', 'Mostra o que os dados de uso anônimos enviam e permite desligar ou ligar de novo. Vem ligado, com aviso na primeira vez.'],
  ['▾', 'Recolhe ou expande o painel. Arraste a barra do título para mover; o botão da extensão na barra do navegador traz o painel de volta ao canto.'],
  ['Planejar', 'Nas abas Drops, Bestiário, Codex e Amostra, escolhe outra hunt para ver os números dela sem sair da atual.'],
];

const control = ([name, text]) => `<li><b>${escapeHtml(name)}</b>: ${escapeHtml(text)}</li>`;

export const renderWelcome = ({ checklist }) => {
  const pending = checklist.filter((item) => !item.done).length;
  return `<div class="scroll plans welcome">
    <h3>Bem-vindo ao Baiak Loot Planner</h3>
    <p>Ferramenta de fã para o Baiak Idle. Ela lê o tráfego que o jogo já recebe e calcula, ao vivo, drops e valor por hora, tempo de bestiário e de Codex, e o melhor plano de charms para a hunt. Não joga por você e não muda nada no jogo.</p>
    <h3>Primeiros passos ${pending ? `<span class="status-pill">${pending} pendente(s)</span>` : '<span class="pill good">tudo pronto</span>'}</h3>
    <ul class="checklist">${checklist.map(checklistItem).join('')}</ul>
    <h3>Abas</h3>
    <div class="cards">${TABS.map(tabCard).join('')}</div>
    <h3>Botões e controles</h3>
    <ul class="controls">${CONTROLS.map(control).join('')}</ul>
    <p class="foot">Sem vínculo oficial com o jogo. A medição recomeça quando você zera o Hunt Analyzer ou troca de hunt; cada hunt medida por 2 min ou mais guarda o seu último ritmo de kills.</p>
  </div>`;
};

import { escapeHtml } from '../overlay/view.js';
import { TABS, CONTROLS } from '../overlay/welcome-view.js';
import { downloadPath } from './releases.js';
import { STYLES } from './styles.js';

const FIRST_STEPS = [
  'Com a extensão instalada, abra <a href="https://baiakidle.com/jogar/">baiakidle.com/jogar</a>. O painel aparece sobre o jogo, na aba Início, com uma lista dos primeiros passos.',
  'Entre numa hunt. Ela é reconhecida na primeira kill ou sala.',
  'Clique em <b>Ler party e charms</b> para trazer o level, o bônus de loot, o crítico e os charms de cada membro.',
  'Cace por 2 minutos. Os drops por hora e o plano de charms aparecem sozinhos e se atualizam enquanto você caça.',
  'A medição recomeça quando você zera o Hunt Analyzer ou troca de hunt. Cada hunt medida guarda o seu último ritmo de kills.',
];

const SENT = [
  'Uso da extensão: quantas vezes cada aba e cada botão foram usados.',
  'Hunts medidas: hunt, duração, kills/h por criatura, salas/h e o tempo de cada sala.',
  'Loot que caiu e o previsto pelo modelo, inclusive a quantidade por kill isolada.',
  'Combate: dano causado e recebido por criatura, XP/h, gasto de supplies e os charms equipados com o dano de cada um.',
  'Party sem nomes: vocação, level arredondado para baixo em múltiplos de 50, bônus de loot, crítico e tempo em avatar.',
  'Um identificador aleatório da instalação, sem relação com a sua conta.',
];

const NEVER_SENT = [
  'Nome de personagem, de membros da party, de guild ou de jogadores no chat.',
  'Login, e-mail, IDs de conta ou de personagem.',
  'O seu IP: os dados passam por um relay na Cloudflare que não guarda nem repassa o IP, e o projeto no PostHog descarta IPs.',
];

const list = (items, tag = 'ul') => `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`;

const escapedList = (items) => list(items.map(escapeHtml));

const formatDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const downloadButton = ({ href, label, detail, primary = false }) => (href
  ? `<a class="button${primary ? ' primary' : ''}" href="${href}"><b>${label}</b><small>${detail}</small></a>`
  : `<span class="button disabled"><b>${label}</b><small>${detail}</small></span>`);

const hero = ({ latest, files }) => `<header class="hero">
  <h1>Baiak Loot Planner</h1>
  <p class="lead">Drops e valor por hora, bestiário, Codex e o melhor plano de charms da sua hunt, ao vivo, num painel sobre o Baiak Idle.</p>
  <div class="buttons">
    ${downloadButton({ href: files.firefox && downloadPath(files.firefox), label: 'Baixar para Firefox', detail: files.firefox ? 'Instala com um clique e se atualiza sozinha' : 'Em breve: aguardando a assinatura do Mozilla', primary: true })}
    ${downloadButton({ href: downloadPath(files.chromium), label: 'Baixar para Chrome / Edge / Opera', detail: 'Arquivo .zip, instalação em modo desenvolvedor', primary: !files.firefox })}
  </div>
  <p class="meta">Versão ${escapeHtml(latest.version)}, de ${formatDate(latest.date)}. Ferramenta de fã, gratuita e sem vínculo oficial com o jogo.</p>
</header>`;

const install = ({ files }) => `<section id="instalar">
  <h2>Instalação</h2>
  <div class="grid">
    <div class="card" id="firefox">
      <h3>Firefox</h3>
      ${files.firefox
    ? list([
      'Clique em <b>Baixar para Firefox</b>.',
      'O Firefox pergunta se este site pode instalar extensões: clique em <b>Continuar para a instalação</b> e depois em <b>Adicionar</b>.',
      'Na mesma tela aparece a opção de dados de uso anônimos, já marcada. Desmarque se não quiser enviar.',
      'Pronto. As versões novas chegam sozinhas.',
    ], 'ol')
    : '<p class="dim">A versão para Firefox está sendo assinada pelo Mozilla e aparece aqui em breve, com atualização automática.</p>'}
    </div>
    <div class="card">
      <h3>Chrome, Edge e Opera (inclusive Opera GX e Brave)</h3>
      ${list([
    'Baixe o .zip e descompacte. Guarde a pasta <code>baiak-loot-planner</code> num lugar fixo, porque o navegador lê a extensão dela.',
    'Abra a página de extensões: <code>chrome://extensions</code>, <code>edge://extensions</code> ou <code>opera://extensions</code>. Ligue o <b>Modo do desenvolvedor</b>.',
    'Clique em <b>Carregar sem compactação</b> (no Edge, <b>Carregar sem pacote</b>) e escolha a pasta.',
    'Para atualizar, baixe a versão nova, substitua o conteúdo da pasta e clique em recarregar no card da extensão.',
  ], 'ol')}
      <p class="dim">O navegador pode avisar que há extensões em modo desenvolvedor. É esperado para extensões instaladas assim.</p>
    </div>
  </div>
</section>`;

const tabCard = (tab) => `<div class="card"><h3>${escapeHtml(tab.name)}</h3><p>${escapeHtml(tab.what)}</p><p class="dim">${escapeHtml(tab.how)}</p></div>`;

const control = ([name, text]) => `<b>${escapeHtml(name)}</b>: ${escapeHtml(text)}`;

const tutorial = () => `<section id="como-usar">
  <h2>Como usar</h2>
  ${list(FIRST_STEPS, 'ol')}
  <h2 class="spaced">Abas</h2>
  <div class="grid">${TABS.map(tabCard).join('')}</div>
  <h2 class="spaced">Botões e controles</h2>
  ${list(CONTROLS.map(control))}
</section>`;

const privacy = () => `<section id="dados">
  <h2>Dados de uso anônimos</h2>
  <div class="notice">
    <p>Vêm <b>ligados</b>. A cada 10 minutos, a extensão envia um resumo das suas hunts para calibrar o modelo de loot e de charms. Na primeira vez, o painel avisa e oferece o botão <b>Desligar</b> (no Firefox, a opção aparece na instalação). Dá para mudar a qualquer momento no botão <b>Dados</b> do painel ou nas opções da extensão, e desligar não muda nada no funcionamento.</p>
  </div>
  <div class="grid spaced">
    <div class="card"><h3>O que é enviado</h3>${escapedList(SENT)}</div>
    <div class="card"><h3>O que nunca é enviado</h3>${escapedList(NEVER_SENT)}</div>
  </div>
</section>`;

const planner = () => `<section id="planner">
  <h2>Sem extensão</h2>
  <p>O <a href="/planner/">planner no navegador</a> faz as mesmas contas a partir de um código que você gera no console do jogo, sem instalar nada.</p>
</section>`;

const release = (entry) => `<div class="release"><h3>${escapeHtml(entry.version)} <span>${formatDate(entry.date)}</span></h3>${escapedList(entry.notes)}</div>`;

const changelog = (releases) => `<section id="novidades">
  <h2>Novidades</h2>
  ${releases.map(release).join('')}
</section>`;

export const renderLanding = ({ releases, files }) => {
  const [latest] = releases;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baiak Loot Planner</title>
<meta name="description" content="Extensão de fã para o Baiak Idle: drops por hora, bestiário, Codex e plano de charms ao vivo.">
<style>${STYLES}</style>
</head>
<body>
<nav class="top"><div><strong>Baiak Loot Planner</strong><a href="#instalar">Instalar</a><a href="#como-usar">Como usar</a><a href="#dados">Dados</a><a href="#novidades">Novidades</a><a href="/planner/">Planner</a></div></nav>
<main>
${hero({ latest, files })}
${install({ files })}
${tutorial()}
${privacy()}
${planner()}
${changelog(releases)}
<footer>Ferramenta de fã para o Baiak Idle, sem vínculo oficial com o jogo. Ela só lê o que o jogo já envia ao navegador e não joga por você.</footer>
</main>
</body>
</html>
`;
};

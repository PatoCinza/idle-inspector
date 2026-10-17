import { escapeHtml } from '../overlay/view.js';
import { STYLES } from './styles.js';

export const PRIVACY_UPDATED = '16/10/2026';

const STORED_LOCALLY = [
  'As medições das hunts (kills, salas, loot, supplies e o tempo de cada sala) e o último ritmo de cada hunt.',
  'A amostra de drops por criatura, o combate (dano causado e recebido) e a rotação de magias.',
  'O que o botão Ler party e charms traz da tela: level, bônus, proteções e charms de cada membro.',
  'As barras de experiência lidas ao fim de cada sala, para a aba XP.',
  'As preferências do painel: posição, aba aberta, ordenação e objetivo.',
];

const SENT = [
  'Uso da extensão: quantas vezes cada aba e cada botão foram usados.',
  'Hunts medidas: hunt, duração, kills/h por criatura, salas/h e o tempo de cada sala.',
  'Loot que caiu e o previsto pelo modelo, inclusive a quantidade por kill isolada, por criatura.',
  'Combate: dano causado e recebido por criatura, XP/h, gasto de supplies e os charms equipados com os procs e o dano de cada um.',
  'Party sem nomes: vocação, level, magic level e skills, bônus de loot, Dano de magia, crítico, proficiência da arma e tempo em avatar.',
  'Rotação: dano, casts e golpes de cada magia por vocação, nas ondas e na sala do boss.',
  'A versão da extensão e dos dados do jogo, e um identificador aleatório criado pela extensão para separar as instalações, sem relação com a sua conta.',
];

const NEVER_SENT = [
  'Nome de personagem, de membros da party, de guild ou de jogadores no chat.',
  'Login, e-mail, senha, IDs de conta ou de personagem.',
  'Mensagens do chat, inventário completo ou qualquer página além de baiakidle.com/jogar.',
  'O seu IP.',
];

const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

export const renderPrivacy = () => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacidade · Baiak Loot Planner</title>
<meta name="description" content="Política de privacidade da extensão Baiak Loot Planner.">
<style>${STYLES}</style>
</head>
<body>
<nav class="top"><div><strong>Baiak Loot Planner</strong><a href="/">Início</a><a href="/#instalar">Instalar</a><a href="/#novidades">Novidades</a></div></nav>
<main class="policy">
<h1>Política de privacidade</h1>
<p class="meta">Atualizada em ${PRIVACY_UPDATED}.</p>

<p>Eu fiz o Baiak Loot Planner como ferramenta de fã para o Baiak Idle, sem vínculo oficial com o jogo. A extensão lê o que o jogo já manda para o navegador em baiakidle.com/jogar e mostra as contas num painel sobre o jogo, ela não joga por você e não roda em nenhum outro site.</p>

<h2>O que fica no seu navegador</h2>
<p>Tudo o que a extensão mede fica guardado no armazenamento local da própria extensão, no seu navegador, e só sai dali se você ligar os dados de uso anônimos:</p>
${list(STORED_LOCALLY)}
<p>Desinstalar a extensão apaga esses dados.</p>

<h2>Dados de uso anônimos</h2>
<p>Vêm desligados. Na primeira vez que o painel abre, ele pergunta se você quer ligar, e dá para mudar a qualquer momento no botão Dados do painel ou nas opções da extensão (no Firefox, a permissão de coleta da instalação também precisa estar marcada). Ligar ou não, nada muda no funcionamento.</p>
<p>Ligados, eles servem para calibrar o modelo de loot e de charms e comparar rotações por faixa de level, com as hunts de quem usa a extensão. A cada 10 minutos, ao trocar de medição e ao fechar a aba, a extensão envia um resumo para um relay meu na Cloudflare, que repassa ao PostHog (servidor nos EUA). O relay não guarda nem repassa o seu IP, então o PostHog só vê o endereço da Cloudflare, e o projeto lá descarta IP e localização e não monta perfil de pessoa.</p>

<h3>O que é enviado</h3>
${list(SENT)}

<h3>O que nunca é enviado</h3>
${list(NEVER_SENT)}

<h2>Quem vê e o que eu faço com isso</h2>
<p>Só eu acesso esses dados, e só para melhorar a extensão. Eu não vendo, não compartilho com ninguém, não uso para anúncio e não tento descobrir quem é quem (o identificador da instalação é aleatório e não tem relação com a sua conta do jogo).</p>
<p>Desligar para o envio na hora. O que já foi enviado não tem como ser ligado a você, então não dá para separar e apagar os dados de uma pessoa específica.</p>

<h2>Mudanças</h2>
<p>Se a extensão passar a coletar algo novo, eu atualizo esta página antes, com a data no topo, e conto nas novidades da versão.</p>

<footer>Ferramenta de fã para o Baiak Idle, sem vínculo oficial com o jogo.</footer>
</main>
</body>
</html>
`;

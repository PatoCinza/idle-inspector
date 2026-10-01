# Baiak Loot Planner

Ferramenta de fã para o Baiak Idle. Para cada hunt, ela mostra:

- um plano de charms por criatura (um major e um minor em cada, sem repetir charm);
- quanto cada item rende por hora e de quanto em quanto tempo ele cai;
- quantas horas faltam para cada etapa do Codex de domínio da hunt e para fechar o bestiário.

Sem vínculo oficial com o jogo. Valide com os devs antes de divulgar.

## Como usar

1. Abra `dist/index.html` no navegador, ou a versão publicada.
2. No jogo, abra o console (F12 → Console) e cole o conteúdo de `dist/collector.min.js`. O site tem um botão que copia esse script.
3. Deixe a hunt rodar 15 minutos ou mais e rode `blp.report()`.
4. Cole no site o código `BLP1.…` que aparecer.

A janela de medição acompanha o jogo: quando você zera o Hunt Analyzer (ou o Loot Analyser) ou troca de hunt, o coletor recomeça a contar dali, sem precisar colar de novo. `blp.status()` mostra desde quando está contando.

O coletor só lê o tráfego que o jogo já recebe. Ele mede:

- kills por hora de cada monstro e salas por hora, pelo contador do bestiário;
- o loot que caiu na janela medida;
- level, HP, mana, bônus de loot e crítico de cada personagem, pelo painel de status;
- golpe médio de cada personagem, pelo log de combate;
- tempo na forma avatar de cada personagem, pelo contador de procs (Transcendence);
- dano e procs reais de cada charm atribuído;
- charms que você tem, com tier e criatura atual (o script abre e fecha a janela de Charms);
- progresso do Codex de domínio.

## Extensão (Chrome e Firefox, em desenvolvimento)

Mostra a tabela de drops ao vivo num overlay sobre o jogo, sem colar script no console e sem copiar código. Não envia nada a nenhum servidor: só lê o tráfego que o jogo já recebe. A única interação com a página é o botão "Ler party e charms".

```sh
npm run build:ext   # gera dist/extension/chrome e dist/extension/firefox
```

- Chrome: `chrome://extensions` → modo desenvolvedor → Carregar sem compactação → `dist/extension/chrome`.
- Firefox (128+): `about:debugging#/runtime/this-firefox` → Carregar extensão temporária → `dist/extension/firefox/manifest.json`.

O hook do WebSocket roda no mundo MAIN em `document_start` (`extension/page/hook.js`) e fala com o content script por `window.postMessage`. O estado da janela de medição fica em `storage.local`; ao recarregar a aba, o tempo e o progresso offline não entram na medição.

O que vem direto do tráfego do jogo, sem ler a tela: kills, salas e loot (patches de estado), charms equipados (`charms`), Charm Analyzer (`charmstats`), tempo em avatar (`procstats`, linha Transcendence) e cada golpe da party (`combatlog`: dano, crítico e criatura atingida). O botão "Ler party e charms" ainda lê da tela o level, HP, mana, crítico e bônus de loot de cada membro e as cartas da janela de Charms.

## Experimento A/B (ex.: Adrenaline Burst)

Fica fora do site: é uma ferramenta de linha de comando que compara blocos de hunt com distribuições de charms diferentes.

1. Cole o coletor (v4 ou mais nova) e comece um bloco: `blp.reset('A')`.
2. Deixe rodar 30–45 min sem mexer em nada e rode `blp.report()`. Salve o código num arquivo, por exemplo `experiments/adrenaline.txt` (vários códigos no mesmo arquivo funcionam).
3. Troque os charms, rode `blp.reset('B')` e repita. Alterne A, B, A, B para diluir variações de horário e servidor.
4. Compare:

```sh
npm run compare -- experiments/*.txt
npm run compare -- experiments/*.txt --by signature --break-even 0.6,1.9
```

O coletor registra o horário de cada wave concluída, de cada sala e das kills, o tempo de cada fase medido pelo próprio jogo (o timer da run) e, pelos efeitos visuais que o servidor manda (`fx`), o primeiro ataque da party depois de cada wave e os intervalos em que ninguém ataca por mais de 1,5 s. Esse tempo parado é onde um charm de velocidade como a Adrenaline pode ajudar. A comparação mostra:

- **salas/h pelo tempo de sala**, com intervalo de 95% (a métrica principal, porque tem uma amostra por sala e inclui a troca de sala);
- salas/h pelo timer do jogo, que não depende do relógio do navegador;
- kills/h por bloco e total;
- primeiro golpe na sala nova e depois de cada wave (onde um charm de movimento deve aparecer);
- veredito contra os dois break-evens: o ganho mínimo se a hunt for limitada por movimento e se for limitada por dano.

Salas mais longas que 3× a mediana (morte, pausa, reconexão) são descartadas (`--pause` muda o fator). Se o resultado vier inconclusivo, o script estima quantas salas por grupo faltam.

## Imagens dos itens

`npm run images` baixa os ícones dos itens (`/api/things/object/<id>.png`) para `site/img/items/`, pulando os que já existem. O build embute os que encontrar. Sem eles, o `dist/index.html` carrega do servidor do jogo e a página publicada mostra só o nome, porque ela não pode carregar imagens de fora.

## Desenvolvimento

```sh
npm install
npm test          # modelo, calibração e estatística do A/B
npm run extract   # baixa o cliente do jogo e regenera data/game.json
npm run images    # baixa os ícones dos itens
npm run build     # gera dist/index.html, dist/artifact.html e dist/collector.min.js
```

`npm run extract` precisa de acesso a baiakidle.com. As âncoras usadas para achar cada tabela no bundle estão em `src/extract.js` (`ANCHORS`). Se um deploy do jogo quebrar a extração, é por ali que se começa.

## Estrutura

| Arquivo | Papel |
|---|---|
| `src/extract.js` | Acha e avalia os literais do bundle (monstros, hunts, charms, preços, multiplicadores especiais) |
| `src/model.js` | Modelo de loot em funções puras: drops/h, valor por monstro, planos de Gut/Scavenge, bestiário |
| `src/charms.js` | Plano de charms: majors de dano por criatura, Gut/Scavenge pelo loot, Fatal Hold na criatura que sobra |
| `src/avatar.js` | Tempo em avatar de cada membro a partir do `procstats` |
| `src/combat.js` | Agrega o `combatlog`: dano, golpes e críticos por vocação, dano por criatura |
| `src/payload.js` | Decodifica o código do coletor em entradas do modelo |
| `src/collector.js` | Script de console |
| `src/experiment.js` | Estatística do A/B: tempos de sala, waves, primeiro golpe, intervalos de Welch |
| `scripts/compare.js` | CLI do A/B |
| `scripts/fetch-images.js` | Baixa os ícones dos itens |
| `site/` | Template, estilos e app do site |
| `test/` | Testes com `node:test`, incluindo a calibração com a sessão do Rotten Golem |

## Modelo de loot

Validado com 72 minutos de hunt no Rotten Golem (2.181 kills, party de 3):

- **Itens:** cada membro da party faz o próprio sorteio, com a chance da tabela × (1 + bônus de loot dele) × (1 + Gut). A chance de cada sorteio fica limitada a 100%.
- **Moedas:** um sorteio por kill, sem party, sem bônus de loot e sem Gut. A Scavenge multiplica o valor das moedas daquele monstro.
- **Bags** (bag you desire, bag you covet, primal bag): um sorteio por kill, sem bônus de loot e sem Gut, pela chance da tabela do monstro.
- **Monstros com multiplicador especial** (maggots, darklight, radiant): usa a mesma regra do cliente, com teto de 90% e o excedente virando quantidade.
- **Boss da sala:** conta como kill da criatura dele e, por padrão, rola a mesma tabela. Há uma opção no site para desligar isso.

Na calibração, as moedas bateram em 1,00× e os itens unitários ficaram dentro de 3% do previsto.

## Plano de charms

- Cada criatura recebe no máximo um major e um minor, e cada charm vai para uma criatura só.
- Major só entra em criatura com o bestiário completo. Para as outras, o plano mostra quanto falta, em horas, e quanto dano o major renderia depois de completar. Sem dados de bestiário (sem coleta), nenhuma criatura é bloqueada.
- O peso de cada criatura é o dano que a party causa nela por hora, medido no `combatlog`. Antes de haver combate medido, usa o HP das kills: o boss da sala entra com 3× o HP na criatura dele, então os charms dela também valem no boss.
- Majors de dano são distribuídos para maximizar o dano total da hunt (programação dinâmica sobre criaturas × charms).
  - Procs elementais: chance × min(2× level, 5% do HP) × (1 − resistência) ÷ golpe médio.
  - Crítico: um golpe crítico multiplica o dano por 1,5 + o "Dano crítico" do painel (medido em 01/10 comparando golpes críticos e normais da mesma magia: Druida 2,39× com +88,5%, Mago 3,0× com +153,5%).
  - Savage Blow: soma o valor do charm (44% no tier 3) a esse multiplicador. O ganho é a fração do dano que sai em crítico × valor ÷ multiplicador. A fração do dano em crítico é medida no `combatlog` (a partir de 30 golpes); sem isso, vem do crítico do painel somado ao tempo na forma avatar (15 s em que todo golpe crita, medido pelo `procstats`).
  - Low Blow: chance de crítico a mais fora do avatar, com o mesmo multiplicador.
  - Golpe médio e fração do dano de cada membro vêm do `combatlog`.
  - Fatal Hold: aumenta só o dano que tira os últimos 25% do HP, e o golpe final não passa do HP que resta. O dano a mais é 25% × valor ÷ (1 + valor) do HP, ou 4,2% no tier 3. Nas duas sessões do Bloated Man-Maggot (01/10), o medido ficou 1% e 16% acima do previsto.
  - Carnage: dano da explosão (o menor entre 15% do HP e 6× o level) por kill, ainda sem medição.
  - O modelo é calibrado com o dano real dos charms, com um fator por família: procs, crítico, Fatal Hold e Carnage. O observado é o dano do charm sobre o dano na criatura sem os charms medidos nela. Sem coleta, usa procs ×1,11 (Infernal Demon, 27/09) e 1,0 nas outras: o Savage Blow e a Fatal Hold do Bloated Man-Maggot (01/10) bateram com a fórmula.
- Scavenge: a aba Charms mostra o ouro a mais medido pelo Charm Analyzer ao lado do previsto pelo modelo de loot (moedas da criatura × valor do charm, com o ritmo de kills da janela).
- Minors: Gut e Scavenge primeiro, pelo loot; a Fatal Hold vai para a criatura que sobrar.

## Limitações conhecidas

- **Itens empilháveis** usam a média entre 1 e o máximo. A great spirit potion veio ~22% abaixo disso.
- **Antes de haver combate medido, o golpe médio é estimado** (3,2× o level); a calibração compensa parte do erro.
- **Golpe médio e crítico medidos incluem os procs de charm**, que aparecem no `combatlog` como golpes sem crítico. Isso puxa a fração do dano em crítico um pouco para baixo (os procs são poucos por cento do dano).
- **Procs elementais ainda são multiplicados pelo crítico do painel**, mas no `combatlog` eles nunca critam. O fator de procs (×1,11) foi ajustado com essa suposição e precisa ser medido de novo.
- **Codex:** só o Codex de domínio da hunt. Os de boss e de equipamento ainda não entram.
- **Hunts limitadas pelo spawn** não ganham kills/h com mais dano.

## Próximos passos (v2)

- Charms defensivos (Parry, Dodge) usando o dano recebido. A Adrenaline entra pelo A/B.
- Codex de boss e de equipamento.
- Calibrar a quantidade dos itens empilháveis com mais sessões.

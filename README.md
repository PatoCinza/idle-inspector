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

Mostra a tabela de drops ao vivo num overlay sobre o jogo, sem colar script no console e sem copiar código. Só lê o tráfego que o jogo já recebe e só envia os dados de uso anônimos se você ligar (veja abaixo). A única interação com a página é o botão "Ler party e charms".

```sh
npm run build:ext   # gera dist/extension/chrome e dist/extension/firefox
```

- Chrome: `chrome://extensions` → modo desenvolvedor → Carregar sem compactação → `dist/extension/chrome`.
- Edge, Opera (e Opera GX) e Brave: o mesmo build do Chrome. `edge://extensions` ou `opera://extensions` → Modo de desenvolvedor → Carregar sem compactação (no Edge, "Carregar sem pacote") → `dist/extension/chrome`.
- Firefox (140+; Android 142+): `about:debugging#/runtime/this-firefox` → Carregar extensão temporária → `dist/extension/firefox/manifest.json`.

Lojas (Chrome Web Store e Opera): o ícone está em `extension/icons/` (fonte em `logo.svg`), o ícone de loja e o tile promocional em `store/`, e a política de privacidade é publicada pelo `npm run deploy:web` em `/privacidade/` do site. As screenshots precisam ser tiradas do painel de verdade, no jogo.

Para distribuir: `npm run package:ext` gera em `dist/release/` o pacote do Firefox (para enviar ao AMO como não listado), o zip do Chrome, Edge e Opera (`-chrome-edge-opera.zip`: o mesmo build do Chrome, porque Edge, Opera e Brave são baseados no Chromium; pasta `baiak-loot-planner/` com `COMO-INSTALAR.txt`, para carregar sem compactação) e o código-fonte que o AMO pede, com as instruções de build em `BUILDING.md`. A versão vem do `extension/manifest.json` e tem que ser igual à do `package.json` (um teste confere); suba as duas a cada versão nova com `npm run bump:ext` (patch; `-- minor`, `-- major` ou `-- 1.2.3` para escolher), que também atualiza o `package-lock.json`, porque o AMO não aceita repetir versão e o `app_version` dos eventos separa os builds no PostHog.

### Site (baiak-loot.pages.dev)

O site de download fica no Cloudflare Pages, na mesma conta do relay. `npm run build:web` gera `dist/web/` com a página (instalação, tutorial, dados de uso e novidades), o planner em `/planner/`, o zip do Chrome/Opera, os `.xpi` assinados, o `updates.json` do Firefox e os links curtos `/chrome`, `/edge`, `/opera` e `/firefox`. `npm run deploy:web` gera e publica.

- As novidades ficam em `web/releases.json`; o build falha se a versão mais nova dali não for a do manifest.
- O `.xpi` assinado vai em `web/signed/baiak-loot-planner-<versão>-firefox.xpi`. Sem ele, o botão do Firefox aparece como "em breve". `npm run sign:firefox` faz o envio ao AMO (não listado, com o código-fonte), espera a assinatura e salva o arquivo ali; precisa de `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET`, criadas em https://addons.mozilla.org/developers/addon/api/key/, no ambiente ou num `.env` na raiz do repositório (fora do git), que o script carrega.
- O manifest do Firefox leva `update_url` apontando para `https://baiak-loot.pages.dev/updates.json` (`src/site.js`). Esse endereço fica gravado em cada instalação: não troque o projeto nem o domínio depois de distribuir.

A aba Início, que abre na primeira vez, mostra uma lista dos primeiros passos com o que já está pronto (jogo conectado, hunt identificada, 2 min de medição, party, charms, combate e Codex) e explica cada aba e cada botão.

O hook do WebSocket roda no mundo MAIN em `document_start` (`extension/page/hook.js`) e fala com o content script por `window.postMessage`. O estado da janela de medição fica em `storage.local`; ao recarregar a aba, o tempo e o progresso offline não entram na medição.

Ao abrir o jogo, a medição salva só aparece quando o jogo confirmar que você está na mesma hunt (uma kill das criaturas dela ou uma sala concluída). Treinando ou em outra hunt, o overlay começa vazio. Cada hunt medida por 2 min ou mais guarda o seu último ritmo de kills.

O seletor "Planejar" (abas Drops, Bestiário, Codex e Amostra) escolhe qualquer hunt. No Bestiário, mostra as kills que você já tem de cada criatura dela e o tempo que falta pelo ritmo ao vivo ou pela última medição. Sem medição ao vivo dela, os drops/h usam o último ritmo salvo; se a hunt nunca foi medida, a tabela mostra drops e valor por kill, com as criaturas em proporção igual. No Codex, a hunt escolhida destaca as linhas de Hunts, Bosses e Equipamento cuja etapa atual pede um item que ela dropa. Os bosses do Codex são os bosses de sala; o boss da onda 10/10 rola a tabela da criatura dele e não dropa nada especial.

A aba Amostra guarda, no navegador, cada kill isolada (uma atualização do servidor com uma kill só): quantas kills de cada criatura, quantas vezes cada item caiu e em que quantidade. Ela compara a chance medida com a prevista (intervalo de 95%) e marca quantidade acima do máximo ou item fora da tabela. Com 30 drops ou mais de um item, a quantidade medida substitui a média da tabela nas abas Drops e Charms. A amostra soma todas as sessões e não zera com o Hunt Analyzer.

O que vem direto do tráfego do jogo, sem ler a tela: kills, salas e loot (patches de estado), charms equipados (`charms`), Charm Analyzer (`charmstats`), tempo em avatar (`procstats`, linha Transcendence) cada golpe da party (`combatlog`: dano, crítico e criatura atingida), cada cast de magia de ataque e cada ataque básico (`fx`), as ondas e salas (`notify`) e o progresso do Codex de hunts, bosses e equipamento (inventário). O botão "Ler party e charms" ainda lê da tela o level, HP, mana, crítico, bônus de loot, XP%, proteção por elemento, magic level, Dano de magia e a proficiência da arma de cada membro e as cartas da janela de Charms.

### Aba XP

O XP/h real da equipe e de cada personagem, sem a oscilação do Hunt Analyzer.

- **Real:** a cada sala completa (`notify` `phase`), a extensão lê a barra de experiência de cada membro da party (o tooltip "Faltam X XP para o nível N" e o level), 2,5 s depois, quando o jogo já pagou a XP Stack. XP total = XP do próximo level (curva do Tibia, 50/3 × (L³ − 6L² + 17L − 12), conferida com a XP do painel de status) − o que falta. O XP/h é a XP creditada entre salas ÷ o tempo entre elas: na sessão inteira e nas últimas 10 salas. O nível e a XP vêm da tela porque ficam em campos binários do estado do jogo; o resto vem do tráfego.
- **Ao vivo:** a XP já creditada mais a XP Stack da sala atual (soma dos `fx` `xp` desde a última sala), dividida pela parte de cada um na sessão. A XP Stack só é paga inteira quando o boss cai; quem morre antes leva só uma parte dela, então o ao vivo é o que vocês fazem se o boss cair.
- **Próximo level:** o que falta ÷ o XP/h real das últimas 10 salas (ou da sessão, com menos de 3), atualizado a cada sala.
- **Mortes:** salas que terminaram com o personagem marcado como morto no cartão da party.
- Zerar o Hunt Analyzer ou trocar de hunt recomeça a contagem, como nas outras abas.

### Aba Hunts

Ordena todas as hunts liberadas por XP/h ou por lucro/h (loot − supplies), como o objetivo do plano de charms, e mostra para cada uma o ataque e a defesa que convêm.

- **Ritmo (salas/h):** ao vivo na hunt atual, a última medição nas hunts já caçadas e, nas outras, estimado pela hunt de referência. A referência é a última medição ao vivo com 2 min e 2 salas ou mais; ela guarda o dano da party por segundo (sem resistência, pela mistura de elementos medida no `combatlog`) e o tempo fixo por sala (o tempo da sala menos o tempo de dano). Numa hunt estimada, a sala leva esse tempo fixo (proporcional ao `spawnMs`) mais o HP da sala depois das resistências ÷ o dano da party.
- **XP:** exp base das kills (o boss paga 5× a exp da criatura dele) × o fator de XP da party. O fator é medido (XP creditada pelo jogo ÷ exp base das kills); sem medição, vem do XP% lido de cada membro: o líder recebe 40% da exp e cada outro 30%, cada parte × 0,99 × (1 + XP% do personagem). As fontes de XP de um personagem somam; o total multiplica só a parte dele.
- **Lucro:** loot pelo modelo de drops com o ritmo da hunt, o bônus de loot da party e os charms equipados, menos as supplies/h medidas na hunt (ou as da referência).
- **Ataque:** os dois elementos de menor resistência média na sala (pesada pelo HP de cada criatura) e, no tooltip, a rotação de cada personagem. Mages seguem a rotação padrão (ver Aba Conferir): as duas Ultimate Explosions, o fork do ED, a runa de área que mais rende e o Death Echo opcional do MS. As outras vocações mostram as três melhores magias em área pelo dano médio no level e magic level depois da resistência. Magia de especialização (Death Nova, runas Max…) só entra se o personagem já foi visto usando. O tooltip também diz quanto a mistura de elementos medida rende em relação a pôr todo o dano no melhor elemento.
- **Defesa:** dano dos monstros por elemento (corpo a corpo e magias, `maxAlive` atacando juntos) depois da proteção média da party, comparado com o mesmo cálculo na hunt mais pesada que a party já caçou por 2 min ou mais (as medições salvas por hunt, a referência e a hunt atual). A hunt de referência só calibra o recebido estimado em dano por segundo, então caçar uma hunt leve não faz as pesadas que vocês já fazem parecerem arriscadas. Acima de 1,25× é "atenção", acima de 2× é "arriscada" e vai para o fim da lista. O tooltip mostra o recebido estimado, o elemento que mais pesa contra a sua proteção e a criatura que mais bate (candidata a Parry ou Dodge).
- **Imbuements:** proteção para cada elemento que é 10% ou mais do dano recebido na hunt depois das proteções da party, ordenada pelo quanto a versão Powerful corta do total (físico não tem imbuement de proteção), e dano elemental na arma de knight, paladin e monk quando o elemento rende pelo menos 2% a mais que o físico contra a resistência média da sala. Leech, crítico e skill valem em qualquer hunt e ficam de fora. A tabela de imbuements vem do cliente (`imbuements` no `data/game.json`).
- O `minLevel` das hunts é só o level sugerido pelo jogo (não bloqueia a entrada): aparece em amarelo quando a party está abaixo.

Medido em 16/10 na Wandering Pillar (party de 3, 2 salas, ~300 kills): cada kill manda um `fx` `xp` por personagem; as partes ficaram em 0,396 / 0,297 / 0,297 da exp da criatura depois de tirar o XP% de cada um (46, 32 e 48%), em todas as criaturas, e o boss pagou 2× isso. O XP Stack da sala é a soma do que cada personagem recebeu (`test/fixtures/xp-split-wandering.json`).

### Aba Conferir

Confere, na hunt atual, se magias, build e charms estão certos (`src/check.js`, `src/mage-meta.js`).

- **Magias (MS e ED):** as duas Ultimate Explosions nos slots 1 e 2 (Rage of the Skies e Hell's Core no MS; Wrath of Nature e Eternal Winter no ED). O ED usa Forked Glacier ou Forked Thorns; o MS pode usar Death Echo. A runa é uma das quatro de área boas de mirar (Avalanche, Thunderstorm, Stone Shower, Great Fireball), a que mais rende aqui: dano médio no level e magic level (mais o magic level do elemento), × (1 + dano do elemento) × crítico do elemento × perk de dano base da magia × (1 − resistência da sala menos a penetração). Empate vai para os elementos da vocação (energy/fire no MS, ice/earth no ED). A rotação medida contra criaturas é comparada com isso: falta de Ultimate Explosion ou de fork é erro; runa ou fork que rende 5% ou mais abaixo do melhor, runa fora das quatro, nenhuma runa ou magia fora da rotação é atenção. O tráfego mostra o cast, não o slot.
- **Build:** lembrete de pôr os pontos em dano e magic level do elemento da runa e do fork, com o bônus de dano por elemento lido do painel de status; atenção quando a build não dá dano nesse elemento.
- **Charms:** o plano da aba Charms (no objetivo escolhido lá) contra os charms equipados: um charm fora do lugar é atenção, dois ou mais é erro; os charms de dano equipados rendendo 5% ou mais abaixo do plano é atenção, 15% ou mais é erro.
- Knight, paladin e monk ainda não têm regra de rotação.

### Aba Rotação

Mostra, para cada personagem, quanto cada magia e runa rende por cast, nas ondas e na sala do boss (a onda 10, onde a rotação de alvo único entra). Responde perguntas como "vale usar o Death Echo ou ir direto na Thunderstorm?" com números da sua hunt.

- **Atribuição:** o `combatlog` não diz qual magia causou o dano. O `fx` manda `{t:'cd', slot, words}` a cada cast, e o lote do `combatlog` com o dano daquele cast chega no mesmo instante. O hook junta os dois (`src/rotation.js`): golpe da vocação do slot até 40 ms depois do cast, com o elemento da magia, é dela. O eco do Death Echo chega 2 s depois (`echo.delayMs` da tabela), sem cast novo, e entra na mesma magia. Golpe no instante do `fx` `atk` é ataque básico (a wand do Sorcerer é de morte, por isso fica fora do eco); golpe de outro elemento no instante do cast é proc de charm; o resto vai para "Outros". Magia de knight aceita qualquer elemento, porque a arma soma o dano do elemento dela.
- **Slot e vocação:** magia de uma vocação só ensina qual slot é de quem; runas de várias vocações usam esse mapa ou o primeiro golpe depois do cast.
- **Dano por cast:** média e intervalo de 95% por soma e soma dos quadrados de cada cast, golpes por cast, crítico (taxa e multiplicador medido) e participação no dano do personagem.
- **Comparação com a reserva:** todas as magias de ataque dividem o cooldown global de 2 s, então uma magia de cooldown maior toma o lugar de um cast da magia de reserva (a de cooldown de 2 s mais lançada, em geral uma runa). A aba mostra a diferença por cast com intervalo de Welch, usando só as salas em que as duas foram lançadas, porque o dano por cast depende de quantos alvos estão vivos e muda quando a rotação muda.
- **Medido/esperado:** golpe sem crítico ÷ (fórmula da magia com level e magic level × (1 + Dano de magia) × (1 − resistência da criatura)). As fórmulas vêm do bundle (`data/game.json`, campo `spells`, ajustadas em coeficientes de level e magic level). O nível absoluto passa de 1 (em 04/10, ~1,5 no Sorcerer) porque há multiplicadores fora da fórmula; o que importa é comparar magias do mesmo personagem.
- **Salas por rotação:** cada sala completa guarda o tempo e o dano por magia de cada personagem. Salas com a mesma rotação são agrupadas, e a tabela compara as salas/h de cada grupo com o mais medido.

Medido em 04/10 na Bloated Man-Maggot (11 min de ondas, 7 salas): Death Echo 27k por cast contra 32k da Thunderstorm (empate, −18%, IC −16k a +3k), Forked Glacier empatado com a Avalanche e Executioner's Throw (amp kor) 3,4k por cast abaixo do Berserk (rende menos).

## Dados de uso anônimos (PostHog)

Desligados por padrão (opt-in): nada é enviado até a pessoa ligar. Ligar ou não, nada muda no funcionamento da extensão.

- **Firefox 140+:** a permissão de coleta do navegador (`technicalAndInteraction`, opcional) vem marcada na tela de instalação, mas sozinha não liga nada: o envio precisa dela e do "Ligar" no aviso do overlay ou nas opções. Se ela for desmarcada na instalação, o overlay nem pergunta. Detectada por `permissions.getAll()`. Uma extensão carregada pelo `about:debugging` não passa pela tela de instalação, então a permissão começa desligada (ligue em `about:addons` → Permissões).
- **Chrome e Opera:** na primeira vez que o overlay abre, ele mostra um aviso com "Ver o que é enviado", "Agora não" e "Ligar" (`blp.consentAsked` marca que já perguntou). O envio só acontece com `blp.consent` salvo como ligado.
- O botão "Dados" e a página de opções mostram o que é enviado e desligam ou religam o envio.

Opt-in atende ao AMO, à Chrome Web Store e ao Opera sem depender de como cada loja classifica os campos.

Com o envio ligado, a extensão manda a cada 10 minutos, ao trocar de janela de medição e ao fechar a aba, pelo background, para o relay (`https://blp-vega.gabriel-luis-cinza.workers.dev/v1/punk`), que repassa ao PostHog:

- `blp_usage`: quantas vezes cada aba foi aberta e quantas vezes o seletor "Planejar", o botão "Ler party e charms", o seletor de lucro/XP e a página de opções foram usados.
- `blp_hunt_window`: uma por janela de medição, reenviada quando ela avança. Leva:
  - hunt, duração, kills/h por criatura e salas/h;
  - o tempo de cada sala (`phase`), para o A/B de charms como a Adrenaline Burst;
  - a party sem nomes: vocação, level (exato e a faixa de 50), magic level, bônus de loot, crítico, tempo em avatar, golpes e dano;
  - os charms equipados, cada um com o ganho previsto pelo modelo sem calibração (fração do dano na criatura) ou o dano evitado previsto (Parry e Dodge), e o Charm Analyzer;
  - o loot observado e o previsto pelo modelo, em quantidade por item e em gold/h;
  - XP/h, dano causado e recebido por criatura e gasto do Supply Analyser;
  - a rotação (`rotation`), para ver o que compensa em cada faixa de level: para cada vocação, o level (exato e a faixa de 50, para agrupar), o magic level e as skills, o Dano de magia, o crítico e a proficiência da arma; para cada magia (as 8 de maior dano por período, ondas e sala do boss), casts, dano, soma dos quadrados por cast, golpes, críticos, eco e os golpes sem crítico por criatura; ataque básico e procs; e as últimas 50 salas com casts e dano de cada magia.
- `blp_drop_sample`: o que entrou na aba Amostra desde o último envio, por criatura: kills isoladas e fator de bônus. Vai um registro para cada item da tabela da criatura, inclusive os que não caíram, com drops, quantidades, chance prevista, quantidade média prevista e máximo da tabela; itens fora da tabela vão marcados com `unlisted`.

Cada evento leva um identificador aleatório da instalação (`crypto.randomUUID()`, sem relação com a conta), `$process_person_profile: false` (sem perfil de pessoa) e `$geoip_disable: true`. Nunca vão nomes de personagens, de party ou de guild, login nem IDs do jogo. O envio passa pelo relay (abaixo), que não repassa o IP do jogador; o PostHog vê o IP da Cloudflare, e o projeto descarta IPs (Settings → Project → IP data capture, desligada; mantenha assim). A Cloudflare recebe a conexão, como qualquer servidor, mas o Worker só usa o IP como chave do limite por minuto e não o grava. O conteúdo das bags ainda não é coletado.

### Relay (Cloudflare Worker)

O Firefox no modo rigoroso e os bloqueadores barram `us.i.posthog.com`. O `relay/worker.js` é um Cloudflare Worker gratuito que recebe o lote em `/v1/punk` e repassa para o PostHog. Ele só aceita a chave deste projeto e lotes no formato da extensão (até 500 eventos `blp_*`, com `distinct_id`, `timestamp`, `$process_person_profile: false` e `$geoip_disable: true`), recusa corpo acima de 1 MB e não repassa cabeçalhos do jogador, então o PostHog vê o IP da Cloudflare, não o de quem joga. Um lote com a chave do projeto que for recusado (grande demais ou fora do formato) vira um evento `blp_relay_rejected` com o motivo, o tamanho, os nomes dos eventos, a instalação e a versão. O pior lote possível (todas as criaturas do jogo com amostra pendente, 500 salas na janela e a rotação de cinco vocações com 8 magias por período e 50 salas) fica em torno de 880 KB, e um teste falha se ele passar de 900 KB.

Deploy: `cd relay && npx wrangler login && npx wrangler deploy`. Use o wrangler, não o editor do painel: o limite por IP (binding `PER_IP`, 30 requisições por minuto, no `wrangler.toml`) só se configura por ele. Colado no painel sem o binding, o Worker funciona, mas sem limite. Acima do limite, responde 429 com `Retry-After: 60`, e a extensão reenvia depois. No plano gratuito são 100 mil requisições por dia (zera à 0h UTC); passando disso, o `workers.dev` responde com erro 1027 e a extensão guarda o lote até a cota voltar.

A URL do Worker fica em `POSTHOG.ingestUrl` (`src/posthog.js`). O manifest não pede permissão para esse host: o background envia como `text/plain`, sem preflight, e o Worker responde CORS `*`. Recusas definitivas do relay (400, 403 e 413) descartam o lote e o cursor avança; falha de rede, 429 e 5xx guardam o lote para o próximo envio.

## Experimento A/B (ex.: Adrenaline Burst)

Fica fora do site: é uma ferramenta de linha de comando que compara blocos de hunt com distribuições de charms diferentes.

1. Cole o coletor (v4 ou mais nova) e comece um bloco: `blp.reset('A')`.
2. Deixe rodar 30–45 min sem mexer em nada e rode `blp.report()`. Salve o código num arquivo, por exemplo `experiments/adrenaline.txt` (vários códigos no mesmo arquivo funcionam).
3. Troque os charms, rode `blp.reset('B')` e repita. Alterne A, B, A, B para diluir variações de horário e servidor.
4. Compare:

```sh
npm run compare -- experiments/*.txt
npm run compare -- experiments/*.txt --by signature --break-even 0.6,1.9
npm run compare -- experiments/*.txt --by charm:adrenaline_burst
```

Só conta o charm equipado numa criatura da hunt do bloco, incluindo o boss da sala. Os que estão em criaturas de outras hunts aparecem num aviso e ficam fora da distribuição. Se um charm da hunt muda no meio do bloco, o bloco é dividido em trechos: cada sala vai para a distribuição ativa quando ela começou e terminou, e as que cruzam a troca ficam de fora. Trocas que não duram uma sala inteira são ignoradas. A extensão segue a mesma regra no `phase_charms` do PostHog, e a lista `charms` da janela marca cada charm com `in_hunt`.

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
npm run extract   # baixa o cliente do jogo e regenera data/game.json e data/spells.json
npm run images    # baixa os ícones dos itens
npm run runs      # xp, HP e dano de uma sala completa em cada hunt (--csv para planilha)
npm run build     # gera dist/index.html, dist/artifact.html e dist/collector.min.js
```

`npm run extract` precisa de acesso a baiakidle.com e acha sozinho o arquivo do bundle que tem os dados (hoje `game-*.js`, carregado pelo `main-*.js`). As âncoras usadas para achar cada tabela estão em `src/extract.js` (`ANCHORS`). Se um deploy do jogo quebrar a extração, é por ali que se começa.

Os monstros vêm da tabela final que o próprio cliente monta (base, ajustes por nome, ajustes por chave e multiplicadores de exp das hunts especiais), avaliada no Node a partir das definições do bundle. Por isso o HP, a exp, o dano corpo a corpo e as magias de cada criatura batem com a Cyclopedia; o loot continua sendo o da tabela base, e os multiplicadores de loot das hunts especiais ficam em `lootMultipliers`.

O preço de cada item segue a mesma regra do Loot Analyser do jogo: o `value` do item e, se for zero ou faltar, a primeira tabela de preços que tiver o item, na ordem em que o cliente consulta (`value || tabela1 || tabela2 || …`). Os nomes dessas tabelas são lidos dessa expressão no bundle. Conferido em 16/10: as 1.230 kills da Wandering Pillar dão exatamente o Gold value do Loot Analyser.

## Sala completa

`npm run runs` mostra, por hunt, o que uma sala dá matando tudo: 9 waves de 4, 4, 5, 5, 6, 6, 7, 7 e 8 criaturas (52, em proporção igual ou pelos `weights` da hunt) e o boss sozinho na wave 10, com 3× o HP e 5× a exp (medido; o cliente ainda diz 2,5×). A composição das waves não está no cliente; vem das salas medidas (167 salas na Dark Thais, todas iguais, e as 53 kills por sala da Rotten Golem e da Infernal Demon).

- **xp:** exp base da Cyclopedia, sem a divisão da party e sem o XP% de cada personagem (ver Aba Hunts).
- **dano:** dano bruto por segundo de cada criatura, antes de armadura e resistências: o corpo a corpo a cada 2 s mais cada magia pela chance a cada intervalo (cura fica de fora). `packDps` é o dano com `maxAlive` criaturas atacando juntas; magia em área conta uma vez por alvo atingido.

## Estrutura

| Arquivo | Papel |
|---|---|
| `src/extract.js` | Acha e avalia os literais do bundle (monstros, hunts, charms, preços, multiplicadores especiais) e resolve a tabela final de monstros do cliente |
| `src/model.js` | Modelo de loot em funções puras: drops/h, valor por monstro, planos de Gut/Scavenge, bestiário |
| `src/charms.js` | Plano de charms: majors de dano por criatura, Gut/Scavenge pelo loot, Fatal Hold na criatura que sobra |
| `src/avatar.js` | Tempo em avatar de cada membro a partir do `procstats` |
| `src/defense.js` | Charms defensivos: dano recebido por criatura, Parry e Dodge, supplies por dano recebido |
| `src/telemetry.js`, `src/posthog.js` | Eventos anônimos do PostHog (montagem e envio), consentimento |
| `relay/` | Cloudflare Worker que repassa os eventos para o PostHog |
| `extension/options/` | Página de opções: o que é enviado e o consentimento |
| `src/drop-log.js` | Amostra local de drops: kills isoladas por criatura, chance e quantidade medidas × previstas |
| `src/combat.js` | Agrega o `combatlog`: dano, golpes e críticos por vocação, dano por criatura |
| `src/rotation.js` | Junta cast (`fx`), dano (`combatlog`) e ondas (`notify`): dano por magia e personagem, eco, ataque básico, procs e salas |
| `src/rotation-table.js`, `src/overlay/rotation-view.js` | Aba Rotação: dano por cast, comparação com a reserva, medido/esperado e salas por rotação |
| `src/spells.js` | Tabela de magias: elemento pelas palavras, fórmula em coeficientes de level e magic level |
| `scripts/raw-sampler.js` | Script de console que guarda mensagens cruas do WebSocket, para estudar campos novos |
| `src/payload.js` | Decodifica o código do coletor em entradas do modelo |
| `src/collector.js` | Script de console |
| `src/experiment.js` | Estatística do A/B: tempos de sala, waves, primeiro golpe, intervalos de Welch |
| `scripts/compare.js` | CLI do A/B |
| `scripts/fetch-images.js` | Baixa os ícones dos itens |
| `src/run.js`, `scripts/hunt-runs.js` | Sala completa: xp, HP total e dano por segundo das criaturas e do boss |
| `src/xp-tracker.js`, `src/dom/party-xp.js`, `src/overlay/xp-view.js` | Aba XP: barras de experiência a cada sala, XP/h real e ao vivo, tempo para o próximo level |
| `src/recommend.js`, `src/overlay/hunts-view.js` | Aba Hunts: referência medida, ritmo estimado, XP/h e lucro/h por hunt, ataque e defesa |
| `src/check.js`, `src/mage-meta.js`, `src/overlay/check-view.js` | Aba Conferir: rotação padrão de mage, lembrete de build e charms contra o plano |
| `site/` | Template, estilos e app do site |
| `test/` | Testes com `node:test`, incluindo a calibração com as sessões do Rotten Golem e do Infernal Demon |

## Modelo de loot

Validado com 72 minutos de hunt no Rotten Golem (2.181 kills, party de 3) e 15 minutos no Infernal Demon (440 kills, party de 3, kill a kill pelos patches de estado):

- **Itens:** um sorteio por kill para a party toda, com a chance da tabela × a soma de (1 + bônus de loot) de cada membro × (1 + Gut). A chance fica limitada a 100% e o excedente se perde: na Infernal, a terra rod (52,8% na tabela) caiu em todas as kills do Infernal Phantom, sempre 1 unidade.
- **Empilháveis:** quando caem, a quantidade é uniforme entre 1 e o máximo da tabela. Na Infernal, a ultimate health potion nunca veio zerada nem acima do máximo em 171 kills isoladas.
- **Moedas:** um sorteio por kill, sem party, sem bônus de loot e sem Gut. A Scavenge multiplica o valor das moedas daquele monstro.
- **Bags** (bag you desire, bag you covet, primal bag): um sorteio por kill, sem bônus de loot e sem Gut, pela chance da tabela do monstro.
- **Monstros com multiplicador especial** (maggots, darklight, radiant): usa a mesma regra do cliente, com teto de 90% e o excedente virando quantidade.
- **Não coletar (Gerenciar loot):** os itens dessa lista, que chega no estado do jogo, não entram no Loot Analyser. Eles ficam com 0 drops/h, marcados "não coletado", e saem do valor/h, do plano de Gut/Scavenge e da comparação da Amostra. Uma entrada com raridade (`nome#tier`) também tira o item inteiro, porque a raridade das drops não está no modelo.
- **Boss da sala:** conta como kill da criatura dele e, por padrão, rola a mesma tabela. Há uma opção no site para desligar isso.

Na calibração, as moedas bateram em 1,00×, os itens unitários ficaram dentro de 3% do previsto e as poções empilháveis dentro de 1% (great spirit potion no Rotten Golem, ultimate health potion na Infernal).

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
  - O modelo é calibrado com o dano real dos charms, com um fator por família: procs, crítico, Fatal Hold e Carnage. O observado é o dano do charm sobre o dano na criatura sem os charms medidos nela. Sem coleta, usa 1,0 em todas: o Savage Blow e a Fatal Hold do Bloated Man-Maggot (01/10) bateram com a fórmula, e o fator de procs antigo (×1,11) foi descartado porque supunha procs com crítico.
- Scavenge: a aba Charms mostra o ouro a mais medido pelo Charm Analyzer ao lado do previsto pelo modelo de loot (moedas da criatura × valor do charm, com o ritmo de kills da janela).
- Minors: Gut e Scavenge primeiro, pelo loot; a Fatal Hold vai para a criatura que sobrar.
- O plano otimiza **lucro/h** ou **XP/h** (seletor na aba Charms). Dano a mais vira kills a mais, e por isso loot e XP na mesma proporção. Os majors defensivos disputam a vaga com os ofensivos na mesma unidade:
  - **Dano recebido:** o `combatlog` traz cada golpe recebido (`taken`, HP e mana do escudo) por criatura e membro. Se um Parry ou Dodge já está equipado na criatura, o recebido observado é dividido por (1 − chance), porque o golpe evitado nem aparece no log.
  - **Dodge:** evita chance × dano recebido da criatura. Em lucro/h, vale as supplies de cura poupadas: gasto com poções no Supply Analyser ÷ dano recebido, × dano evitado. Em XP/h, não pontua.
  - **Parry:** evita o mesmo que o Dodge e devolve o golpe como dano puro, que entra no log como golpe físico sem crítico do membro atingido. Soma as supplies poupadas e o dano refletido (em loot ou XP).
  - Medido em 01/10 na Infernal Demon (Parry tier 3 no Infernal Phantom, 10 min): 61 procs para 559 golpes recebidos do Phantom e 38 mil de dano refletido, 0,90× o previsto. No mesmo período, o Parry rendeu ~0,2% do dano da hunt; o Savage Blow, ~5%.
  - A XP/h vem dos números de XP de cada kill (`fx`); antes de medir, usa a XP da tabela × kills/h.

## Limitações conhecidas

- **Monstros com multiplicador especial:** a regra do cliente (teto de 90%, excedente em quantidade) é aplicada antes do teto de 100% da party. Essa combinação ainda não foi medida.
- **Antes de haver combate medido, o golpe médio é estimado** (3,2× o level); a calibração compensa parte do erro.
- **Golpe médio e crítico medidos incluem os procs de charm**, que aparecem no `combatlog` como golpes sem crítico. Isso puxa a fração do dano em crítico um pouco para baixo (os procs são poucos por cento do dano).
- **Procs (elementais, Overpower e Overflux) não critam**, como no `combatlog`. Sem o crítico, o fator de procs ainda precisa ser medido: no PostHog, a primeira janela do Bloated Man-Maggot deu 0,65–0,74× o previsto.
- **Codex de boss e de equipamento** mostram só o progresso e o que falta entregar, sem tempo estimado: as lutas de boss não são medidas e a raridade das drops de equipamento não está no modelo.
- **Hunts limitadas pelo spawn** não ganham kills/h com mais dano. O plano supõe hunt limitada por dano, o que favorece os majors ofensivos.
- **Supplies por dano recebido** atribuem todo o gasto com poções ao dano recebido, inclusive a mana gasta em ataque. É um teto para o valor do Dodge e do Parry.
- **Rotação:** o `combatlog` não identifica a magia; a atribuição usa o instante do cast. Se a wand e uma magia de morte do Sorcerer saem no mesmo instante, o golpe da wand entra na magia. Proc de charm do mesmo elemento da magia, no instante do cast, entra na magia. A primeira sala depois de abrir o jogo não entra na tabela de salas, porque o começo dela não foi visto. Perks de proficiência por magia ou elemento aparecem na aba, mas ainda não entram no esperado.
- **Hunts estimadas** supõem o mesmo dano e o mesmo tempo fixo por sala da referência. Não entram armadura dos monstros, quantos alvos cada magia em área pega nem hunts limitadas pelo spawn; quanto mais diferente da referência, menos confiável. A defesa compara pressão de dano, não diz se a party sobrevive; e a proteção é a média da party, sem pesar quem apanha mais.
- **Mortes** ainda não entram: nenhuma morte foi registrada nas sessões medidas, e o formato da mensagem ainda não foi visto.

## Próximos passos (v2)

- Mortes no plano de charms: kills/h e XP perdidos enquanto o membro está fora, e quanto o dano evitado reduz isso. A Adrenaline entra pelo A/B.
- Tempo estimado no Codex de boss (loot do boss × lutas/h) e de equipamento (chance de raridade das drops).
- Conteúdo das bags (o `useitem` enviado e o que volta), quando houver uma para abrir.

Aqui ficam os .xpi assinados pelo AMO. O nome do arquivo não importa: o `npm run build:web` lê a versão do manifest de dentro de cada .xpi, confere o id da extensão e a assinatura do Mozilla, e publica como `/downloads/baiak-loot-planner-<versão>-firefox.xpi`, com o hash no `updates.json` para o Firefox atualizar sozinho.

- `npm run sign:firefox` envia a versão do manifest ao AMO como não listada (com o código-fonte), espera a assinatura e salva o .xpi aqui. Precisa de `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET` (https://addons.mozilla.org/developers/addon/api/key/).
- Se baixar pelo painel do AMO, é só colocar o arquivo aqui.

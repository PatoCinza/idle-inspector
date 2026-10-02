Coloque aqui o .xpi assinado que o AMO devolve, com o nome `baiak-loot-planner-<versão>-firefox.xpi`.

O `npm run build:web` publica cada .xpi desta pasta em `/downloads/` e lista todos no `updates.json`, com o hash, para o Firefox atualizar sozinho. Não apague versões antigas daqui: o hash delas continua no `updates.json`.

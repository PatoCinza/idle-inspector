const api = globalThis.browser ?? globalThis.chrome;

const warnMissingAccess = (tabId) => Promise.all([
  api.action.setBadgeText({ tabId, text: '!' }),
  api.action.setTitle({ tabId, title: 'Sem acesso a baiakidle.com/jogar/. Abra a página do jogo e conceda a permissão do site à extensão.' }),
]);

api.action.onClicked.addListener((tab) => {
  api.tabs.sendMessage(tab.id, { type: 'blp-reveal' }).catch(() => warnMissingAccess(tab.id));
});

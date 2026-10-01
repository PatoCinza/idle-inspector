const named = (members) => members.map((member) => member.name).join(', ');

const missingPanel = (members) => members.filter((member) => !member.level);

export const readSummary = ({ members, cards }) => {
  if (!members.length) return { ok: false, message: 'Não encontrei os botões da party na tela do jogo.' };
  const partial = missingPanel(members);
  const charms = cards === null ? 'janela de Charms não encontrada' : `${cards.length} charms`;
  const base = `Party lida (${named(members)}) · ${charms}.`;
  return partial.length
    ? { ok: false, message: `${base} Painel de status não encontrado para: ${named(partial)}.` }
    : { ok: true, message: base };
};

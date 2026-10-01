const byLowerName = (entries) => Object.fromEntries(entries.map(([name, value]) => [name.toLowerCase(), value]));

export const slotsFromCards = (dataset, cards) => {
  const charmByName = byLowerName(dataset.charms.map((charm) => [charm.name, charm]));
  const monsterByName = byLowerName(Object.entries(dataset.monsters).map(([key, monster]) => [monster.name, key]));
  return Object.fromEntries(cards
    .filter((card) => charmByName[card.name.toLowerCase()])
    .map((card) => {
      const monsterKey = card.creature ? monsterByName[card.creature.toLowerCase()] : undefined;
      return [charmByName[card.name.toLowerCase()].id, { tier: card.tier, ...(monsterKey ? { monsterKey } : {}) }];
    }));
};

import { attackSpells } from './spells.js';

const QUOTES = new Set(['"', "'", '`']);

const skipString = (src, i) => {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
  return j;
};

const CLOSER = { '{': '}', '[': ']' };

export const balancedEnd = (src, start) => {
  const stack = [];
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (QUOTES.has(ch)) { i = skipString(src, i); continue; }
    if (ch === '{' || ch === '[' || ch === '(') stack.push(ch);
    else if (ch === '}' || ch === ']' || ch === ')') {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
};

export const enclosingLiteral = (src, anchor, open) => {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  for (let pos = at; pos >= 0; pos--) {
    if (src[pos] !== open) continue;
    const end = balancedEnd(src, pos);
    if (end > at) return src.slice(pos, end + 1);
  }
  throw new Error(`no enclosing ${CLOSER[open] ? open : '?'} for ${anchor}`);
};

const unknownScope = new Proxy({}, {
  has: () => true,
  get: (_, key) => (key === Symbol.unscopables ? undefined : null),
});

export const evalLiteral = (literal) =>
  new Function('scope', `with (scope) { return (${literal}); }`)(unknownScope);

const literalAt = (src, anchor, open) => evalLiteral(enclosingLiteral(src, anchor, open));

const numberAfter = (src, pattern) => {
  const match = src.match(pattern);
  return match ? Number(match[1]) : null;
};

const ANCHORS = {
  monsters: ['troll:{name:"Troll"', '{'],
  overrides: ['"rotten golem":{hp:', '{'],
  hunts: ['{id:"rottengolem-cave"', '['],
  charms: ['key:"gut"', '['],
  prices: ['"sacred tree amulet":3e3', '{'],
  values: ['"crystal coin":{value:1e4', '{'],
  catalog: ['"ruthless axe":{id:6553', '{'],
  specialGroups: ['"mycobiontic_beetle","bloated_man_maggot"', '['],
  specialAlias: ['mycobiontic_beetle:"bloatedmanmaggot"', '{'],
  specialLoot: ['bloatedmanmaggot:4.65', '{'],
  radiantGroups: ['"radiant_acolyte","radiant_paragon"', '['],
  radiantLoot: ['skyhold:6.46', '{'],
  codexHunts: ['"rottengolem-cave":[{item:', '{'],
  codexSteps: ['{suffix:"I",qty:1}', '['],
  codexBosses: ['{id:"boss-ahau-1",cat:"boss"', '['],
  codexGear: ['{id:"leather",name:"Leather",pieces:', '['],
  rarities: ['{0:"Comum",1:"Incomum"', '{'],
  bossWave: ['boss:{hpMult:', '{'],
  spells: ['words:"exevo mort ora"', '['],
};

const pickMonster = ([key, m], overrides) => {
  const o = overrides[m.name.toLowerCase()] ?? {};
  return [key, {
    name: m.name,
    hp: o.hp ?? m.hp,
    exp: m.exp,
    armor: o.armor ?? m.armor ?? 0,
    resist: o.resist ?? m.resist ?? {},
    loot: m.loot ?? [],
  }];
};

const radiantGroup = (key) => {
  const base = /acolyte|paragon|warden/.test(key) ? 'skyhold' : 'ascendancy';
  return key.startsWith('devoted_') ? `${base}Devoted` : base;
};

const lootMultipliers = (read) => {
  const special = read('specialGroups');
  const alias = read('specialAlias');
  const specialLoot = read('specialLoot');
  const radiant = read('radiantGroups');
  const radiantLoot = read('radiantLoot');
  return Object.fromEntries([
    ...special.map((k) => [k, specialLoot[alias[k] ?? ''] ?? 1]),
    ...radiant.map((k) => [k, radiantLoot[radiantGroup(k)] ?? 1]),
  ]);
};

const catalogIndex = (catalog) => ({
  idOf: (name) => catalog[name]?.id ?? null,
  byId: Object.fromEntries(Object.entries(catalog).filter(([, v]) => v?.id != null).map(([name, v]) => [v.id, name])),
  equipment: Object.keys(catalog).filter((name) => catalog[name]?.slot && catalog[name].slot !== 'ammo'),
});

const codexReq = ({ item, qty, anyOf, tier, minTier, anyTier }) => ({
  item,
  qty,
  ...(anyOf ? { anyOf } : {}),
  ...(tier != null ? { tier } : {}),
  ...(minTier != null ? { minTier } : {}),
  ...(anyTier ? { anyTier: true } : {}),
});

export const bossCodex = (entries) => Object.values(entries.reduce((acc, { id, monster, mname, step, req }) => ({
  ...acc,
  [monster]: {
    monster,
    name: mname,
    steps: [...(acc[monster]?.steps ?? []), { id, step, req: req.map(codexReq) }].sort((a, b) => a.step - b.step),
  },
}), {})).map(({ monster, name, steps }) => ({ monster, name, steps: steps.map(({ id, req }) => ({ id, req })) }));

export const gearCodex = (sets) => sets.map(({ id, name, pieces }) => ({ id, name, pieces }));

const codexItemNames = (bosses, gear) => [
  ...bosses.flatMap((boss) => boss.steps.flatMap((step) => step.req.flatMap((req) => [req.item, ...(req.anyOf ?? [])]))),
  ...gear.flatMap((set) => set.pieces),
];

const huntMonsterKeys = (hunts) => new Set(hunts.flatMap((h) => [...h.monsters, h.bossKey].filter(Boolean)));

const mergePrices = (prices, values, names) => Object.fromEntries(
  [...names]
    .map((name) => [name, values[name]?.value ?? prices[name]])
    .filter(([, price]) => price != null),
);

const normalizeLoot = (byId) => (entry) => ({
  name: entry.name ?? byId[entry.id] ?? `#${entry.id}`,
  chance: entry.chance,
  ...(entry.max != null ? { max: entry.max } : {}),
});

export const extractDataset = (src, { version = null } = {}) => {
  const read = (name) => literalAt(src, ...ANCHORS[name]);
  const catalog = catalogIndex(read('catalog'));
  const overrides = read('overrides');
  const hunts = read('hunts').map(({ id, name, minLevel, monsters, maxAlive, spawnMs, bossKey, avail }) =>
    ({ id, name, minLevel, monsters, maxAlive, spawnMs, bossKey, avail }));
  const wanted = huntMonsterKeys(hunts);
  const monsters = Object.fromEntries(
    Object.entries(read('monsters'))
      .filter(([key]) => wanted.has(key))
      .map((entry) => pickMonster(entry, overrides))
      .map(([key, m]) => [key, { ...m, loot: m.loot.map(normalizeLoot(catalog.byId)) }]),
  );
  const lootNames = new Set(Object.values(monsters).flatMap((m) => m.loot.map((l) => l.name)));
  const codexHunts = read('codexHunts');
  const codexBosses = bossCodex(read('codexBosses'));
  const codexGear = gearCodex(read('codexGear'));
  const itemNames = new Set([
    ...lootNames,
    ...Object.values(codexHunts).flat().map((entry) => entry.item),
    ...codexItemNames(codexBosses, codexGear),
  ]);
  const charms = read('charms').map(({ id, key, name, category, kind, element, chance, desc }) =>
    ({ id, key, name, category, kind, element, chance, desc }));
  return {
    version,
    extractedAt: new Date().toISOString(),
    lootCap: numberAfter(src, /,\w+=([\d.e]+),\w+=\{bloatedmanmaggot:/) ?? 90000,
    lootMultipliers: lootMultipliers(read),
    monsters,
    hunts,
    charms,
    prices: mergePrices(read('prices'), read('values'), lootNames),
    equipment: catalog.equipment.filter((name) => lootNames.has(name)),
    itemIds: Object.fromEntries([...itemNames].map((name) => [name, catalog.idOf(name)]).filter(([, id]) => id != null)),
    codexHunts,
    codexSteps: read('codexSteps'),
    codexBosses,
    codexGear,
    rarities: Object.entries(read('rarities')).sort(([a], [b]) => Number(a) - Number(b)).map(([, name]) => name),
    bossWave: read('bossWave').boss,
    spells: attackSpells(read('spells')),
  };
};

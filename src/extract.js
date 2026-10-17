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

export const expressionEnd = (src, start) => {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (QUOTES.has(ch)) { i = skipString(src, i); continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0 && (ch === ',' || ch === ';')) return i;
  }
  return src.length;
};

const escapeName = (name) => name.replace(/\$/g, '\\$');

const functionSource = (src, at) => {
  const body = balancedEnd(src, src.indexOf('(', at)) + 1;
  return src.slice(at, balancedEnd(src, body) + 1);
};

export const definitionOf = (src, name) => {
  const fn = src.indexOf(`function ${name}(`);
  if (fn >= 0) return functionSource(src, fn);
  const match = new RegExp(`[,;{}\\s](?:const |let |var )?${escapeName(name)}=(?!=)`).exec(src);
  if (!match) return null;
  const start = match.index + match[0].length;
  return src.slice(start, expressionEnd(src, start));
};

export const resolver = (src) => {
  const cache = new Map();
  const scope = new Proxy({}, {
    has: (_, key) => typeof key === 'string',
    get: (_, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in globalThis) return globalThis[key];
      if (!cache.has(key)) {
        cache.set(key, null);
        cache.set(key, evaluate(definitionOf(src, key)));
      }
      return cache.get(key);
    },
  });
  const evaluate = (code) => {
    try {
      return code ? new Function('scope', `with (scope) { return (${code}); }`)(scope) : null;
    } catch {
      return null;
    }
  };
  return evaluate;
};

const numberAfter = (src, pattern) => {
  const match = src.match(pattern);
  return match ? Number(match[1]) : null;
};

const ANCHORS = {
  hunts: ['{id:"rottengolem-cave"', '['],
  charms: ['key:"gut"', '['],
  values: ['"crystal coin":{value:1e4', '{'],
  catalog: ['"ruthless axe":{id:6553', '{'],
  specialGroups: ['"mycobiontic_beetle","bloated_man_maggot","bloodjaw"', '['],
  specialAlias: ['mycobiontic_beetle:"bloatedmanmaggot"', '{'],
  specialLoot: ['bloatedmanmaggot:4.65', '{'],
  radiantGroups: ['"radiant_zealot","devoted_radiant_acolyte"', '['],
  radiantLoot: ['skyhold:6.46', '{'],
  codexHunts: ['"rottengolem-cave":[{item:', '{'],
  codexSteps: ['{suffix:"I",qty:1}', '['],
  codexBosses: ['{id:"boss-ahau-1",cat:"boss"', '['],
  codexGear: ['{id:"leather",name:"Leather",pieces:', '['],
  rarities: ['{0:"Comum",1:"Incomum"', '{'],
  bossWave: ['boss:{hpMult:', '{'],
  spells: ['words:"exevo mort ora"', '['],
  imbuements: ['{key:"vampirism",name:"Vampirism"', '['],
};

const BASE_MONSTERS = /([\w$]+)=\{troll:\{name:"Troll"/;

const finalMonstersName = (src, base) =>
  src.match(new RegExp(`([\\w$]+)=Object\\.fromEntries\\(Object\\.entries\\(${escapeName(base)}\\)\\.map\\(`))?.[1];

export const monsterTables = (src) => {
  const base = src.match(BASE_MONSTERS)?.[1];
  const final = base && finalMonstersName(src, base);
  const resolve = resolver(src);
  const tables = { base: base && resolve(base), final: final && resolve(final) };
  if (!tables.base || !tables.final) throw new Error('tabela de monstros não encontrada no bundle');
  return tables;
};

const pickAbility = ({ element, min, max, chance, interval, radius, length, target }) => ({
  element,
  min,
  max,
  chance,
  ...(interval != null ? { interval } : {}),
  ...(radius != null ? { radius } : {}),
  ...(length != null ? { length } : {}),
  ...(target != null ? { target: Boolean(target) } : {}),
});

const pickMonster = (final) => ([key, base]) => {
  const m = final[key] ?? base;
  return [key, {
    name: m.name,
    hp: m.hp,
    exp: m.exp,
    armor: m.armor ?? 0,
    resist: m.resist ?? {},
    dmg: m.dmg ?? [0, 0],
    abilities: (m.abilities ?? []).map(pickAbility),
    loot: base.loot ?? [],
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

const VALUE_CHAIN = /value:[\w$]+\?\.value\|\|((?:[\w$]+\[[\w$]+\]\|\|)+)0/;

export const priceTables = (src) => {
  const chain = src.match(VALUE_CHAIN)?.[1];
  const resolve = resolver(src);
  const tables = chain ? [...chain.matchAll(/([\w$]+)\[/g)].map(([, name]) => resolve(name)) : [];
  if (!tables.length || tables.some((table) => !table)) throw new Error('tabelas de preço não encontradas no bundle');
  return tables;
};

export const itemValue = (values, tables) => (name) => values[name]?.value || tables.map((table) => table[name]).find(Boolean) || null;

const mergePrices = (valueOf, names) => Object.fromEntries(
  [...names]
    .map((name) => [name, valueOf(name)])
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
  const tables = monsterTables(src);
  const hunts = read('hunts').map(({ id, name, minLevel, monsters, weights, maxAlive, spawnMs, bossKey, avail }) =>
    ({ id, name, minLevel, monsters, ...(weights ? { weights } : {}), maxAlive, spawnMs, bossKey, avail }));
  const wanted = huntMonsterKeys(hunts);
  const monsters = Object.fromEntries(
    Object.entries(tables.base)
      .filter(([key]) => wanted.has(key))
      .map(pickMonster(tables.final))
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
    prices: mergePrices(itemValue(read('values'), priceTables(src)), lootNames),
    equipment: catalog.equipment.filter((name) => lootNames.has(name)),
    itemIds: Object.fromEntries([...itemNames].map((name) => [name, catalog.idOf(name)]).filter(([, id]) => id != null)),
    codexHunts,
    codexSteps: read('codexSteps'),
    codexBosses,
    codexGear,
    rarities: Object.entries(read('rarities')).sort(([a], [b]) => Number(a) - Number(b)).map(([, name]) => name),
    bossWave: read('bossWave').boss,
    spells: attackSpells(read('spells')),
    imbuements: read('imbuements').map(({ key, name, cat, kind, element, skill, values }) => ({ key, name, cat, kind, ...(element ? { element } : {}), ...(skill ? { skill } : {}), values })),
  };
};

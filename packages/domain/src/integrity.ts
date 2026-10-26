import type { Campaign, Id, InventoryItem, RuleOption, Stats } from './types';

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** Unique options (case-insensitive) built from free-text values, with stable ids. */
function optionsFromText(texts: (string | undefined)[], prefix: string): RuleOption[] {
  const byKey = new Map<string, RuleOption>();
  for (const text of texts) {
    const name = (text ?? '').trim();
    const key = name.toLowerCase();
    if (name && !byKey.has(key)) byKey.set(key, { id: `${prefix}:${key}`, name });
  }
  return [...byKey.values()];
}

/**
 * Picks the option a character refers to. While migrating, free text is matched
 * to the options built from it; afterwards, text is kept as-is and only a
 * dangling id is dropped.
 */
function resolveOption(
  options: RuleOption[],
  migrating: boolean,
  id: Id | undefined,
  text: string | undefined,
): { id: Id | undefined; text: string } {
  const free = text ?? '';
  if (migrating) {
    const match = options.find((o) => o.name.toLowerCase() === free.trim().toLowerCase());
    return match ? { id: match.id, text: '' } : { id: undefined, text: free };
  }
  return { id: id && options.some((o) => o.id === id) ? id : undefined, text: free };
}

/** Minimal shape check for data read from untrusted storage. */
export function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    isArray(c.sessions) &&
    isArray(c.quests) &&
    isArray(c.npcs)
  );
}

/**
 * Drops references to records that no longer exist and fills fields added
 * after earlier versions were saved. Campaigns saved before races and classes
 * existed get options created from their characters' free-text values.
 */
export function sanitizeCampaign(raw: Campaign): Campaign {
  const validOptions = (v: unknown): RuleOption[] =>
    Array.isArray(v)
      ? v.filter((o): o is RuleOption => !!o && typeof o.id === 'string' && typeof o.name === 'string')
      : [];

  const statDefinitions = validOptions(raw.statDefinitions);
  const statIds = new Set<Id>(statDefinitions.map((d) => d.id));
  const cleanStats = (stats: unknown): Stats =>
    Object.fromEntries(
      Object.entries(stats && typeof stats === 'object' ? stats : {}).filter(
        ([id, v]) => statIds.has(id) && typeof v === 'number' && Number.isFinite(v),
      ),
    );

  const cleanInventory = (v: unknown): InventoryItem[] =>
    Array.isArray(v)
      ? v.filter(
          (i): i is InventoryItem =>
            !!i &&
            typeof i.id === 'string' &&
            typeof i.name === 'string' &&
            Number.isInteger(i.quantity) &&
            typeof i.notes === 'string',
        )
      : [];

  const rawCharacters = raw.characters ?? [];
  const migrateRaces = !Array.isArray(raw.races);
  const migrateClasses = !Array.isArray(raw.classes);
  const races = migrateRaces ? optionsFromText(rawCharacters.map((p) => p.race), 'race') : validOptions(raw.races);
  const classes = migrateClasses
    ? optionsFromText(rawCharacters.map((p) => p.characterClass), 'class')
    : validOptions(raw.classes);

  const characters = rawCharacters.map((p) => {
    const race = resolveOption(races, migrateRaces, p.raceId, p.race);
    const klass = resolveOption(classes, migrateClasses, p.classId, p.characterClass);
    return {
      ...p,
      stats: cleanStats(p.stats),
      inventory: cleanInventory(p.inventory),
      raceId: race.id,
      race: race.text,
      classId: klass.id,
      characterClass: klass.text,
    };
  });

  const c = {
    ...raw,
    statDefinitions,
    races,
    classes,
    characters,
    npcs: raw.npcs.map((n) => (n.stats ? { ...n, stats: cleanStats(n.stats) } : n)),
  };
  const questIds = new Set<Id>(c.quests.map((q) => q.id));
  const npcIds = new Set<Id>(c.npcs.map((n) => n.id));
  const characterIds = new Set<Id>(c.characters.map((p) => p.id));
  return {
    ...c,
    quests: c.quests.map((q) => ({
      ...q,
      giverNpcId: q.giverNpcId && npcIds.has(q.giverNpcId) ? q.giverNpcId : undefined,
      prerequisiteQuestIds: q.prerequisiteQuestIds.filter((id) => id !== q.id && questIds.has(id)),
    })),
    sessions: c.sessions.map((s) => ({
      ...s,
      questIds: s.questIds.filter((id) => questIds.has(id)),
      npcIds: s.npcIds.filter((id) => npcIds.has(id)),
      characterIds: (s.characterIds ?? []).filter((id) => characterIds.has(id)),
    })),
  };
}

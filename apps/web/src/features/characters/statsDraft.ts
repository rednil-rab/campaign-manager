import type { Id, StatDefinition, Stats } from '@questkeeper/domain';

/** Form state for stat values: strings so number inputs can be edited freely. */
export type StatsDraft = Record<Id, string>;

export const toDraft = (stats: Stats = {}): StatsDraft =>
  Object.fromEntries(Object.entries(stats).map(([id, v]) => [id, String(v)]));

/** Blank fields are left unset; anything unparsable becomes NaN so validation rejects it. */
export const fromDraft = (defs: StatDefinition[], draft: StatsDraft): Stats =>
  Object.fromEntries(
    defs.flatMap((d) => {
      const raw = (draft[d.id] ?? '').trim();
      return raw === '' ? [] : [[d.id, Number(raw)]];
    }),
  );

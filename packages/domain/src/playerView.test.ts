import { describe, expect, it } from 'vitest';
import { DomainError, updateCharacterByPlayer } from './actions';
import { ashenCrown } from './ashenCrown';
import { playerView } from './playerView';

const kael = ashenCrown.characters[0];
const item = (over = {}) => ({ id: 'i-1', name: 'Lantern', quantity: 1, notes: '', ...over });

describe('updateCharacterByPlayer', () => {
  it('changes only the inventory and player notes of that character', () => {
    const next = updateCharacterByPlayer(ashenCrown, kael.id, { inventory: [item()], playerNotes: 'Hi' });
    const updated = next.characters.find((p) => p.id === kael.id)!;
    expect(updated.inventory).toEqual([item()]);
    expect(updated.playerNotes).toBe('Hi');
    expect(updated).toMatchObject({ name: kael.name, notes: kael.notes, stats: kael.stats });
    expect(next.characters.slice(1)).toEqual(ashenCrown.characters.slice(1));
    expect(next.quests).toBe(ashenCrown.quests);
  });

  it('validates the inventory and the character', () => {
    expect(() => updateCharacterByPlayer(ashenCrown, kael.id, { inventory: [item({ quantity: -1 })], playerNotes: '' })).toThrow(
      DomainError,
    );
    expect(() => updateCharacterByPlayer(ashenCrown, kael.id, { inventory: [item({ name: ' ' })], playerNotes: '' })).toThrow(
      DomainError,
    );
    expect(() => updateCharacterByPlayer(ashenCrown, 'ghost', { inventory: [], playerNotes: '' })).toThrow(DomainError);
  });
});

describe('playerView', () => {
  const secret = { ...ashenCrown, characters: ashenCrown.characters.map((p) => ({ ...p, notes: 'DM SECRET' })) };

  it('contains the sheet but never the DM notes or other campaign data', () => {
    const view = playerView(secret, kael.id)!;
    const json = JSON.stringify(view);
    expect(json).not.toContain('DM SECRET');
    expect(view.campaignName).toBe(ashenCrown.name);
    expect(view.character.name).toBe(kael.name);
    expect(Object.keys(view).sort()).toEqual(['campaignName', 'character']);
    for (const other of ashenCrown.characters.slice(1)) expect(json).not.toContain(other.name);
    for (const npc of ashenCrown.npcs) expect(json).not.toContain(npc.name);
    for (const quest of ashenCrown.quests) expect(json).not.toContain(quest.title);
  });

  it('resolves race, class and stat names', () => {
    const view = playerView(ashenCrown, kael.id)!;
    expect(view.character.race).toBeTruthy();
    expect(view.character.stats.every((s) => s.name && typeof s.value === 'number')).toBe(true);
  });

  it('returns nothing for an unknown character', () => {
    expect(playerView(ashenCrown, 'ghost')).toBeUndefined();
  });
});

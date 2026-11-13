import { describe, expect, it } from 'vitest';
import { DomainError, updateCharacterByPlayer } from './actions';
import { ashenCrown } from './ashenCrown';
import { playerPage, playerView } from './playerView';

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

describe('playerPage', () => {
  const [shownNpc, hiddenNpc] = ashenCrown.npcs;
  const [shownQuest, hiddenQuest] = ashenCrown.quests;
  const campaign = {
    ...ashenCrown,
    characters: ashenCrown.characters.map((p) => ({ ...p, notes: 'DM SECRET' })),
    npcs: ashenCrown.npcs.map((n) => ({
      ...n,
      knownToPlayers: n.id === shownNpc.id,
      secret: n.id === shownNpc.id ? 'NPC SECRET' : 'HIDDEN NPC SECRET',
    })),
    quests: ashenCrown.quests.map((q) => ({
      ...q,
      knownToPlayers: q.id === shownQuest.id,
      giverNpcId: hiddenNpc.id,
      prerequisiteQuestIds: [hiddenQuest.id],
      secret: q.id === shownQuest.id ? 'QUEST SECRET' : 'HIDDEN QUEST SECRET',
    })),
  };

  it('includes only revealed quests and npcs', () => {
    const page = playerPage(campaign, kael.id)!;
    expect(page.npcs.map((n) => n.id)).toEqual([shownNpc.id]);
    expect(page.quests.map((q) => q.id)).toEqual([shownQuest.id]);
  });

  it('never contains secrets, hidden records, setting, tagline or events', () => {
    const page = playerPage({ ...campaign, events: [{ id: 'e', at: '', kind: 'note', text: 'EVENT TEXT', visibility: 'table', source: 'dm' }] }, kael.id)!;
    const json = JSON.stringify(page);
    for (const text of ['SECRET', 'EVENT TEXT', hiddenNpc.name, hiddenQuest.title, campaign.tagline]) {
      expect(json).not.toContain(text);
    }
    expect(Object.keys(page).sort()).toEqual(['campaignName', 'character', 'npcs', 'quests']);
    expect(Object.keys(page.npcs[0]).sort()).toEqual(['description', 'disposition', 'id', 'location', 'name', 'role']);
    expect(Object.keys(page.quests[0]).sort()).toEqual(['description', 'id', 'status', 'title']);
  });

  it('returns empty lists when nothing is revealed', () => {
    const none = { ...campaign, npcs: campaign.npcs.map((n) => ({ ...n, knownToPlayers: false })), quests: campaign.quests.map((q) => ({ ...q, knownToPlayers: undefined })) };
    const page = playerPage(none, kael.id)!;
    expect(page.npcs).toEqual([]);
    expect(page.quests).toEqual([]);
  });

  it('returns undefined for an unknown character', () => {
    expect(playerPage(campaign, 'ghost')).toBeUndefined();
  });
});

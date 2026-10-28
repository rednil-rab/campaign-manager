import { classLabel, raceLabel, statsFor } from './selectors';
import type { Campaign, Id, InventoryItem } from './types';

/**
 * Everything a player may see through their share link. It is built field by field,
 * so nothing else in the campaign (other characters, quests, NPCs, DM notes) can leak into it.
 */
export interface PlayerView {
  campaignName: string;
  character: {
    id: Id;
    name: string;
    player: string;
    race: string;
    characterClass: string;
    stats: { id: Id; name: string; value: number }[];
    inventory: InventoryItem[];
    playerNotes: string;
  };
}

export function playerView(c: Campaign, characterId: Id): PlayerView | undefined {
  const p = c.characters.find((x) => x.id === characterId);
  if (!p) return undefined;
  return {
    campaignName: c.name,
    character: {
      id: p.id,
      name: p.name,
      player: p.player,
      race: raceLabel(c, p),
      characterClass: classLabel(c, p),
      stats: statsFor(c, p.stats).map(({ def, value }) => ({ id: def.id, name: def.name, value })),
      inventory: p.inventory.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, notes: i.notes })),
      playerNotes: p.playerNotes ?? '',
    },
  };
}

import { tableEvents } from './gameLog';
import { classLabel, raceLabel, statsFor } from './selectors';
import type { Campaign, GameEvent, Id, InventoryItem, NpcDisposition, QuestStatus } from './types';

/** What the agent may use when narrating to players: their own sheet plus only what has been revealed. */
export interface PlayerContext extends PlayerView {
  setting: string;
  tagline: string;
  npcs: { id: Id; name: string; role: string; location: string; disposition: NpcDisposition; description: string }[];
  quests: { id: Id; title: string; status: QuestStatus; description: string }[];
  events: GameEvent[];
}

export const PLAYER_CONTEXT_EVENTS = 30;

export function playerContext(c: Campaign, characterId: Id): PlayerContext | undefined {
  const view = playerView(c, characterId);
  if (!view) return undefined;
  return {
    ...view,
    setting: c.setting,
    tagline: c.tagline,
    // Built field by field: secrets and unrevealed records never get in.
    npcs: c.npcs
      .filter((n) => n.knownToPlayers)
      .map((n) => ({
        id: n.id,
        name: n.name,
        role: n.role,
        location: n.location,
        disposition: n.disposition,
        description: n.description,
      })),
    quests: c.quests
      .filter((q) => q.knownToPlayers)
      .map((q) => ({ id: q.id, title: q.title, status: q.status, description: q.description })),
    events: tableEvents(c).slice(-PLAYER_CONTEXT_EVENTS),
  };
}

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

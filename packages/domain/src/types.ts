export type Id = string;

export type QuestStatus = 'active' | 'completed' | 'failed' | 'dormant';
export type NpcDisposition = 'ally' | 'neutral' | 'hostile' | 'unknown';

/** A campaign-defined stat, such as "HP" or "Charisma". Values are keyed by its id. */
export interface StatDefinition {
  id: Id;
  name: string;
}

/** Sparse stat values keyed by StatDefinition id; unset stats are simply absent. */
export type Stats = Record<Id, number>;

export interface Session {
  id: Id;
  number: number;
  title: string;
  /** ISO date (YYYY-MM-DD) of the real-world session. */
  playedOn: string;
  summary: string;
  questIds: Id[];
  npcIds: Id[];
  /** Player characters who attended. */
  characterIds: Id[];
}

export interface PlayerCharacter {
  id: Id;
  name: string;
  player: string;
  /** A race chosen from the campaign's races. When unset, `race` holds free text. */
  raceId?: Id;
  race: string;
  /** A class chosen from the campaign's classes. When unset, `characterClass` holds free text. */
  classId?: Id;
  characterClass: string;
  notes: string;
  /** Written by the player through their share link; the DM-only `notes` is never shown to players. */
  playerNotes?: string;
  stats: Stats;
  inventory: InventoryItem[];
}

export interface InventoryItem {
  id: Id;
  name: string;
  quantity: number;
  notes: string;
}

/** A named choice defined by the campaign's game system, such as a race or class. */
export interface RuleOption {
  id: Id;
  name: string;
}

export interface Quest {
  id: Id;
  title: string;
  status: QuestStatus;
  description: string;
  giverNpcId?: Id;
  /** Quests that must be resolved before this one opens up. */
  prerequisiteQuestIds: Id[];
  /** Players only learn about a quest once it is revealed; unset means hidden. */
  knownToPlayers?: boolean;
  /** DM-only truth behind the quest. Never part of anything shown to players. */
  secret?: string;
}

export interface Npc {
  id: Id;
  name: string;
  role: string;
  location: string;
  disposition: NpcDisposition;
  description: string;
  /** Optional: most NPCs never need stats. */
  stats?: Stats;
  /** Players only learn about an NPC once revealed; unset means hidden. */
  knownToPlayers?: boolean;
  /** DM-only truth about the NPC. Never part of anything shown to players. */
  secret?: string;
}

export type GameEventKind = 'narration' | 'action' | 'roll' | 'note' | 'reveal' | 'change';
export type GameEventSource = 'player' | 'agent' | 'dm';

/** One entry in the campaign's game log. `dm` entries are never shown to players. */
export interface GameEvent {
  id: Id;
  /** ISO timestamp. */
  at: string;
  kind: GameEventKind;
  text: string;
  visibility: 'table' | 'dm';
  source: GameEventSource;
  sessionId?: Id;
  characterId?: Id;
}

/** A bounded change the game-running agent may ask for. Item changes always target the acting character. */
export type AgentChange =
  | { action: 'add_item'; itemId: Id; name: string; quantity: number; notes: string }
  | { action: 'remove_item'; itemId: Id }
  | { action: 'set_item_quantity'; itemId: Id; quantity: number }
  | { action: 'set_quest_status'; questId: Id; status: QuestStatus }
  | { action: 'set_npc_disposition'; npcId: Id; disposition: NpcDisposition }
  | { action: 'reveal'; type: 'npc' | 'quest'; id: Id }
  | { action: 'add_session_note'; sessionId: Id; text: string };

/** A change held for the DM to approve or reject. */
export interface PendingChange {
  id: Id;
  at: string;
  change: AgentChange;
  /** The character the change was made for, when it is about an inventory. */
  characterId?: Id;
  description: string;
}

export interface Campaign {
  id: Id;
  name: string;
  setting: string;
  tagline: string;
  /** Stats available to every character and NPC in this campaign. */
  statDefinitions: StatDefinition[];
  races: RuleOption[];
  classes: RuleOption[];
  sessions: Session[];
  quests: Quest[];
  npcs: Npc[];
  characters: PlayerCharacter[];
  /** Append-only game log, oldest first. Absent in campaigns saved before it existed. */
  events?: GameEvent[];
  /** Agent changes waiting for the DM. Absent in campaigns saved before it existed. */
  pendingChanges?: PendingChange[];
}

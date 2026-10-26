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
  stats: Stats;
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
}

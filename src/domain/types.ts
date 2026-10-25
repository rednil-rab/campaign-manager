export type Id = string;

export type QuestStatus = 'active' | 'completed' | 'failed' | 'dormant';
export type NpcDisposition = 'ally' | 'neutral' | 'hostile' | 'unknown';

export interface Session {
  id: Id;
  number: number;
  title: string;
  /** ISO date (YYYY-MM-DD) of the real-world session. */
  playedOn: string;
  summary: string;
  questIds: Id[];
  npcIds: Id[];
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
}

export interface Campaign {
  id: Id;
  name: string;
  setting: string;
  tagline: string;
  sessions: Session[];
  quests: Quest[];
  npcs: Npc[];
}

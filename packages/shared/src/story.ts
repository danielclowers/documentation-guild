import type { ExpeditionReward } from './expeditions';

export interface JournalDiscovery {
  key: string;
  title: string;
  text: string;
  rarity: string;
  source: 'case' | 'challenge' | 'party' | 'chronicle';
  discoveredAt: number;
}

export interface ChronicleChapter {
  key: string;
  title: string;
  intro: string;
  expeditions: number;
  renown: number;
  clues: string[];
  targetExpeditions: number;
  targetRenown: number;
  targetClues: number;
  scenes: { key: string; text: string }[];
  recap?: string;
}

export interface GuildJournal {
  discoveries: JournalDiscovery[];
  chains: {
    key: string;
    title: string;
    steps: number;
    discoveries: (JournalDiscovery & { step: number })[];
  }[];
  chronicle: ChronicleChapter[];
}

export type GuildActivity =
  | { kind: 'expedition'; id: string; at: number; title: string; renown: number }
  | { kind: 'discovery'; id: string; at: number; title: string }
  | { kind: 'clue'; id: string; at: number; title: string }
  | { kind: 'renown'; id: string; at: number; renown: number };

export interface GuildFeed {
  renown: number;
  entries: GuildActivity[];
  next: string | null;
}

export interface GuildRecap {
  checkedAt: number;
  standing: Pick<ExpeditionReward, 'xp' | 'skillXp' | 'gold'>;
  returned: { id: string; title: string; xp: number; gold: number }[];
  discoveries: number;
  challenges: number;
  invitations: number;
  milestones: number;
}

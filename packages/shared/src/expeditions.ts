import type { Skill } from './index';
import type { ChronicleChapter } from './story';

export const expeditionMinute = 60_000;
export const expeditionGrace = 15 * expeditionMinute;
export const expeditionDay = 24 * 60 * expeditionMinute;
export const expeditionRewards = {
  tutorial: { xp: 60, skillXp: 20, gold: 35, renown: 10 },
  normal: { xp: 110, skillXp: 35, gold: 60, renown: 15 },
  advanced: { xp: 140, skillXp: 45, gold: 80, renown: 20 },
} as const;
export type ExpeditionTier = keyof typeof expeditionRewards;
export type ExpeditionReward = { xp: number; skillXp: number; gold: number; renown: number };

export type ExpeditionState =
  'recruiting' | 'grace' | 'running' | 'completed' | 'cancelled' | 'expired' | 'failed';
export interface ExpeditionModifier {
  key: string;
  title: string;
  description: string;
}

export interface ExpeditionMission {
  key: string;
  title: string;
  summary: string;
  minutes: number;
  tier: ExpeditionTier;
  recommendedLevel: number;
  unlocked: boolean;
  approaches: { key: string; label: string; description: string }[];
}
export interface ExpeditionEvent {
  slot: number;
  title: string;
  context: string;
  skill: Skill;
  availableAt: number;
  expiresAt: number;
  options: { id: string; label: string; effect: string }[];
  retry: boolean;
  result?: {
    success: boolean;
    text: string;
    xp: number;
    gold: number;
    renown: number;
    discovery?: string;
  };
}
export interface ExpeditionParty {
  id: string;
  mission: string;
  leaderId: string;
  modifier?: ExpeditionModifier;
  state: ExpeditionState;
  scheduledAt: number | null;
  graceUntil: number | null;
  startedAt: number | null;
  endsAt: number | null;
  roster: { id: string; name: string; role: Skill; approach: string }[];
  events: ExpeditionEvent[];
  invited: boolean;
  report?: {
    text: string;
    reward?: ExpeditionReward;
    sharedRenown: number;
    discovery: string | null;
  };
}
export interface ExpeditionBoard {
  missions: ExpeditionMission[];
  modifiers: ExpeditionModifier[];
  parties: ExpeditionParty[];
  invitees: { id: string; name: string }[];
  chronicle: ChronicleChapter[];
}

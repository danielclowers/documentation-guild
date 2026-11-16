import type { Skill } from './index';

export const businessChoiceKinds = ['guaranteed_gold', 'discovery_roll', 'renown_bonus'] as const;
export type BusinessChoiceKind = (typeof businessChoiceKinds)[number];

export interface BusinessPayout {
  xp: number;
  skillXp: number;
  gold: number;
  renown: number;
}

export interface BusinessPreview extends BusinessPayout {
  discoveryChance: number;
  newDiscoveryChance: number;
  full: boolean;
  retryPenalty: boolean;
}

export interface DiscoveryFind {
  key: string;
  title: string;
  text: string;
  rarity: 'common' | 'uncommon' | 'rare';
  known: boolean;
}

export interface BusinessAllowance {
  remaining: number;
  limit: number;
  nextAt: number | null;
}

interface BusinessCaseBase {
  id: string;
  title: string;
  skill: Skill;
  prompt: string;
  difficulty: 'intro' | 'normal' | 'advanced';
  attempts: number;
  retryAt: number;
  clues?: string[];
}

export type BusinessPuzzle = BusinessCaseBase &
  (
    | { type: 'sequence'; tiles: number[]; labels?: Record<number, string> }
    | {
        type: 'deduction' | 'choice';
        options: { id: number; label: string; effect?: BusinessChoiceKind }[];
      }
    | { type: 'matching'; tiles: string[] }
  );

export type BusinessCase = BusinessPuzzle & {
  preview: BusinessPreview;
  choicePreviews?: Record<number, BusinessPreview>;
};

export interface BusinessBoard {
  cases: BusinessCase[];
  allowance: BusinessAllowance;
}

export type BusinessAnswer =
  | { type: 'sequence'; tiles: number[] }
  | { type: 'deduction' | 'choice'; option: number }
  | { type: 'matching'; pairs: [number, number][] };

export interface BusinessReward extends BusinessPayout {
  discovery: DiscoveryFind | null;
  skill: Skill;
  full: boolean;
  outcome: string;
}

export type BusinessSubmission =
  | { status: 'retry'; attempts: number; retryAt: number }
  | { status: 'completed'; reward: BusinessReward };

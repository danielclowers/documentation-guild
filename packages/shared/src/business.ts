import type { Skill } from './index';

export const businessChoiceKinds = ['guaranteed_gold', 'discovery_roll', 'renown_bonus'] as const;
export type BusinessChoiceKind = (typeof businessChoiceKinds)[number];

interface BusinessCaseBase {
  id: string;
  title: string;
  skill: Skill;
  prompt: string;
  difficulty: 'intro' | 'normal' | 'advanced';
  attempts: number;
  retryAt: number;
}

export type BusinessCase = BusinessCaseBase &
  (
    | { type: 'sequence'; tiles: number[] }
    | {
        type: 'deduction' | 'choice';
        options: { id: number; label: string; effect?: BusinessChoiceKind }[];
      }
    | { type: 'matching'; tiles: string[] }
  );

export type BusinessAnswer =
  | { type: 'sequence'; tiles: number[] }
  | { type: 'deduction' | 'choice'; option: number }
  | { type: 'matching'; pairs: [number, number][] };

export interface BusinessReward {
  xp: number;
  skillXp: number;
  gold: number;
  renown: number;
  discovery: { title: string; text: string } | null;
}

export type BusinessSubmission =
  | { status: 'retry'; attempts: number; retryAt: number }
  | { status: 'completed'; reward: BusinessReward };

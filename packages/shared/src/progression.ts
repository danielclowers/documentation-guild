import type { HallStation } from './hall';
import type { Skill } from './index';

export const standingOrderInterval = 5 * 60_000;

export const standingOrders = {
  Scribing: { station: 'Scriptorium', xp: 3, skillXp: 5, gold: 3 },
  Research: { station: 'Archives', xp: 3, skillXp: 5, gold: 2 },
  Restoration: { station: 'Restoration Table', xp: 3, skillXp: 5, gold: 2 },
} satisfies Record<Skill, { station: HallStation; xp: number; skillXp: number; gold: number }>;

export interface CharacterProgression {
  onExpedition: boolean;
  training: Partial<Record<TrainingKey, number>>;
  specialization: Specialization | null;
  canSwitchAt: number | null;
  order: { skill: Skill; remainingMs: number; running: boolean } | null;
  skills: Record<Skill, { xp: number; level: number }>;
  latestReward: { skill: Skill; xp: number; skillXp: number; gold: number; at: number } | null;
}

export const trainingLevel = 3;
export const trainingCosts = [100, 200, 350] as const;
export const specializationLevel = 10;
export const specializationSwitchCost = 200;
export const specializationCooldown = 24 * 60 * 60_000;

export const trainingUpgrades = {
  efficient_scribing: {
    label: 'Efficient Scribing',
    description: '+3% Scribing Guild Business gold per rank',
  },
  careful_research: {
    label: 'Careful Research',
    description: '+2 percentage points to Research challenge success per rank',
  },
  expedition_readiness: {
    label: 'Expedition Readiness',
    description: '+2% optional expedition XP per rank',
  },
  steady_hands: {
    label: 'Steady Hands',
    description: '+2 percentage points to Restoration event success per rank',
  },
} as const;
export type TrainingKey = keyof typeof trainingUpgrades;

export const specializations = {
  Chronicler: {
    skill: 'Scribing',
    description: '+10% Scribing standing-order gold, rounded down per payout',
  },
  Editor: { skill: 'Scribing', description: '+15% Scribing Guild Business gold' },
  Archivist: {
    skill: 'Research',
    description: '+8 percentage points to rare Research expedition discoveries, up to 30%',
  },
  Investigator: {
    skill: 'Research',
    description: 'Retry one failed optional deduction per expedition',
  },
  Mender: { skill: 'Restoration', description: '+10% Restoration Guild Business gold' },
  Warden: {
    skill: 'Restoration',
    description: '+10 percentage points to difficulty-based Restoration event checks, up to 95%',
  },
} as const;
export type Specialization = keyof typeof specializations;

export const trainingKeys = Object.keys(trainingUpgrades) as TrainingKey[];
export const specializationKeys = Object.keys(specializations) as Specialization[];

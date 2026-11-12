import type { HallStation } from './hall';
import type { Skill } from './index';

export const standingOrderInterval = 5 * 60_000;
export const offlineStandingOrderLimit = 24 * 60 * 60_000;

export const standingOrders = {
  Scribing: { station: 'Scriptorium', xp: 3, skillXp: 5, gold: 3 },
  Research: { station: 'Archives', xp: 3, skillXp: 5, gold: 2 },
  Restoration: { station: 'Restoration Table', xp: 3, skillXp: 5, gold: 2 },
} satisfies Record<Skill, { station: HallStation; xp: number; skillXp: number; gold: number }>;

export interface CharacterProgression {
  order: { skill: Skill; nextRewardAt: number | null } | null;
  skills: Record<Skill, { xp: number; level: number }>;
  latestReward: { skill: Skill; xp: number; skillXp: number; gold: number; at: number } | null;
}

import type { D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  BusinessAllowance,
  BusinessChoiceKind,
  BusinessPreview,
  BusinessPuzzle,
} from '@guild/shared';

export const businessWindow = 86_400_000;
export const fullRewardLimit = 8;
export const fullPayouts =
  "FROM reward_ledger WHERE character_id = ? AND source_type = 'business' AND skill_xp > 0 AND awarded_at > ?";

export const reducedCasePayout = { xp: 5, skillXp: 0, gold: 2, renown: 0 };

export type RewardModifiers = {
  specialization: string | null;
  scribingRank: number;
  researchRank: number;
};

export async function allowance(statement: D1PreparedStatement): Promise<BusinessAllowance> {
  const row = await statement.first<{ used: number; oldest: number | null }>();
  return {
    remaining: Math.max(0, fullRewardLimit - (row?.used ?? 0)),
    limit: fullRewardLimit,
    nextAt: row?.oldest != null ? row.oldest + businessWindow : null,
  };
}

export function caseReward(
  item: Pick<BusinessPuzzle, 'difficulty' | 'skill' | 'attempts'>,
  modifiers: RewardModifiers,
  full: boolean,
  effect?: BusinessChoiceKind,
  unseenShare = 1,
): BusinessPreview {
  if (!full)
    return {
      ...reducedCasePayout,
      discoveryChance: 0,
      newDiscoveryChance: 0,
      full,
      retryPenalty: false,
    };
  const advanced = item.difficulty === 'advanced';
  const retryPenalty = item.attempts > 2;
  const factor = retryPenalty ? 0.75 : 1;
  const bonus =
    item.skill === 'Scribing'
      ? (modifiers.specialization === 'Editor' ? 15 : 0) + modifiers.scribingRank * 3
      : item.skill === 'Restoration' && modifiers.specialization === 'Mender'
        ? 10
        : 0;
  const discoveryChance =
    (advanced ? 12 : 8) +
    (effect === 'discovery_roll' ? 12 : 0) +
    (item.skill === 'Research' ? modifiers.researchRank * 2 : 0);
  return {
    xp: Math.floor((advanced ? 35 : 20) * factor),
    skillXp: Math.floor((advanced ? 16 : 10) * factor),
    gold: Math.floor(
      (((advanced ? 20 : 12) + (effect === 'guaranteed_gold' ? 4 : 0)) *
        factor *
        (100 + Math.min(25, bonus))) /
        100,
    ),
    renown: effect === 'renown_bonus' ? 5 : 0,
    discoveryChance,
    newDiscoveryChance: discoveryChance * unseenShare,
    full,
    retryPenalty,
  };
}

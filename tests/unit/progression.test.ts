import { describe, expect, it } from 'vitest';
import {
  characterLevel,
  characterXpForLevel,
  expeditionRewards,
  skillLevel,
  skillXpForLevel,
  specializationLevel,
  standingOrders,
  trainingCosts,
  trainingLevel,
} from '../../packages/shared/src';

const thresholds = [
  0, 26, 113, 266, 487, 779, 1143, 1580, 2091, 2678, 3341, 4082, 4900, 5797, 6773, 7829, 8966,
  10183, 11482, 12863,
];

describe('character progression', () => {
  it.each(thresholds.map((xp, index) => [index + 1, xp] as const))(
    'starts level %i at exactly %i cumulative XP',
    (level, xp) => {
      expect(characterXpForLevel(level)).toBe(xp);
      expect(characterLevel(xp)).toBe(level);
      if (level > 1) expect(characterLevel(xp - 1)).toBe(level - 1);
      expect(characterLevel(xp + 1)).toBe(level);
      const next = thresholds[level];
      if (next !== undefined) expect(characterLevel(next - 1)).toBe(level);
    },
  );

  it('caps at twenty and continues to accept cumulative XP', () => {
    expect(characterLevel(12862)).toBe(19);
    for (const xp of [12863, 12864, 1_000_000, Number.MAX_SAFE_INTEGER])
      expect(characterLevel(xp)).toBe(20);
  });

  it('recalculates existing XP and never reduces a level earned under the previous curve', () => {
    const previousThresholds = [
      0, 110, 315, 598, 951, 1370, 1850, 2388, 2983, 3633, 4336, 5090, 5895, 6750, 7652, 8603, 9600,
      10642, 11730, 12863,
    ];
    for (const [index, xp] of previousThresholds.entries()) {
      expect(characterXpForLevel(index + 1)).toBeLessThanOrEqual(xp);
      expect(characterLevel(xp)).toBeGreaterThanOrEqual(index + 1);
    }
    expect(characterLevel(110)).toBe(2);
    expect(characterLevel(315)).toBe(4);
    expect(characterLevel(951)).toBe(6);
    expect(characterLevel(3633)).toBe(11);
  });

  it('meets passive milestones using complete five-minute payouts', () => {
    for (const [level, minutes] of [
      [2, 45],
      [3, 190],
      [4, 445],
      [5, 815],
      [10, 4465],
      [15, 11290],
      [20, 21440],
    ]) {
      expect(Math.ceil(characterXpForLevel(level!) / standingOrders.Scribing.xp) * 5).toBe(minutes);
    }
    expect(characterXpForLevel(trainingLevel)).toBe(113);
    expect(characterXpForLevel(specializationLevel)).toBe(2678);
  });
});

describe('skill progression and reward constants', () => {
  it('preserves every skill threshold and its exact boundaries', () => {
    const skillThresholds = [
      0, 70, 191, 350, 543, 765, 1015, 1290, 1590, 1914, 2260, 2627, 3015, 3423, 3852, 4299, 4765,
      5249, 5751, 6271,
    ];
    for (const [index, xp] of skillThresholds.entries()) {
      const level = index + 1;
      expect(skillXpForLevel(level)).toBe(xp);
      expect(skillLevel(xp)).toBe(level);
      if (level > 1) expect(skillLevel(xp - 1)).toBe(level - 1);
    }
    expect(skillLevel(1_000_000)).toBe(20);
  });

  it('preserves XP and gold generation and the cost and level of existing unlocks', () => {
    expect(standingOrders).toEqual({
      Scribing: { station: 'Scriptorium', xp: 3, skillXp: 5, gold: 3 },
      Research: { station: 'Archives', xp: 3, skillXp: 5, gold: 2 },
      Restoration: { station: 'Restoration Table', xp: 3, skillXp: 5, gold: 2 },
    });
    expect(expeditionRewards).toEqual({
      tutorial: { xp: 60, skillXp: 20, gold: 35, renown: 10 },
      normal: { xp: 110, skillXp: 35, gold: 60, renown: 15 },
      advanced: { xp: 140, skillXp: 45, gold: 80, renown: 20 },
    });
    expect(trainingCosts).toEqual([100, 200, 350]);
    expect(trainingLevel).toBe(3);
    expect(specializationLevel).toBe(10);
  });
});

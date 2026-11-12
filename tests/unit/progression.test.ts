import { describe, expect, it } from 'vitest';
import {
  characterLevel,
  characterXpForLevel,
  skillLevel,
  skillXpForLevel,
} from '../../packages/shared/src';

describe('progression thresholds', () => {
  it('starts characters and skills at level one', () => {
    expect(characterLevel(0)).toBe(1);
    expect(skillLevel(0)).toBe(1);
    expect(characterXpForLevel(2)).toBe(110);
    expect(skillXpForLevel(2)).toBe(70);
  });

  it('increments each level exactly at its cumulative XP threshold', () => {
    for (let level = 2; level <= 20; level++) {
      expect(characterLevel(characterXpForLevel(level) - 1)).toBe(level - 1);
      expect(characterLevel(characterXpForLevel(level))).toBe(level);
      expect(skillLevel(skillXpForLevel(level) - 1)).toBe(level - 1);
      expect(skillLevel(skillXpForLevel(level))).toBe(level);
    }
  });

  it('caps levels at twenty while allowing XP to keep increasing', () => {
    expect(characterLevel(1_000_000)).toBe(20);
    expect(skillLevel(1_000_000)).toBe(20);
  });
});

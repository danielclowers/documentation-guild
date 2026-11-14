import { z } from 'zod';

export const skillSchema = z.enum(['Scribing', 'Research', 'Restoration']);
export type Skill = z.infer<typeof skillSchema>;

const LEVEL_CAP = 20;

export function characterXpForLevel(level: number): number {
  return Math.floor(70 * (level - 1) ** 1.75 + 40 * (level - 1));
}

export function skillXpForLevel(level: number): number {
  return Math.floor(45 * (level - 1) ** 1.65 + 25 * (level - 1));
}

function levelForXp(xp: number, threshold: (level: number) => number): number {
  for (let level = LEVEL_CAP; level > 1; level--) {
    if (xp >= threshold(level)) return level;
  }
  return 1;
}

export function characterLevel(xp: number): number {
  return levelForXp(xp, characterXpForLevel);
}

export function skillLevel(xp: number): number {
  return levelForXp(xp, skillXpForLevel);
}

export * from './accounts';

export * from './hall';

export * from './progression';

export * from './business';

export * from './expeditions';

export * from './story';

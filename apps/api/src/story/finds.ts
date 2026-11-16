import type { DiscoveryFind } from '@guild/shared';
import { discoveries } from '../expeditions/content';

export function discoveryFind(key: string | null, known: boolean): DiscoveryFind | null {
  const entry = key ? discoveries.get(key) : undefined;
  if (!entry) return null;
  return { key: entry.key, title: entry.title, text: entry.text, rarity: entry.rarity, known };
}

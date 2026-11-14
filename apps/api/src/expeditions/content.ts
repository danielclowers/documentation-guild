import { catalog } from '@guild/content';
import { expeditionDay, skillLevel } from '@guild/shared';
import type { Skill, Specialization } from '@guild/shared';

export const modifiers = new Map(catalog.modifiers.map((modifier) => [modifier.key, modifier]));
export type Modifier = (typeof catalog.modifiers)[number];

const modifierEffects: Record<string, string> = {
  unstable_enchantments:
    'Restoration checks are 5 percentage points harder. Successful Restoration challenges roll twice for optional XP and keep the higher roll.',
  missing_references:
    'Research checks gain 5 percentage points. Research discovery choices gain 5 percentage points to find an item.',
  royal_inspection:
    'Scribing checks gain 5 percentage points. Successful Scribing challenges roll twice for optional gold and keep the higher roll.',
  ancient_wards:
    'Restoration checks lose 3 percentage points. A careful approach offsets that penalty.',
  corrupted_chronicle:
    'Every member receives a second optional Research challenge, up to the usual two-challenge limit.',
};

export function modifierView(modifier: Modifier) {
  return { key: modifier.key, title: modifier.title, description: modifierEffects[modifier.key]! };
}

export const missions = new Map(catalog.expeditions.map((mission) => [mission.key, mission]));
export const chapters = catalog.chapters.filter((chapter) => chapter.status === 'launch');
export const discoveries = new Map(catalog.discoveries.map((item) => [item.key, item]));
const optional = catalog.discoveries.filter((item) => !item.story_required);
export function optionalDiscovery(seed: number) {
  return optional[seed % optional.length]!;
}

export interface ExpeditionSnapshot {
  name: string;
  specialization: Specialization | null;
  scribing: number;
  research: number;
  restoration: number;
  researchTraining: number;
  readiness: number;
  steadyHands: number;
}
export type Mission = (typeof catalog.expeditions)[number];

export function roll(seed: number, key: string) {
  let hash = seed ^ 0x811c9dc5;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

const deductionClues: Record<string, string> = {
  absent_librarian:
    'The ink on the cover matches the writing inside. Which lead gives you a firsthand account?',
  wrong_way_map:
    'The needle turns freely and lines up with the north star. Which guide can you verify?',
  mirror_archive:
    'Only the original mirror shows the letters in reverse. Which approach lets you read them?',
};

const cipher = catalog.events.findIndex(({ key }) => key === 'mirror_archive');
const alternateCipher = catalog.events.findIndex(({ key }) => key === 'wrong_way_map');

export function expeditionEvents(
  mission: Mission,
  seed: number,
  member: string,
  start: number,
  end: number,
  modifierKey?: string | null,
) {
  const first = roll(seed, member + ':first') % catalog.events.length;
  const second =
    modifierKey === 'corrupted_chronicle'
      ? first === cipher
        ? alternateCipher
        : cipher
      : (first + 1 + (roll(seed, member + ':next') % (catalog.events.length - 1))) %
        catalog.events.length;
  const indexes =
    mission.tier !== 'tutorial' &&
    (modifierKey === 'corrupted_chronicle' || roll(seed, member + ':extra') % 2 === 0)
      ? [first, second]
      : [first];
  return indexes.map((index, slot) => ({
    ...catalog.events[index]!,
    deductionClue: deductionClues[catalog.events[index]!.key],
    slot,
    availableAt: start + Math.floor((end - start) * (slot === 0 ? 0.4 : 0.7)),
    expiresAt: end + expeditionDay,
  }));
}

export function challengeChance(
  skill: Skill,
  recommended: number,
  snapshot: ExpeditionSnapshot,
  role: Skill,
  approach: number,
  modifier?: Modifier,
) {
  const xp = {
    Scribing: snapshot.scribing,
    Research: snapshot.research,
    Restoration: snapshot.restoration,
  }[skill];
  const restoration =
    skill === 'Restoration'
      ? snapshot.steadyHands * 2 +
        (role === 'Restoration' ? 5 : 0) +
        (snapshot.specialization === 'Warden' ? 10 : 0)
      : 0;
  const research = skill === 'Research' ? snapshot.researchTraining * 2 : 0;
  const adjustment = modifier?.affected_skill === skill ? modifier.skill_check_adjustment : 0;
  return Math.max(
    30,
    Math.min(
      95,
      55 + 3 * (skillLevel(xp) - recommended) + restoration + research + approach + adjustment,
    ),
  );
}

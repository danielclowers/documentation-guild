import { catalog } from '@guild/content';
import { z } from 'zod';
import type { BusinessAnswer, BusinessCase, BusinessChoiceKind } from '@guild/shared';

export const businessAnswerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('sequence'), tiles: z.array(z.int()).min(4).max(5) }),
  z.strictObject({ type: z.literal('deduction'), option: z.int().min(0).max(2) }),
  z.strictObject({ type: z.literal('choice'), option: z.int().min(0).max(2) }),
  z.strictObject({
    type: z.literal('matching'),
    pairs: z.array(z.tuple([z.int().min(0).max(5), z.int().min(0).max(5)])).length(3),
  }),
]);

export const caseRotation = [
  'pages_in_order',
  'three_witnesses',
  'glyph_pairs',
  'chronicle_priority',
  'rune_numbers',
  'ink_stains',
  'bookmarks',
  'sealed_chest',
  'page_five',
  'first_revision',
  'repair_or_copy',
  'scribe_memo',
];

const definitions = new Map(
  catalog.business_cases.map((definition) => [definition.key, definition]),
);
const choices: Record<string, readonly BusinessChoiceKind[]> = {
  repair_or_copy: ['guaranteed_gold', 'renown_bonus', 'discovery_roll'],
  scribe_memo: ['discovery_roll', 'renown_bonus', 'guaranteed_gold'],
};

export interface CaseInstance {
  id: string;
  character_id: string;
  position: number;
  seed: number;
  template_key: string;
  attempts: number;
  retry_at: number;
  completed_at: number | null;
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((seed / 2 ** 32) * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function casePuzzle(row: CaseInstance): {
  view: BusinessCase;
  solve: (answer: BusinessAnswer) => boolean;
} {
  const key = row.template_key;
  const definition = definitions.get(key);
  if (!definition) throw new Error('Missing Guild Business definition');
  const base = {
    id: row.id,
    title: definition.title,
    skill: definition.skill,
    prompt: definition.prompt,
    difficulty: definition.difficulty,
    attempts: row.attempts,
    retryAt: row.retry_at,
  };
  if (definition.type === 'sequence') {
    const offset = row.position === 0 ? 0 : row.seed % 20;
    const sorted = definition.template.answer.map((value) => value + offset);
    const tiles =
      row.position === 0 ? [...definition.template.initial] : shuffled(sorted, row.seed);
    if (tiles.every((value, index) => value === sorted[index])) tiles.reverse();
    return {
      view: { ...base, type: 'sequence', tiles },
      solve: (answer) =>
        answer.type === 'sequence' &&
        answer.tiles.length === sorted.length &&
        answer.tiles.every((value, index) => value === sorted[index]),
    };
  }
  if (definition.type === 'matching') {
    const tiles = shuffled(definition.template.initial, row.seed);
    return {
      view: { ...base, type: 'matching', tiles },
      solve: (answer) =>
        answer.type === 'matching' &&
        new Set(answer.pairs.flat()).size === tiles.length &&
        answer.pairs.every(
          ([first, second]) => tiles[first] !== undefined && tiles[first] === tiles[second],
        ),
    };
  }
  const effects = choices[key] ?? definition.choice_effects.map(({ kind }) => kind);
  const options = shuffled(
    definition.template.initial.map((label, id) => ({
      id,
      label,
      effect: definition.type === 'choice' ? effects[id] : undefined,
    })),
    row.seed,
  );
  return {
    view: { ...base, type: definition.type, options },
    solve: (answer) => {
      const selected =
        (answer.type === 'choice' || answer.type === 'deduction') &&
        options.find(({ id }) => id === answer.option);
      return Boolean(
        selected &&
        answer.type === definition.type &&
        (definition.type === 'choice' || selected.label === definition.template.answer),
      );
    },
  };
}

export const optionalDiscoveries = catalog.discoveries.filter(
  ({ story_required }) => !story_required,
);

import { businessEditorial, catalog, editorialVersion, legacyCatalog } from '@guild/content';
import { z } from 'zod';
import { newCaseDefinitions, shuffled } from './new-cases';
import type { BusinessAnswer, BusinessPuzzle, BusinessChoiceKind } from '@guild/shared';

export const businessAnswerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('sequence'), tiles: z.array(z.int()).min(4).max(5) }),
  z.strictObject({ type: z.literal('deduction'), option: z.int().min(0).max(2) }),
  z.strictObject({ type: z.literal('choice'), option: z.int().min(0).max(2) }),
  z.strictObject({
    type: z.literal('matching'),
    pairs: z.array(z.tuple([z.int().min(0).max(5), z.int().min(0).max(5)])).length(3),
  }),
]);

const definitions = new Map(
  legacyCatalog.business_cases.map((definition) => [definition.key, definition]),
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
  content_version: number;
}

export function casePuzzle(row: CaseInstance): {
  view: BusinessPuzzle;
  outcome: (option?: number) => string;
  solve: (answer: BusinessAnswer) => boolean;
} {
  const key = row.template_key;
  const modern = newCaseDefinitions.get(key);
  const copy = row.content_version === editorialVersion ? businessEditorial[key] : undefined;
  const state = { id: row.id, attempts: row.attempts, retryAt: row.retry_at };
  if (modern) {
    const { puzzle, solve, outcome } = modern.build(row.seed, copy);
    return {
      view: {
        ...state,
        ...puzzle,
        title: copy?.title ?? modern.title,
        skill: modern.skill,
        difficulty: modern.difficulty,
      },
      solve,
      outcome,
    };
  }
  const definition = definitions.get(key);
  if (!definition) throw new Error('Missing Guild Business definition');
  const base = {
    ...state,
    title: definition.title,
    skill: definition.skill,
    prompt: copy?.prompt ?? definition.prompt,
    difficulty: definition.difficulty,
  };
  if (definition.type === 'sequence') {
    const offset = row.position === 0 ? 0 : row.seed % 20;
    const sorted = definition.template.answer.map((value) => value + offset);
    const tiles =
      row.position === 0 ? [...definition.template.initial] : shuffled(sorted, row.seed);
    if (tiles.every((value, index) => value === sorted[index])) tiles.reverse();
    return {
      view: { ...base, type: 'sequence', tiles },
      outcome: () => copy?.outcome ?? 'You restored the pages to their proper order.',
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
      outcome: () => 'Every pair is accounted for in the guild records.',
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
    outcome: () =>
      definition.type === 'choice'
        ? 'Your decision was entered in the guild records.'
        : 'Your deduction fits the clues.',
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

type CaseMetadata = Pick<BusinessPuzzle, 'skill' | 'difficulty' | 'title'> & {
  family: string;
  quick: boolean;
};
export const caseMetadata = new Map<string, CaseMetadata>([
  ...[...definitions].map(
    ([key, value]) =>
      [
        key,
        {
          title: value.title,
          skill: value.skill,
          family: value.type,
          difficulty: value.difficulty,
          quick:
            value.type === 'choice' || value.type === 'matching' || value.difficulty === 'intro',
        },
      ] as const,
  ),
  ...[...newCaseDefinitions].map(
    ([key, value]) => [key, { ...value, quick: Boolean(value.quick) }] as const,
  ),
]);

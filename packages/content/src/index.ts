import { skillSchema } from '@guild/shared';
import { z } from 'zod';
import seed from '../../../docs/spec/CONTENT-SEED.json';

const text = z.string().min(1);
const key = z.string().regex(/^[a-z][a-z0-9_]*$/);
const positiveInteger = z.int().positive();
const titledEntry = z.object({ key, title: text });

const caseFields = titledEntry.extend({
  skill: skillSchema,
  prompt: text,
  difficulty: z.enum(['intro', 'normal', 'advanced']),
  duration_seconds_target: positiveInteger,
});

const caseSchema = z.discriminatedUnion('type', [
  caseFields.extend({
    type: z.literal('sequence'),
    template: z.object({
      initial: z.array(z.int()).min(4).max(5),
      answer: z.array(z.int()).min(4).max(5),
    }),
    choice_effects: z.tuple([]),
  }),
  caseFields.extend({
    type: z.literal('deduction'),
    template: z.object({ initial: z.array(text).length(3), answer: text }),
    choice_effects: z.tuple([]),
  }),
  caseFields.extend({
    type: z.literal('choice'),
    template: z.object({ initial: z.array(text).length(3), answer: z.null() }),
    choice_effects: z
      .array(
        z.object({
          key,
          kind: z.enum(['guaranteed_gold', 'discovery_roll', 'renown_bonus']),
          weight: positiveInteger,
        }),
      )
      .length(3),
  }),
  caseFields.extend({
    type: z.literal('matching'),
    template: z.object({ initial: z.array(text).length(6), answer: z.array(text).length(3) }),
    choice_effects: z.tuple([]),
  }),
]);

const catalogSchema = z.object({
  schema_version: z.literal(1),
  game_title: text,
  campaign_title: text,
  standing_orders: z
    .array(z.object({ key, label: text, station: text, skill: skillSchema }))
    .length(3),
  business_cases: z.array(caseSchema),
  expeditions: z.array(
    titledEntry.extend({
      summary: text,
      featured_skill: skillSchema,
      duration_minutes: z.union([z.literal(10), z.literal(20)]),
      tier: z.enum(['tutorial', 'normal', 'advanced']),
      recommended_level: positiveInteger.max(20),
      chapter: key,
      party_size: z.object({ min: z.literal(2), max: z.literal(4) }),
      icon: key,
      approaches: z
        .array(z.object({ key, label: text, strategy_bonus: z.int(), description: text }))
        .length(3),
      story_beats: z.object({ departure: text, midpoint: text, return: text }),
    }),
  ),
  events: z.array(
    titledEntry.extend({
      context: text,
      skill: skillSchema,
      type: z.literal('choice'),
      icon: key,
      options: z
        .array(
          z.object({
            id: key,
            label: text,
            effect: z.enum(['reliable_bonus', 'discovery_chance', 'guild_renown']),
            consequence: text,
          }),
        )
        .length(3),
    }),
  ),
  discoveries: z.array(
    titledEntry.extend({
      text,
      rarity: z.enum(['common', 'uncommon', 'rare']),
      chain_key: key.nullable(),
      story_required: z.boolean(),
      chain_step: positiveInteger.nullable(),
    }),
  ),
  modifiers: z.array(
    titledEntry.extend({
      description: text,
      affected_skill: skillSchema,
      skill_check_adjustment: z.int(),
    }),
  ),
  chapters: z.array(
    z.discriminatedUnion('status', [
      titledEntry.extend({
        status: z.literal('launch'),
        intro: text,
        objectives: z.array(z.object({ key, target: positiveInteger, type: key })).min(1),
        recap: text,
        scenes: z.array(z.object({ key, text })).min(1),
        guaranteed_clue_rules: z.array(z.object({ clue_key: key, trigger: key })).min(1),
      }),
      titledEntry.extend({
        status: z.literal('future_outline'),
        intro: text,
        objectives: z.tuple([]),
        recap: z.null(),
      }),
    ]),
  ),
});

function assertDistinct(values: Iterable<string | number>, description: string): void {
  const entries = [...values];
  if (new Set(entries).size !== entries.length) throw new Error(`Duplicate ${description}`);
}

export function validateCatalog(input: unknown) {
  const catalog = catalogSchema.parse(input);
  const collections = [
    catalog.standing_orders,
    catalog.business_cases,
    catalog.expeditions,
    catalog.events,
    catalog.discoveries,
    catalog.modifiers,
    catalog.chapters,
  ];
  for (const collection of collections)
    assertDistinct(
      collection.map((item) => item.key),
      'catalog keys',
    );
  assertDistinct(
    catalog.standing_orders.map((order) => order.skill),
    'standing order skills',
  );

  for (const business of catalog.business_cases) {
    const { template } = business;
    const invalid = () => new Error(`Invalid puzzle: ${business.key}`);
    switch (business.type) {
      case 'sequence':
        assertDistinct(business.template.initial, `${business.key} sequence entries`);
        assertDistinct(business.template.answer, `${business.key} sequence answers`);
        if (
          business.template.initial.length !== business.template.answer.length ||
          !business.template.initial.every((value) => business.template.answer.includes(value))
        )
          throw invalid();
        break;
      case 'deduction':
        assertDistinct(business.template.initial, `${business.key} answers`);
        if (!business.template.initial.includes(business.template.answer)) throw invalid();
        break;
      case 'matching':
        assertDistinct(business.template.answer, `${business.key} glyphs`);
        if (
          !business.template.answer.every(
            (glyph) => business.template.initial.filter((tile) => tile === glyph).length === 2,
          )
        )
          throw invalid();
        break;
      case 'choice':
        assertDistinct(template.initial, `${business.key} options`);
        assertDistinct(
          business.choice_effects.map((choice) => choice.kind),
          `${business.key} choice effects`,
        );
        break;
    }
  }

  const launchChapters = new Set(
    catalog.chapters.filter((chapter) => chapter.status === 'launch').map((chapter) => chapter.key),
  );
  const discoveries = new Set(catalog.discoveries.map((discovery) => discovery.key));
  for (const expedition of catalog.expeditions) {
    if (!launchChapters.has(expedition.chapter))
      throw new Error(`Unknown launch chapter for ${expedition.key}`);
    assertDistinct(
      expedition.approaches.map((approach) => approach.key),
      `${expedition.key} approaches`,
    );
  }
  for (const event of catalog.events) {
    assertDistinct(
      event.options.map((option) => option.id),
      `${event.key} option IDs`,
    );
    assertDistinct(
      event.options.map((option) => option.effect),
      `${event.key} option effects`,
    );
  }
  for (const chapter of catalog.chapters) {
    if (chapter.status !== 'launch') continue;
    const clues = chapter.guaranteed_clue_rules;
    assertDistinct(
      chapter.objectives.map((objective) => objective.key),
      `${chapter.key} objectives`,
    );
    assertDistinct(
      clues.map((clue) => clue.clue_key),
      `${chapter.key} guaranteed clues`,
    );
    for (const clue of clues) {
      if (!discoveries.has(clue.clue_key))
        throw new Error(`Unknown clue ${clue.clue_key} in ${chapter.key}`);
    }
    const clueObjective = chapter.objectives.find((objective) =>
      ['guaranteed_story_fragments', 'guaranteed_evidence_clues'].includes(objective.type),
    );
    if (clueObjective && clues.length < clueObjective.target)
      throw new Error(`Missing guaranteed clues for ${chapter.key}`);
  }
  return catalog;
}

// Keep this catalog server-side. Business templates contain puzzle solutions.
export const catalog = validateCatalog(seed);

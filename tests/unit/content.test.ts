import { describe, expect, it } from 'vitest';
import {
  catalog,
  editorialDeductionClues,
  editorialVersion,
  legacyCatalog,
  validateCatalog,
} from '../../packages/content/src';

import { expeditionEvents, missions } from '../../apps/api/src/expeditions/content';
describe('launch content', () => {
  it('contains all launch catalogs and two future chapter outlines', () => {
    expect(catalog.standing_orders).toHaveLength(3);
    expect(catalog.business_cases).toHaveLength(12);
    expect(catalog.expeditions).toHaveLength(7);
    expect(catalog.events).toHaveLength(24);
    expect(catalog.discoveries).toHaveLength(15);
    expect(catalog.modifiers).toHaveLength(5);
    expect(catalog.chapters.map(({ status }) => status)).toEqual([
      'launch',
      'launch',
      'future_outline',
      'future_outline',
    ]);
  });

  it('rejects an impossible deduction', () => {
    const broken = structuredClone(catalog);
    const deduction = broken.business_cases.find((entry) => entry.type === 'deduction');
    if (!deduction) throw new Error('Expected a deduction');
    deduction.template.answer = 'a non-existent option';
    expect(() => validateCatalog(broken)).toThrow('Invalid puzzle');
  });

  it('rejects missing guaranteed story clues', () => {
    const broken = structuredClone(catalog);
    broken.discoveries = broken.discoveries.filter(({ key }) => key !== 'prior_draft');
    expect(() => validateCatalog(broken)).toThrow('Unknown clue prior_draft');
  });
});

it('preserves seeded encounters, choices, and all Chronicle and discovery identities', () => {
  expect(catalog.expeditions.map(({ key }) => key)).toEqual(
    legacyCatalog.expeditions.map(({ key }) => key),
  );
  for (const [index, mission] of catalog.expeditions.entries()) {
    const legacy = legacyCatalog.expeditions[index]!;
    expect(mission).toEqual({
      ...legacy,
      title: mission.title,
      summary: mission.summary,
      story_beats: mission.story_beats,
      approaches: legacy.approaches.map((approach, slot) => ({
        ...approach,
        label: mission.approaches[slot]!.label,
        description: mission.approaches[slot]!.description,
      })),
    });
  }
  for (const [index, entry] of catalog.events.entries()) {
    const legacy = legacyCatalog.events[index]!;
    expect(entry).toEqual({
      ...legacy,
      title: entry.title,
      context: entry.context,
      options: legacy.options.map((option, slot) => ({
        ...option,
        label: entry.options[slot]!.label,
        consequence: entry.options[slot]!.consequence,
      })),
    });
    expect(entry.context).not.toBe(legacy.context);
    expect(
      entry.options.every(
        ({ consequence }, slot) => consequence !== legacy.options[slot]!.consequence,
      ),
    ).toBe(true);
  }
  expect(catalog.discoveries).toEqual(
    legacyCatalog.discoveries.map((entry, index) => ({
      ...entry,
      title: catalog.discoveries[index]!.title,
      text: catalog.discoveries[index]!.text,
    })),
  );
  expect(catalog.chapters).toEqual(
    legacyCatalog.chapters.map((entry, index) => {
      const revised = catalog.chapters[index]!;
      return entry.status === 'launch' && revised.status === 'launch'
        ? {
            ...entry,
            intro: revised.intro,
            recap: revised.recap,
            scenes: entry.scenes.map((scene, slot) => ({
              ...scene,
              text: revised.scenes[slot]!.text,
            })),
          }
        : { ...entry, intro: revised.intro };
    }),
  );
  expect(catalog.business_cases.filter(({ key }) => key !== 'pages_in_order')).toEqual(
    legacyCatalog.business_cases.filter(({ key }) => key !== 'pages_in_order'),
  );
});

it('uses the evidence clues with the original safe option and keeps seeded event slots identical', () => {
  const mission = missions.get('forgotten_archives')!;
  const safeChoices = new Map([
    ['absent_librarian', 'Read the original handwritten register.'],
    ['wrong_way_map', 'Navigate using the compass.'],
    ['mirror_archive', 'Use a mirror to read the lettering.'],
  ]);
  const seen = new Set<string>();
  for (let seed = 0; seed < 128; seed++) {
    const previous = expeditionEvents(
      mission,
      seed,
      'member',
      0,
      1200000,
      'corrupted_chronicle',
      1,
    );
    const current = expeditionEvents(
      mission,
      seed,
      'member',
      0,
      1200000,
      'corrupted_chronicle',
      editorialVersion,
    );
    expect(
      current.map(({ key, slot, availableAt, expiresAt }) => ({
        key,
        slot,
        availableAt,
        expiresAt,
      })),
    ).toEqual(
      previous.map(({ key, slot, availableAt, expiresAt }) => ({
        key,
        slot,
        availableAt,
        expiresAt,
      })),
    );
    for (const event of current) {
      if (!event.deductionClue) continue;
      seen.add(event.key);
      expect(event.options[0]).toMatchObject({
        id: 'option_1',
        label: safeChoices.get(event.key),
        effect: 'reliable_bonus',
      });
      expect(event.deductionClue).toBe(editorialDeductionClues[event.key]);
    }
  }
  expect(seen).toEqual(new Set(safeChoices.keys()));
});

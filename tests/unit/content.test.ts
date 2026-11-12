import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../../packages/content/src';

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

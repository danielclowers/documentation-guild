import { expect, it } from 'vitest';
import { businessEditorial, editorialVersion } from '../../packages/content/src';
import { caseMetadata, casePuzzle } from '../../apps/api/src/business/cases';
import { newCaseDefinitions } from '../../apps/api/src/business/new-cases';
import { nextCase } from '../../apps/api/src/business/selection';
import { caseReward } from '../../apps/api/src/business/rewards';
import type { BusinessAnswer, BusinessPuzzle } from '../../packages/shared/src';

function permutations(tiles: number[]): number[][] {
  return tiles.length <= 1
    ? [tiles]
    : tiles.flatMap((tile, index) =>
        permutations(tiles.filter((_, other) => index !== other)).map((rest) => [tile, ...rest]),
      );
}

function possible(view: BusinessPuzzle): BusinessAnswer[] {
  if (view.type === 'sequence')
    return permutations(view.tiles).map((tiles) => ({ type: 'sequence', tiles }));
  if (view.type === 'matching')
    return permutations([0, 1, 2, 3, 4, 5])
      .filter(([a, b, c, d, e, f]) => a === 0 && c! < e! && a! < b! && c! < d! && e! < f!)
      .map(([a, b, c, d, e, f]) => ({
        type: 'matching',
        pairs: [
          [a!, b!],
          [c!, d!],
          [e!, f!],
        ],
      }));
  return view.options.map(({ id }) => ({ type: view.type, option: id }));
}

it('provides a unique solvable answer for each generated puzzle and three valid paths for each tradeoff', () => {
  expect(newCaseDefinitions.size + 1).toBe(26);
  expect(Object.keys(businessEditorial)).toEqual(['pages_in_order', ...newCaseDefinitions.keys()]);
  for (const key of newCaseDefinitions.keys()) {
    const seen = new Set<string>();
    const seeds = [0, 42, 345619, 2452927471, 4294967295];
    for (const seed of seeds) {
      const instance = {
        id: 'known',
        character_id: 'member',
        position: 1,
        seed,
        template_key: key,
        attempts: 0,
        retry_at: 0,
        completed_at: null,
        content_version: 1,
      };
      const legacy = casePuzzle(instance);
      const { view, solve, outcome } = casePuzzle({
        ...instance,
        content_version: editorialVersion,
      });
      const answers = possible(view);
      const valid = answers.filter(solve);
      expect(valid, key + ' ' + seed).toHaveLength(view.type === 'choice' ? 3 : 1);
      expect(valid).toEqual(possible(legacy.view).filter(legacy.solve));
      expect(view.title).toBe(businessEditorial[key]!.title);
      expect(JSON.stringify(view)).not.toMatch(/<[a-z]+>/);
      expect(outcome()).not.toMatch(/<[a-z]+>/);
      if (view.type === 'matching') expect(new Set(view.tiles).size).toBe(6);
      if (view.type === 'deduction') {
        if (legacy.view.type !== 'deduction') throw new Error('Changed deduction type');
        expect(view.options).toEqual(legacy.view.options);
        if (newCaseDefinitions.get(key)?.family === 'patterns')
          expect(view.clues?.slice(1)).toEqual(legacy.view.clues?.slice(1));
      }
      if (view.type === 'choice') {
        if (legacy.view.type !== 'choice') throw new Error('Changed choice type');
        expect(view.options.map(({ id, effect }) => ({ id, effect }))).toEqual(
          legacy.view.options.map(({ id, effect }) => ({ id, effect })),
        );
        expect(new Set(view.options.map(({ effect }) => effect)).size).toBe(3);
        expect(new Set(view.options.map(({ id }) => outcome(id))).size).toBe(3);
      }
      seen.add(JSON.stringify(view));
    }
    expect(seen.size, key).toBeGreaterThan(1);
  }
});

it('keeps the numeric puzzle and only changes the new instance', () => {
  const row = {
    id: 'intro',
    character_id: 'player',
    position: 0,
    seed: 42,
    template_key: 'pages_in_order',
    attempts: 0,
    retry_at: 0,
    completed_at: null,
    content_version: 1,
  };
  const legacy = casePuzzle(row);
  const revised = casePuzzle({ ...row, content_version: editorialVersion });
  expect(revised.view).toMatchObject({
    prompt: businessEditorial.pages_in_order!.prompt,
    tiles: [3, 1, 4, 2],
  });
  expect(possible(revised.view).filter(revised.solve)).toEqual([
    { type: 'sequence', tiles: [1, 2, 3, 4] },
  ]);
  expect(revised.outcome()).toBe(
    'The pages are back in order. The apprentice can finish the binding.',
  );
  expect(legacy.outcome()).toBe('You restored the pages to their proper order.');
  expect(legacy.view.prompt).toBe('Arrange the numbered pages from lowest to highest.');
});

it('fills three varied slots and leaves room for a quick case and occasional advanced cases', () => {
  const board: string[] = [];
  const recent: string[] = [];
  const advanced = new Set<string>();
  for (let position = 0; position < 80; position++) {
    const next = nextCase(
      position,
      position < 20 ? 1 : 8,
      board,
      recent,
      Math.imul(position, 2654435761) >>> 0,
    );
    expect(board).not.toContain(next);
    expect(recent).not.toContain(next);
    board.push(next);
    const kinds = board.map((key) => caseMetadata.get(key)!);
    expect(kinds.filter(({ difficulty }) => difficulty === 'advanced').length).toBeLessThanOrEqual(
      1,
    );
    if (position < 20) expect(kinds.map(({ difficulty }) => difficulty)).not.toContain('advanced');
    if (caseMetadata.get(next)?.difficulty === 'advanced') advanced.add(next);
    if (board.length === 3) {
      expect(kinds.some(({ quick }) => quick)).toBe(true);
      expect(new Set(kinds.map(({ family }) => family)).size).toBeGreaterThan(1);
      recent.unshift(board.shift()!);
      if (recent.length > 10) recent.pop();
    }
  }
  expect(advanced.size).toBeGreaterThan(2);
});

it('calculates choice and training modifiers with the existing reward limits', () => {
  const modifiers = { specialization: 'Mender', researchRank: 3, scribingRank: 0 };
  expect(
    caseReward(
      { skill: 'Research', difficulty: 'advanced', attempts: 0 },
      modifiers,
      true,
      'discovery_roll',
    ),
  ).toMatchObject({
    xp: 35,
    skillXp: 16,
    gold: 20,
    discoveryChance: 30,
  });
  expect(
    caseReward(
      { skill: 'Restoration', difficulty: 'normal', attempts: 0 },
      modifiers,
      true,
      'guaranteed_gold',
    ),
  ).toMatchObject({ gold: 17 });
  expect(
    caseReward(
      { skill: 'Restoration', difficulty: 'normal', attempts: 3 },
      modifiers,
      false,
      'discovery_roll',
    ),
  ).toMatchObject({
    xp: 5,
    skillXp: 0,
    gold: 2,
    renown: 0,
    discoveryChance: 0,
  });
});

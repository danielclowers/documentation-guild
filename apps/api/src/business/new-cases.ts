import { type BusinessCopy, fragmentClue } from '@guild/content';
import type { BusinessAnswer, BusinessPuzzle, Skill } from '@guild/shared';
import { businessChoiceKinds } from '@guild/shared';

type Form<T> = T extends BusinessPuzzle
  ? Omit<T, 'id' | 'title' | 'skill' | 'difficulty' | 'attempts' | 'retryAt'>
  : never;
type Puzzle = Form<BusinessPuzzle>;
type Generated = {
  puzzle: Puzzle;
  solve: (answer: BusinessAnswer) => boolean;
  outcome: (option?: number) => string;
};
type Template = {
  title: string;
  skill: Skill;
  difficulty: 'normal' | 'advanced';
  family: 'fragments' | 'patterns' | 'investigation' | 'classification' | 'tradeoffs';
  quick?: boolean;
  build: (seed: number, copy?: BusinessCopy) => Generated;
};

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((seed / 2 ** 32) * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

const signs = ['Moth', 'Moon', 'Key', 'Fern', 'Lantern', 'Shell', 'Bell', 'Feather'];

function deduction(
  seed: number,
  prompt: string,
  clues: string[],
  choices: string[],
  outcome: string,
): Generated {
  const options = shuffled(choices, seed ^ 27).map((label, id) => ({ id, label }));
  const solution = options.find(({ label }) => label === choices[0])!.id;
  return {
    puzzle: { type: 'deduction', prompt, clues, options },
    solve: (answer) => answer.type === 'deduction' && answer.option === solution,
    outcome: () => outcome,
  };
}

function fragments(
  title: string,
  skill: Skill,
  prompt: string,
  rows: string[],
  outcome: string,
  difficulty: Template['difficulty'] = 'normal',
): Template {
  return {
    title,
    skill,
    family: 'fragments',
    difficulty,
    build(seed, copy) {
      const symbols = shuffled(signs, seed ^ 73);
      const order = shuffled(
        rows.map((_, index) => index + 1),
        seed ^ 9829,
      );
      const labels = Object.fromEntries(
        order.map((id, index) => [
          id,
          `[${index === 0 ? 'Opening' : symbols[index - 1]}] ${copy?.rows?.[index] ?? rows[index]} [${index === order.length - 1 ? 'End' : symbols[index]}]`,
        ]),
      );
      const tiles = shuffled(order, seed ^ 83467);
      return {
        puzzle: {
          type: 'sequence',
          prompt: copy?.prompt ?? prompt,
          clues: [
            copy
              ? fragmentClue
              : 'Match the seal at the end of one scrap to the seal at the start of the next.',
          ],
          labels,
          tiles: tiles.every((value, index) => value === order[index]) ? tiles.reverse() : tiles,
        },
        solve: (answer) =>
          answer.type === 'sequence' &&
          answer.tiles.length === order.length &&
          answer.tiles.every((value, index) => value === order[index]),
        outcome: () => copy?.outcome ?? outcome,
      };
    },
  };
}

function classify(
  title: string,
  skill: Skill,
  prompt: string,
  sets: [string, string][],
  outcome: string,
  difficulty: Template['difficulty'] = 'normal',
): Template {
  return {
    title,
    skill,
    family: 'classification',
    difficulty,
    quick: difficulty === 'normal',
    build(seed, copy) {
      const groups = shuffled(copy?.pairs ?? sets, seed ^ 6939).slice(0, 3);
      const tiles = shuffled(
        groups.flatMap(([first, second], group) => [
          { label: first!, group },
          { label: second!, group },
        ]),
        seed ^ 7507,
      );
      return {
        puzzle: {
          type: 'matching',
          prompt: copy?.prompt ?? prompt,
          tiles: tiles.map(({ label }) => label),
        },
        solve: (answer) =>
          answer.type === 'matching' &&
          answer.pairs.length === 3 &&
          new Set(answer.pairs.flat()).size === 6 &&
          answer.pairs.every(
            ([a, b]) => tiles[a] !== undefined && tiles[a]?.group === tiles[b]?.group,
          ),
        outcome: () => copy?.outcome ?? outcome,
      };
    },
  };
}

// Change the story around a deduction without changing its seeded choices or solution.
function writtenDeduction(
  seed: number,
  copy: BusinessCopy | undefined,
  variables: Record<string, string>,
) {
  const fill = (value: string) =>
    value.replace(/<([a-z]+)>/g, (_, key: string) => {
      const variable = variables[key];
      if (variable === undefined) throw new Error(`Unknown case placeholder ${key}`);
      return variable;
    });
  return (prompt: string, clues: string[], choices: string[], outcome: string) => {
    if (!copy) return deduction(seed, prompt, clues, choices, outcome);
    const revisedClues = copy.clues?.map(fill) ?? [fill(copy.clue!), ...clues.slice(1)];
    return deduction(seed, fill(copy.prompt), revisedClues, choices, fill(copy.outcome!));
  };
}

const investigators = ['Mira', 'Ivo', 'Oona', 'Pell', 'Nettle'];
function investigation(
  title: string,
  skill: Skill,
  setup: string,
  reason: string,
  variant: number,
  difficulty: Template['difficulty'] = 'normal',
): Template {
  return {
    title,
    skill,
    family: 'investigation',
    difficulty,
    build(seed, copy) {
      const [a, b, c] = shuffled(investigators, seed ^ 4901) as [string, string, string];
      const [one, two, three] = shuffled(signs, seed ^ 6023) as [string, string, string];
      const build = writtenDeduction(seed, copy, { a, b, c, one, two, three });
      if (variant === 0)
        return build(
          `${setup} If exactly one account is true, who carried the lantern?`,
          [
            `Choose among ${a}, ${b}, and ${c}. One carried it.`,
            `${a}: "${c} carried it."`,
            `${b}: "${c} did not carry it."`,
            `${c}: "${a} did not carry it."`,
          ],
          [a, b, c],
          `${a} carried it. The three statements would otherwise include at least two truths. ${reason}`,
        );
      if (variant === 1)
        return build(
          `${setup} Which seal belongs to ${b}?`,
          [
            `${a}, ${b}, and ${c} each own a different seal: ${one}, ${two}, or ${three}.`,
            `${c} owns neither ${one} nor ${two}.`,
            `${a} cannot own ${two}.`,
          ],
          [two, three, one],
          `${b} owns ${two}. The other two seals are accounted for. ${reason}`,
        );
      if (variant === 2)
        return build(
          `${setup} Identify the record whose time cannot be right.`,
          [
            `${a} worked before ${c}.`,
            `${b} worked after ${c}.`,
            `The records place ${a} first, ${c} last, and ${b} in the middle. The first record is verified. The middle record has a trusted clock seal.`,
          ],
          [c, b, a],
          `${c} had to work between the verified times, so the last record is inconsistent. ${reason}`,
        );
      if (variant === 3)
        return build(
          `${setup} Who has ${three}?`,
          [
            `${a}, ${b}, and ${c} each carried one different token: ${one}, ${two}, or ${three}.`,
            `Either ${a} had ${one} or ${b} had ${two}. Exactly one of those statements is true.`,
            `${c} had neither ${one} nor ${three}.`,
          ],
          [b, a, c],
          `${c} had ${two}, which means ${a} had ${one} and ${b} had ${three}. ${reason}`,
        );
      return build(
        `${setup} Which route meets every condition?`,
        [
          `The ${one} route is dry but closed after dusk.`,
          `The ${two} route is open after dusk, is dry, and needs no lantern.`,
          `The ${three} route is open after dusk but crosses water.`,
          'You must travel after dusk, stay dry, and have no lantern.',
        ],
        [two, three, one],
        `The ${two} route was the only dry path available after dusk. ${reason}`,
      );
    },
  };
}

function pattern(
  title: string,
  skill: Skill,
  setup: string,
  variant: number,
  difficulty: Template['difficulty'] = 'normal',
): Template {
  return {
    title,
    skill,
    family: 'patterns',
    difficulty,
    quick: variant === 0,
    build(seed, copy) {
      const [a, b, c, d] = shuffled(signs, seed ^ 89) as [string, string, string, string];
      const n = 1 + ((seed >>> 8) % 5);
      const build = writtenDeduction(seed, copy, { a, b, c, d });
      if (variant === 0)
        return build(
          setup,
          [
            'Each group starts with the same two seals. The third seal can vary.',
            `${a} · ${b} · ${c} | ${a} · ${b} · ${d} | ${a} · ? · ${c}`,
          ],
          [b, c, d],
          `${b} belongs in the second position in each group. The pattern is restored.`,
        );
      if (variant === 1)
        return build(
          setup,
          [
            'The two halves mirror each other across the central tile.',
            `${a} · ${b} · ${c} · ${d} · ${c} · ? · ${a}`,
          ],
          [b, a, d],
          `The missing tile mirrors ${b} on the other side of the center.`,
        );
      if (variant === 2)
        return build(
          setup,
          [
            'Count the distance between neighboring numbers. The amount added rises by one each time.',
            `${n} · ${n + 2} · ${n + 5} · ${n + 9} · ?`,
          ],
          [String(n + 14), String(n + 13), String(n + 15)],
          'The gaps rise from two to three to four, so the next gap is five.',
        );
      if (variant === 3)
        return build(
          setup,
          [
            'Each row and each column should contain each of the three seals exactly once.',
            `Row 1: ${a} · ${b} · ${c}`,
            `Row 2: ${b} · ${c} · ${a}`,
            `Row 3: ${c} · ? · ${b}`,
          ],
          [a, b, c],
          `Only ${a} completes both the row and the column.`,
        );
      return build(
        setup,
        [
          'Two different ribbons alternate. On each ribbon, the ends match and the middle is different.',
          `From left to right: ${a} · ${c} · ${b} · ${d} · ? · ${c}`,
        ],
        [a, b, d],
        `Reading alternate positions gives ${a}, ${b}, ${a} on the first ribbon and ${c}, ${d}, ${c} on the second.`,
      );
    },
  };
}

function tradeoff(
  title: string,
  skill: Skill,
  prompt: string,
  paths: [string, string, string],
  outcomes: [string, string, string],
): Template {
  return {
    title,
    skill,
    family: 'tradeoffs',
    difficulty: 'normal',
    quick: true,
    build(seed, copy) {
      const options = shuffled(
        paths.map((label, id) => ({
          id,
          label: copy?.options?.[id]?.label ?? label,
          effect: businessChoiceKinds[id],
        })),
        seed ^ 139,
      );
      return {
        puzzle: { type: 'choice', prompt: copy?.prompt ?? prompt, options },
        solve: (answer) =>
          answer.type === 'choice' && options.some(({ id }) => id === answer.option),
        outcome: (option) =>
          copy?.options?.[option ?? 0]?.outcome ?? outcomes[option ?? 0] ?? outcomes[0],
      };
    },
  };
}

export const newCases = {
  moth_almanac: fragments(
    'The Moth Almanac',
    'Scribing',
    'Reassemble the colophon of an almanac eaten at both ends.',
    [
      'A moth arrives at dusk.',
      'It studies the lantern.',
      'It mistakes the moon for a second lantern.',
      'It leaves a speck of silver in the margin.',
    ],
    'The restored colophon explains the silver dust in the binding.',
  ),
  bell_log: fragments(
    'The Bellkeeper’s Log',
    'Research',
    'A gust scattered the bellkeeper’s account. Recover the sequence using its seals.',
    [
      'At dawn the bell fails to ring.',
      'The keeper checks the rope.',
      'A sparrow has tied it to a beam.',
      'The keeper rings once for the sparrow.',
    ],
    'The morning bell rings again, one sparrow later than usual.',
  ),
  rain_archive: fragments(
    'The Rain Archive',
    'Restoration',
    'Rejoin the leaves of a water-damaged field journal.',
    [
      'A rain jar collects the first drop.',
      'The drop holds a picture of the road.',
      'The road turns silver under a second drop.',
      'The picture fades when the jar is capped.',
    ],
    'The repaired leaves can be copied before the next rain.',
  ),
  borrowed_sunset: fragments(
    'A Borrowed Sunset',
    'Scribing',
    'Recover the five linked sections of a folded letter.',
    [
      'The sender requests five minutes of daylight.',
      'The ferryman carries the request west.',
      'The horizon agrees to lend a glow.',
      'The lanternmaker catches it in amber glass.',
      'The sender returns the light before dawn.',
    ],
    'The lantern catalogue now records where its unusual glow came from.',
    'advanced',
  ),
  map_in_margin: fragments(
    'The Map in the Margin',
    'Research',
    'Read the torn map notes in their original order.',
    [
      'Start at the dry well.',
      'Follow the path marked with a fern.',
      'Turn when the stone steps begin.',
      'The third step faces an iron gate.',
    ],
    'The missing path is legible again.',
  ),
  stitched_song: fragments(
    'The Stitched Song',
    'Restoration',
    'Rebuild the stitched liner of a music folio.',
    [
      'The song opens with a low hum.',
      'A second voice joins from the gallery.',
      'The refrain lasts one lantern’s worth of oil.',
      'The final note is held through the rain.',
      'The singer closes the book.',
    ],
    'The binding holds, and all five parts of the song can be read.',
    'advanced',
  ),
  repeat_stamp: pattern(
    'The Repeat Stamp',
    'Scribing',
    'Which seal belongs in the unfinished impression?',
    0,
  ),
  mirrored_lantern: pattern(
    'The Mirrored Lantern',
    'Restoration',
    'Replace the missing tile in a mirrored lantern frame.',
    1,
  ),
  stair_marks: pattern(
    'The Stair Marks',
    'Research',
    'Work out what number belongs on the next stair marker.',
    2,
  ),
  nine_seals: pattern(
    'The Nine Seals',
    'Scribing',
    'Complete the damaged seal grid.',
    3,
    'advanced',
  ),
  braided_ribbons: pattern(
    'The Braided Ribbons',
    'Restoration',
    'Find the missing mark on two ribbons folded together.',
    4,
    'advanced',
  ),
  lantern_accounts: investigation(
    'Three Conflicting Witnesses',
    'Research',
    'Three witnesses remember the same lantern differently.',
    'The lantern can now be returned to its keeper.',
    0,
    'advanced',
  ),
  seal_cabinet: investigation(
    'The Seal Cabinet',
    'Scribing',
    'The cabinet labels have come loose.',
    'The cabinet is arranged before the clerk returns.',
    1,
  ),
  night_shift: investigation(
    'A Shift Out of Order',
    'Scribing',
    'Someone copied a line of the watch rota incorrectly.',
    'The copied line is corrected in the archive.',
    2,
  ),
  pocket_token: investigation(
    'The Pocket Token',
    'Research',
    'Three visitors donated tokens to the archive.',
    'The last token is logged under the right name.',
    3,
    'advanced',
  ),
  flooded_path: investigation(
    'A Dry Way Home',
    'Restoration',
    'Choose how to carry a fragile book home after a flood.',
    'The book arrives dry.',
    4,
  ),
  hearth_kit: classify(
    'The Hearth Kit',
    'Restoration',
    'Pair each damaged object with the tool most suited to repairing it.',
    [
      ['Loose binding', 'Binder’s needle'],
      ['Rusty hinge', 'Fine wire brush'],
      ['Cracked wax seal', 'Seal warmer'],
      ['Damp leaf', 'Blotting sheet'],
    ],
    'Every repair kit now has the right tool.',
  ),
  night_garden: classify(
    'Notes from the Night Garden',
    'Research',
    'Pair each specimen with its most likely trace.',
    [
      ['Moth', 'Powdered wing scales'],
      ['Snail', 'Silver trail'],
      ['Crow', 'Black flight feather'],
      ['Rabbit', 'Paired long hind prints'],
    ],
    'The gardener can identify the visitors from their traces.',
  ),
  messages_sorted: classify(
    'The Misaddressed Basket',
    'Scribing',
    'Pair each note with its recipient.',
    [
      ['Oil for the east lamp', 'Lamplighter'],
      ['The last ferry leaves at dusk', 'Ferryman'],
      ['A string snapped before the song', 'Harpist'],
      ['Please reserve a dry bed for the bulbs', 'Gardener'],
    ],
    'All the notes have reached the right person.',
  ),
  residue_test: classify(
    'The Residue Test',
    'Research',
    'Match each observation to the material it identifies.',
    [
      ['Melts beside a candle', 'Wax'],
      ['Sticks to a magnet', 'Iron filings'],
      ['Dissolves in water and leaves crystals when dry', 'Salt'],
      ['Flakes off in black flakes after burning', 'Charcoal'],
    ],
    'The unknown residue is identified without damaging the folio.',
    'advanced',
  ),
  cabinet_labels: classify(
    'The Cabinet of Near Things',
    'Restoration',
    'Match each object to the conditions that will preserve it.',
    [
      ['Pressed flowers', 'Dry folder'],
      ['Living fern', 'Moist soil'],
      ['Brass clasp', 'Padded drawer'],
      ['Loose seeds', 'Labeled envelope'],
    ],
    'The cabinet is ready for another season.',
  ),
  spare_oil: tradeoff(
    'One Flask of Lamp Oil',
    'Restoration',
    'You have one spare flask. Decide where it will do the most good.',
    [
      'Sell it to the night ferryman.',
      'Light the sealed cabinet while it is opened.',
      'Refill the guild’s common lantern.',
    ],
    [
      'The ferryman paid for a safer crossing.',
      'The cabinet’s back panel was finally visible.',
      'The guild’s doorway stayed lit for the late watch.',
    ],
  ),
  market_map: tradeoff(
    'The Market Map',
    'Scribing',
    'There is time to make one copy of a rare map. Where should it go?',
    [
      'Take a merchant’s commission.',
      'Trace the faint marks behind the roads.',
      'Make a copy anyone in the guild can consult.',
    ],
    [
      'The merchant paid for a clean copy.',
      'The tracing exposed markings a copy would have missed.',
      'The reference copy went beside the guild door.',
    ],
  ),
  fog_ribbons: tradeoff(
    'Ribbons in the Fog',
    'Research',
    'You can follow only one lead before the mist lifts.',
    [
      'Guide the ferry in exchange for a fee.',
      'Follow the ribbon nobody remembers tying.',
      'Mark the safe bank for the guild.',
    ],
    [
      'The ferry paid its guide.',
      'The odd ribbon led deeper into the fog.',
      'Your markings made the bank safer for everyone.',
    ],
  ),
  one_press: tradeoff(
    'The Last Pull of the Press',
    'Scribing',
    'The press has enough ink for one final sheet tonight.',
    [
      'Print a paid broadside for the inn.',
      'Print the runes from an unreadable plate.',
      'Print directions that everyone in the guild can use.',
    ],
    [
      'The innkeeper paid for the warmest broadside in town.',
      'The impression pulled faint marks out of the old plate.',
      'The directions were pinned where the whole guild could read them.',
    ],
  ),
} satisfies Record<string, Template>;

export const newCaseDefinitions = new Map<string, Template>(Object.entries(newCases));

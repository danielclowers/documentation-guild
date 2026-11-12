# 02. Launch content and narrative design

This file defines the creative direction and catalog requirements. **`CONTENT-SEED.json` contains the initial machine-readable content** and is part of the authoritative handoff. Codex should validate/import the JSON or adapt it to strongly typed content modules; it must not replace it with empty placeholder arrays.

## Tone guide

Cozy fantasy with genuine mystery and warm humor. The kingdom has magical histories, forgotten authors, odd libraries, and well-meaning scholars. Workplace references (broken references, conflicts, revision histories, footnotes) appear lightly, and need no knowledge of Red Hat or OpenShift to understand. Names, dialogue and events are fictional; never name or satirize real coworkers without their permission. Stories are readable in 1-3 short paragraphs per step, with a few optional choices.

## Campaign: The Unwritten Chronicle

**Premise:** The Royal Chronicle records the history of the kingdom, and now pages are vanishing from it. The lost events are also fading from people's memories. The Documentation Guild is tasked with recovering evidence and learning whether the omissions are an accident, magic or an intentional revision.

- **Chapter 1: The Missing Pages (playable launch).** Introductory library reports missing pages. The guild recovers two guaranteed fragments and reveals that the chapter numbers remain consistent despite the missing content. Ends with a clue bearing the signature of a forgotten historian.
- **Chapter 2: The Forgotten Author (playable launch).** Multiple contradictory accounts mention a historian whose name was erased from the records. Recover evidence from expeditions; chapter conclusion reveals an encoded instruction, 'Seek the version before the first revision.'
- **Chapter 3: The Forbidden Revision (outline for later).** Recover an earlier copy of the Chronicle; uncover a hidden editor who changed people's memories in an attempt to prevent a disaster.
- **Chapter 4: The Final Draft (outline for later).** The guild confronts the cost of restoring all memories and chooses a hopeful resolution; no permanent faction split, story lockout or loss of player rewards.

Late joiners can read all completed chapter recaps and complete introductory content regardless of the guild's current chapter. If a quest gives a **required** story clue, guarantee it after a bounded number of completions; optional discoveries may remain random. Chapter progress is server-wide and persists permanently.

## Launch activity catalog

`CONTENT-SEED.json` includes:

- 3 standing orders (Scribing, Research, Restoration) as fixed skill activities.
- 12 Guild Business cases, deliberately split between sequence puzzles, deductions, meaningful choices and short manuscript-repair interactions, not just 12 rewordings of an identical 4-piece sort.
- 7 cooperative expeditions (1 introductory 10-minute mission and 6 standard 20-minute missions); 2-4 members each. Any party composition works, but Research/Scribing/Restoration roles influence optional rewards and event text.
- 24 text events with three options each, available as short personal optional expedition challenges. All events have associated skill checks or declared tradeoffs; no visual-specific art dependencies.
- 15 journal discoveries, including two three-part mystery arcs and light humorous one-off discoveries.
- 5 reusable expedition modifiers that adjust text/challenge conditions and rewards without adding scenery.
- Two complete initial story chapters with objectives and recap, two future chapter outlines.

## Named launch expeditions

| Key | Name | Role in launch |
|---|---|---|
| `missing_pages` | The Missing Pages | 10-minute introductory co-op, easiest story clue |
| `forgotten_archives` | The Forgotten Archives | Recover indexed records and hidden annotations |
| `whispering_library` | The Whispering Library | Hear a book narrating events that never occurred |
| `lost_index` | The Missing Index | Reconstruct the route through a hidden collection |
| `lantern_vault` | The Lantern Vault | Solve a light-and-symbol puzzle without new map art |
| `inkwell_catacombs` | The Inkwell Catacombs | Unusual ink, vanished seals and restoration choices |
| `historian_study` | The Historian's Study | Chapter 2 evidence, conflicting drafts and clues |

Expeditions are text and reusable icon cards; player avatars depart through the **same guild hall door**. There are no dedicated dungeon environments in launch scope.

## Concrete interactive challenge contracts

1. **Sequence:** A seeded 4-5 tile reordering puzzle, with visible ordering rule and accessible move/swap buttons. Example introductory order [3, 1, 4, 2] -> [1, 2, 3, 4]. A pure library function verifies order. Award once.
2. **Deduction:** A short three-clue reasoning situation with three answers. The answer and explanation live on the backend; player sees readable hints. A wrong answer may be retried for reduced bonus, never prevents main expedition completion.
3. **Choice/tradeoff:** Three explicit options with differing upside. A careful approach yields reliable gold, a risky approach offers a seeded discovery chance, a supportive approach adds guild renown. Effects must be observable, not three buttons that all award the same thing.
4. **Restoration / matching:** A tiny 3x2 glyph-pair matching game with 3 pairs of reusable symbols. No random-art creation; challenge seed determines layout; timer is optional, never reaction-speed-based.

**Individual Guild Business** uses these mechanics independently. **Expedition opportunities** reuse them but resolve per player and aggregate shared bonus eligibility without requiring the party to respond together.

## Content authoring guidelines

- Every quest has unique key, title, concise flavor, skill, estimated duration, difficulty, reward tier, and a type. Every event has a context, three distinct decisions, consequence text and a deterministic effect descriptor, with translations to actual server-side reward behavior.
- Every discovery has key, title, journal entry, rarity and optional prerequisite/story chain connection. Discovery text is prewritten, not generated by an AI runtime.
- Server owns puzzle answer, outcomes and seeded randomness; don't ship secret solutions in the static UI or allow client to claim a discovered key by POSTing it directly.
- Case content must be actually fun in repeated use. Include a variety of rules, rather than superficial renaming of the same swap puzzle. Randomization is constrained so it never creates an unsolvable puzzle.
- No consumable items, collectible decorations, equipment loot, hairstyles as rewards or familiar creatures.

## First-time player sample text

> Welcome to the Documentation Guild. The kingdom's stories are in safe hands. Mostly.
>
> Choose a standing order. Your adventurer will keep working while you tend to other matters.
>
> A novice has scattered the pages of a manuscript. Can you put them back in order?
>
> Greater mysteries are best faced together. When another guild member is ready, visit the Expedition Board.

A couple of amusing event titles: **The Unending Footnote**, **The Great Ink Shortage**, **The Manuscript That Was Never Written**. These are humorous details in a mostly sincere cozy mystery setting.

## Writing and content QA

Content assets must pass JSON schema validation, duplicate key checks, valid prerequisite references, accessible event alternatives, guaranteed story clue reachability and detection of circular chapter requirements. All player-visible text must be readable at a glance, free of real coworker data, and not dependent on technical-writing jargon to make sense.

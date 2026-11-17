# Progression forecast

The November 17, 2026 character curve uses `Math.floor(12863 * ((level - 1) / 19) ** 2.1)` through the existing shared progression utilities. Character levels run from 1 to 20 and are calculated from saved cumulative XP whenever profiles, hall members, or level gates are evaluated.

## Character thresholds and passive timing

Passive time counts complete five-minute standing-order payouts at 3 character XP per cycle. Offline intervals and time on expeditions contribute zero standing-order time. All three standing orders have the same character XP rate.

| Level | Cumulative character XP | Connected passive time |
| --- | --- | --- |
| 1 | 0 | 0m |
| 2 | 26 | 0h 45m |
| 3 | 113 | 3h 10m |
| 4 | 266 | 7h 25m |
| 5 | 487 | 13h 35m |
| 6 | 779 | 21h 40m |
| 7 | 1,143 | 31h 45m |
| 8 | 1,580 | 43h 55m |
| 9 | 2,091 | 58h 05m |
| 10 | 2,678 | 74h 25m |
| 11 | 3,341 | 92h 50m |
| 12 | 4,082 | 113h 25m |
| 13 | 4,900 | 136h 10m |
| 14 | 5,797 | 161h 05m |
| 15 | 6,773 | 188h 10m |
| 16 | 7,829 | 217h 30m |
| 17 | 8,966 | 249h 05m |
| 18 | 10,183 | 282h 55m |
| 19 | 11,482 | 319h 00m |
| 20 | 12,863 | 357h 20m |

An eight-hour first day produces 288 character XP and Level 4. Training at Level 3 becomes eligible at 113 XP, after 3h 10m of passive time. Its first rank still costs 100 gold, so a purely passive Scribing player needs 2h 50m for the gold and a Research or Restoration player needs 4h 10m. Specialization at Level 10 becomes eligible at 2,678 XP, after 74h 25m. Level 20 starts at 12,863 XP and takes 357h 20m of passive time.

Each successive level requires more XP than the previous one. The Level 19-to-20 gap is 1,381 XP, about 38h 25m of passive time, compared with the former gap of 1,133 XP. Every new cumulative threshold through Level 19 is lower than its former value.

## Workday scenarios

These estimates start from a fresh character on a Monday, online five days per week. The 7-, 14-, 30- and 60-calendar-day checkpoints contain 5, 10, 22 and 44 workdays. Gold is cumulative gross earned before spending. Optional expedition XP and gold are expected values rounded at the checkpoint.

| Player | Day 7 | Day 14 | Day 30 | Day 60 | Reaches Level 20 |
| --- | --- | --- | --- | --- | --- |
| Casual, 2 connected hours per workday | Lv 4 · 360 XP · 360 gold | Lv 5 · 720 XP · 720 gold | Lv 8 · 1,584 XP · 1,584 gold | Lv 10 · 3,168 XP · 3,168 gold | Day 249 · 179 workdays |
| Typical, 8 connected hours per workday | Lv 7 · 1,440 XP · 1,440 gold | Lv 10 · 2,880 XP · 2,880 gold | Lv 14 · 6,336 XP · 6,336 gold | Lv 19 · 12,672 XP · 12,672 gold | Day 61 · 45 workdays |
| Engaged, 8 connected hours, 4 cases and 1 expedition per workday | Lv 9 · 2,394 XP · 1,988 gold | Lv 12 · 4,827 XP · 4,005 gold | Lv 18 · 10,785 XP · 8,917 gold | Lv 20 · 21,672 XP · 17,898 gold | About day 37 · 27 workdays |

## Simulation assumptions

- Passive players use Scribing. Each complete five-minute cycle earns 3 character XP, 5 Scribing XP and 3 gold. Research and Restoration pay 2 gold with the same XP. By Day 60 those alternatives earn 2,112 gold on the casual schedule or 8,448 on the typical schedule. Partial cycles carry across sessions. One cycle per settlement gives Chronicler zero extra gold because its 10% bonus rounds down.
- The engaged scenario uses the implemented 26-case selection, including its three queued cases, recent-history avoidance and advanced availability from Level 3. The deterministic case seed stream starts at `0x5eed` and advances with the existing LCG constants 1664525 and 1013904223. The player completes the oldest queued case at 09:30, 09:50, 10:10 and 10:30 on each workday, with no retry penalty. Replacements use the character's current level. This produces 1 introductory, 147 standard and 28 advanced completions by Day 60. Four daily completions at the same times fit the eight full-reward slots in a rolling 24-hour window.
- Standard and introductory cases pay 20 character XP, 10 skill XP and 12 gold. Advanced cases pay 35 character XP, 16 skill XP and 20 gold. Tradeoff cases take the +4 gold choice. Three incorrect attempts would apply the existing 75% XP, skill XP and gold multiplier, rounded down. Extra cases beyond the allowance pay 5 character XP and 2 gold with zero skill XP, renown or discovery chance.
- At each workday's start the engaged player buys one next Efficient Scribing rank when eligible and affordable, using the existing prices of 100, 200 and 350 gold. Editor is chosen at the first workday start at Level 10. Case gold uses the actual reward utility, including rank bonuses, specialization bonuses, the 25% cap and rounding on each reward. The three purchases absorb 650 gold, leaving about 17,248 gold at Day 60 in this scenario.
- The engaged player has an available partner and departs at 16:00, taking the 10-minute tutorial on the first workday and a 20-minute standard Chapter 1 mission on later workdays. Standing orders pause throughout the trip, then resume until 17:00. Baseline rewards use the existing 60/110/140 character XP, 20/35/45 role skill XP and 35/60/80 gold for tutorial/standard/advanced missions. The main scenario uses Scribing as the expedition role.
- Expected optional rewards use one tutorial challenge and 1.5 challenges per standard mission, the current catalog's event skills, skill XP at departure, the careful approach's +5 points and the safe option's +10 points. Success chances use the actual utility and its 30–95% bounds. A successful challenge averages 15 character XP and 10 gold. Shared renown and discoveries add zero character XP and gold. Expedition Readiness is left untrained in this scenario.
- If Chapter 2 and an eligible party permit advanced expeditions from workday 11, expected Day 60 totals rise to about 22,646 XP and 18,547 gross gold, reaching Level 20 around day 36. Eight cases each workday, 20 minutes apart from 09:30, with the standard expedition schedule produce about 25,672 XP and 20,559 gold, reaching Level 20 around day 31. These estimates depend on case timing and party availability.

## Balance implications

The same four-case schedule simulated with the former character curve reaches Level 20 on the same workday 27. Earlier Editor eligibility adds about 5 gold by Day 60 in this seed stream. Other schedules can gain more from earlier advanced case eligibility, training or access to advanced expeditions. The passive XP requirement to reach the cap is exactly the same.

Earlier unlocks give new players useful choices during their first workday. An existing character with 315 XP becomes Level 4, and one with 3,633 XP becomes Level 11. Reading their profile does not award XP or change any saved reward or purchase.

Later levels take longer individually, so players will notice a slower pace as they approach the cap. Skill levels retain their existing thresholds and may lag the new character level early on. Optional expedition success still depends on skill XP, roles and training.

Gold sinks are still limited to training and specialization changes. The engaged model earns about 8,809 XP beyond the cap by Day 60 and retains substantial gold after training. Additional Guild Business and repeat expeditions remain available under the existing rules. Player activity and party availability will determine how much earlier feature access affects actual cap times.

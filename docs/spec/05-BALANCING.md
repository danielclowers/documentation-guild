# 05. Game economy, balance and progression constants

These are **launch defaults**, not externally sourced facts. Implement in versioned `balance.ts` or JSON plus **pure server-shared functions** and tests. All calculation/exchange happens on the backend. Favor readable formulas and obvious incremental tuning over complex simulation. Run quick 1-day, 7-day and 30-day simulations to detect runaway farming.

## Currency and caps

- `character_xp` (overall), `skill_xp` per skill, `gold` (personal, spendable), `guild_renown` (non-spendable shared progress), `discoveries` (unique journal records). No other economy on launch.
- Level range 1-20; the cap is not a reset. XP continues accumulating at cap for a future extension but grants no additional powers until unlocked by content update.
- Character XP total required to reach level `L`: `T(L) = floor(70*(L-1)^1.75 + 40*(L-1))`; L=1 requires 0. Skill XP for skill level `S`: `U(S) = floor(45*(S-1)^1.65 + 25*(S-1))`, levels 1-20 at launch.
- Recompute levels from cumulative XP, do not store level as an independently mutable authority (cached level permitted with invariant test). No loss of XP on failure, specialization change or missed day.
- Character gold defaults to 0; training spending cannot put balance below 0; `gold` bounded by safe integer with overflow checks. One character per member and unique reward ledger events.

## Standing orders

All three options repeat forever until changed; standing orders exist for offline characters, including disconnected players; presence does not influence earning speed. Every 5 **eligible elapsed minutes** pay:

| Standing order | Character XP | Skill XP (selected) | Gold |
|---|---:|---:|---:|
| Scribing | 3 | 5 | 3 |
| Research | 3 | 5 | 2 |
| Restoration | 3 | 5 | 2 |

- Settle based on elapsed eligible time divided into complete 5-minute units; carry fractional elapsed remainder forward, never round up. For switching orders, settle old interval first and assign new order atomically.
- **Offline earning cap:** maximum 24 hours of eligible standing-order time can accumulate per user between settlement events while disconnected, counting across all offline periods. On online reconnection, settle up to cap; time beyond cap is forfeited without punitive messaging. Online but idle earns normally.
- If expedition overlaps the accrual window, exclude the overlap: standing order pauses at `started_at`, resumes at `ends_at`; scheduled backend reconciliation can be late without affecting exclusion.
- Stable background behaviors (moving, stretching, coffee break, waving) do not change reward rate.
- Chronicler: +10% standing-order Scribing gold only; rounding down at batch settlement. All other training/perks capped at a 25% combined standing-order rate increase so idle does not eclipse interactive play.

## Individual Guild Business

- Target 3 available personal cases at a time; refill from diverse templates when one completes. Avoid immediate repeats of the same template until at least two other types are seen (unless content pool exhausted).
- Cases take roughly 30 sec to 3 min; accessible while on expedition (no avatar movement). Server generates case seed and stores expected outcomes; never accept client-provided correct answer flags.
- Completion award per normal case: `20 character XP`, `10 skill XP` in associated skill, `12 gold`; optional rare clue roll 8% when eligible, seeded once. For a difficult case: `35 character XP`, `16 skill XP`, `20 gold` and 12% optional clue roll.
- After first **8** reward-bearing cases in a rolling 24-hour period, further cases remain playable but award only `5 character XP` and `2 gold` (no rare roll), to discourage rapid repeat-farming without introducing daily chores.
- Choices are not always wrong/right; choose meaningful tradeoffs (safe gold, research clues, guild renown) with displayed likelihoods or understandable narrative. No hidden penalties to already earned money.
- Puzzle submission: allow retry with mild diminishing case reward after >2 incorrect guesses; do not prevent completion or punish misclicks permanently. Server enforces attempts and cooldowns.

## Expeditions

- First tutorial cooperative expedition: 10 minutes, 2-4 members, guaranteed `60 character XP`, `20 role skill XP`, `35 gold`, `10 guild renown` per participant.
- Standard: 20 minutes, 2-4 members, baseline `110 character XP`, `35 role skill XP`, `60 gold`, and `15 guild renown` **per participant**. Guild renown stored once per unique member/party award, not once per repeated API call.
- Harder 20-minute mission: `140 character XP`, `45 skill XP`, `80 gold`, `20 guild renown`; unlock with clear level guideline, allow a low-level player to join if at least one member meets the recommended level; give fair minimum contribution and never zero out their rewards.
- Every member gets **one guaranteed optional event** roughly 40% into a standard expedition, plus a second event with 50% seeded probability around 70%; maximum 2 **per member**. Intro expedition has one event. Events can be accessed once available and through 24 hours after the recorded expedition finish time. Events do not block end time.
- Each successful optional event: award 10-20 additional XP and 5-15 gold, plus 5 guild renown when specifically tagged co-op. If at least 2 distinct party members complete optional events within window, award a one-time 20-renown party bonus. With 3+ distinct participants contributing, add a one-time shared optional discovery eligibility roll (15%). If only 2 people are in party, the team can reach a meaningful max reward without a third member; do not require 3 or 4 participants for an exclusive required unlock.
- `Baseline` expedition outcome is never reduced by unlucky rolls or uncompleted optional events. Skill checks influence additional narrative outcomes, discovery odds or small bonus awards; no mission failure that wastes time.
- Seeded roll: recommended `success_chance = clamp(55 + 3*(skill_level - recommended_skill) + spec_bonus + strategy_bonus, 30, 95)` percent. `spec_bonus` 0-10; `strategy_bonus` -5 to +10 depending on event. Use reproducible, server-generated seed per event and record decision/result so retries can't reroll undesired outcomes. Don't expose future random outcomes in frontend payload.
- Expedition roles: Research raises hidden clue chance; Restoration improves difficult challenge success; Scribing improves the party's bonus gold/renown from recorded findings. Each must produce visible log entries and at least one quantifiable effect.

## Specializations at overall level 10

Only one primary spec can be active. Cost to switch: 200 gold, 24-hour cooldown between switches. No skill XP loss.

| Specialization | Launch rule |
|---|---|
| Chronicler | +10% standing-order Scribing gold (round down) |
| Editor | +15% gold on completed Scribing Guild Business cases, round down |
| Archivist | +8 percentage points to optional rare discovery roll on Research-related expedition opportunities, max 30% total |
| Investigator | One additional attempt on **one** failed optional deduction per expedition; same fixed outcome seed unless the challenge's underlying input changed; retry can improve result via a new approach, not brute-force RNG |
| Mender | +10% gold on Restoration Guild Business cases |
| Warden | +10 points on difficulty-based Restoration event checks, capped at 95% |

Perks should be tested against exploit loops. `+8 percentage points` is additive, not 8% multiplicative.

## Gold training (three ranks each)

Each rank costs 100, 200, then 350 gold, and remains purchased permanently. Example upgrades:

- `efficient_scribing`: Scribing Guild Business gold bonus +3% per rank (additional to Editor, but subject to overall cap).
- `careful_research`: +2 percentage points success chance per rank on research puzzles/choices.
- `expedition_readiness`: +2% **optional** expedition XP per rank (not baseline XP, prevents runaway passive XP).
- `steady_hands`: +2 percentage points Restoration event success chance per rank.

Allow first rank purchases after level 3. Four upgrades, not a sprawling skill tree. Respec does not refund purchased training; all upgrades remain useful regardless of primary specialization.

## Guild progression and campaign

- Renown level thresholds: levels 1-6 at total guild renown `[0, 250, 700, 1400, 2400, 3800]`. No renown reset. Each guild level gives one transparent functional bonus, e.g., extra case template pool, alternative expedition choice, or +2% baseline expedition gold (cap +10% total). **No new map, furniture or outfit art**.
- Chapter 1 objectives: complete 3 eligible cooperative expeditions, contribute 300 Renown, and recover two guaranteed story fragments. Chapter 2 unlocks at completion, not a calendar date. Chapter 2 objectives: 5 eligible expeditions, 700 chapter-specific renown contributions and three evidence clues; ensure guaranteed clues can be found by ordinary expeditions with no rarity gate.
- Guild campaigns are collective; do not charge a player for arriving after campaign completion. Previous chapters readable any time.
- Repeated party creation/cancellation confers no XP, gold or renown. Emotes grant none. Guild Business can feed minor Chronicle objectives but cannot replace cooperative expedition thresholds.

## Estimated pacing and review triggers

A frequent but not obsessed weekday player who keeps the app open and completes ~4 Business cases and 1 expedition should earn roughly 300-500 overall XP/day depending on activity. Level 10 expected after about 1-3 weeks of regular use, level 20 after several weeks. These are targets, **not guarantees**. Run deterministic time simulations with several playstyles, and tune before declaring release-ready:

- Casual: browser closed most of the day, 2 short check-ins, 0-1 expeditions/week.
- Typical: 2-5 check-ins/day, ~3 Business cases/day, 1 expedition/day if a party is available.
- Engaged: 5-10 check-ins/day, ~8+ cases, 2 expeditions/day.
- AFK: leaves game open for 5 days with no clicks; gains standing-order XP/gold but substantially fewer discoveries and guild expedition rewards than actively playing.
- Absent: no login for 7 days; gains at most 24h capped standing-order credit on return, loses no permanent progress, no expired story access.

**Play balance acceptance:** after 30 simulated days, no infinite gold loops or XP overflow; active play is rewarding but not mandatory; missing a week doesn't create an insurmountable difference; low-level member contributes meaningfully to party with high-level members; every party size 2, 3 or 4 can reach worthwhile optional bonuses.

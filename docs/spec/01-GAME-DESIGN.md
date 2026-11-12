# 01. Definitive game design

## Vision, players and non-negotiables

**Name:** The Documentation Guild. **Premise:** members of a cozy fantasy guild preserve the kingdom's history and investigate a mysterious magical chronicle that is losing pages. Technical-writing humor is occasional seasoning, not the game's entire premise. **Primary users:** a small trusted team of coworkers, initially 2-15 people. Support up to about 30 connected characters without rebuilding the design, but optimize for 2-8 online.

**Core feeling:** cute SNES/GBA-style pixel art, warm shared guild hall, automatic character routines, meaningful but unhurried choices. The game should reward opening it throughout an ordinary workday (potentially several times a day), without daily obligations or FOMO. A player can ignore it during meetings or vacations without losing progress, character standing or access to story.

### MUST

- Deploy a static frontend through GitHub Pages; authenticate members before exposing protected game data.
- One private, invitation-only guild; admin-generated, one-use, expiring links that are copied into Slack manually; no user email address required and no email-delivered login links.
- First-time character creator with only a few hairstyles and hair colors and clothing colors, all free from the start. Persist appearance, name and progression per account.
- Shared guild hall shows **actually connected** coworkers with names and activity, including online-but-idling players; automatically animate character navigation and simple actions. No manually controlled WASD character movement.
- Three skills (Scribing, Research, Restoration), moderate RPG depth, one primary specialization (among six), skill training, gold, guild renown and journal discoveries.
- Standing orders: automatic Scribing, Research or Restoration activity; recurring production and limited offline gains. Temporary suspension during party expedition; automatic resumption after.
- Guild Business: repeatable, **individual** choices, puzzles and deductions that can be completed in ~30 seconds to 3 minutes; no cooperative Guild Business feature.
- Cooperative-only adventures: expedition parties of 2-4 real players (no fake coworkers or NPC stand-ins), selectable roles, manual or scheduled departure, automatic progress, 1-2 optional independent interactions per player per standard 20-minute expedition, baseline rewards even when disconnected.
- A scheduled party lacking 2 ready players at its departure time receives a **single 15-minute grace period**; if a second player joins within the grace period, it automatically launches immediately; otherwise it closes at the deadline. Players may see a clear notification and keep all standing-order progress. A manual party requires the leader or eligible delegated leader to click Start.
- One lightweight, non-required four-chapter story campaign titled **The Unwritten Chronicle** and evergreen activities that remain engaging without story participation. Launch content includes chapters 1 and 2, with chapters 3 and 4 outlined for later updates.
- Meaningful goals every check-in: new/unfinished Guild Business, recruiting parties, expedition results, events, skill milestones, guild projects, personal discoveries. No artificial 'claim gold every minute' grind.

### MUST NOT

- No AI familiars, pets, equipment/loot inventory, crafting inventories, farming, unlockable outfits, collectible furniture or visual building upgrades.
- No daily login streaks, energy mechanic, mandatory tasks, required simultaneous attendance, surprise countdowns, punitive failures, or required chat.
- No real work systems, Jira/Red Hat/GitHub integrations, corporate SSO or real workplace data.
- No new pixel-art map per expedition. Narrative adventures use text, icons and shared visual components.
- No production backend secrets in the repo, browser bundle or GitHub Pages output.

## Four interconnected loops

1. **Living hall:** enter shared hall, see coworkers move between stations, wave/inspect/invite, examine notices, adjust standing order.
2. **Standing order:** gain modest character XP, skill XP and gold automatically; cosmetic pauses/animations have no economic effect; offline credit capped at 24 hours since last settlement (no accumulating weeks of AFK value).
3. **Guild Business:** complete short individual challenges to improve rewards, find clues or progress personal skills. One activity can be started while the player's character is visibly away on an expedition; Guild Business is a separate UI, not an in-world avatar relocation.
4. **Cooperative expedition:** party assembles, sets roles/strategies, departs, contributes passively, optionally responds to 1-2 events each, ends, distributes baseline rewards, credits post-expedition optional bonuses, resumes standing orders.

A fifth progression layer (gold training, skill specializations, shared guild renown and Chronicles) connects these loops but never replaces them.

## Starting and returning: player experience

**First visit (~3-5 min):** redeem invitation -> choose unique username/password -> choose game display name + hairstyle/hair/clothing palette -> enter the hall -> receive three contextual hints -> choose standing order -> complete a short individual page-order puzzle -> see Expedition Board and its status. The first co-op expedition is offered but not compulsory: no teammate online must never block onboarding. All hints can be dismissed and replayed in Help.

**Typical check-in:** see hall first; unobtrusive 'While you were away' summary lists standing-order gains, finished expedition, pending optional choices, discoveries, invites or a guild milestone. It must not force a modal. At least one meaningful individual activity is available even when no party is forming. After interactions the player can resume idling with one click or just leave the browser open.

**While browser stays open:** character moves to assignment destination and idles with subtle work animation; other online members are real presence; the game reacts to party creation/departure, waves and event feed updates. A player isn't forced to navigate the map.

**If browser closes:** disconnect presence, remove avatar from 'online' hall after presence timeout; keep persistent standing order and expedition schedules. Returning calculates accrued rewards and displays changed state.

## Shared guild hall state

Visual zones in **one** map: Scriptorium, Archives, Restoration Table, Expedition Board, Lounge, Entrance. Have 2-4 workstations per zone but allow overflow positions so a popular station never blocks a member. Avatars follow nav waypoints; clients interpolate a shared activity/destination plus deterministic seed and timestamps (not per-frame network updates). If animations diverge briefly, UI state and authoritative activity remain correct. In-game interaction buttons may direct an avatar to approach, but must never cancel or delay work production.

**Presence flags:** online-active (mouse/keyboard activity recently), online-idling (tab open/connected, no meaningful interaction), offline (no active session), on expedition (activity, not connection status). Never label someone online because a background expedition is running. Consolidate multiple tabs/devices into one roster entry; no duplicate avatars. Presence timeout target 30-60 seconds with reconnect tolerance. Character continues saved activity during reconnect.

**Social, not co-op Business:** wave (lightweight bubble/emote), celebrate, inspect a member's public stats, invite member to an expedition. No chat, no DM, no coworker-triggered teleportation, no assistance reward farming. Don't interrupt another person's assignment. Keep in-game names distinct from auth usernames where possible. Provide mute/hide social effect controls.

## Character skills and specializations

Three skills independently earn skill XP; overall character XP from all activities. Overall level 1-20 at launch; skill levels may exceed overall character level when specialization focus warrants it. No class lockouts. At overall level 10, pick **one primary specialization** (from six; one associated with any of three skills):

| Skill | Specialization A | Specialization B |
|---|---|---|
| Scribing | Chronicler: efficient steady production | Editor: higher-quality outcomes from selected cases |
| Research | Archivist: extra rare discovery opportunities | Investigator: retry one failed optional investigative challenge per expedition |
| Restoration | Mender: resource-efficient restoration | Warden: improves difficult encounter safety |

All players can fill any expedition role regardless of specialization, and no special combination is required to complete content. Gold-funded retraining changes specialization after level 10, with reasonable cooldown/cost; never lose existing skill XP. Each specialization must alter a concrete rule, not only a decorative label.

## Expedition parties

### State machine

`RECRUITING -> GRACE (scheduled + underfilled only) -> IN_PROGRESS -> COMPLETED`;
`RECRUITING/GRACE -> CANCELLED/EXPIRED`;
`IN_PROGRESS -> COMPLETED` regardless of member connection. No transition back to recruiting after departure. For invalid or unrecoverable administrative error, allow an explicitly logged admin-only `FAILED_ADMIN` path with idempotent refund/resolution; do not silently erase user progress.

- Party size 2-4 distinct active members; every join is an explicit commitment to depart. Choose party role and strategy at join, marking ready automatically. No second ready-up button.
- One character may join at most one recruiting party OR one in-progress expedition. If they attempt another, explain conflict and offer leaving the recruiting party, never silently withdraw from active adventures.
- Members can leave recruiting/grace parties; roster locks on departure; disconnection alone NEVER unjoins a member. Leader may cancel before departure, recording notice. Revoked members cannot make further game requests and are not entitled to new participation after revocation; admin handles any active expedition result explicitly.
- Manual: leader can start when >=2; if leader becomes unavailable during recruiting, allow another member to take leadership after a 5-minute connection absence, with a server-side one-claim operation. A recruiting party that remains unattended 24 hours is auto-closed to avoid clutter.
- Scheduled: leader sets absolute future departure in UTC (UI local display), initial presets +5/+10/+15 minutes; when >=2 at scheduled time depart automatically, even with all members offline. When <2, enter grace until +15 minutes, auto-depart immediately on reaching two members, or auto-close at grace deadline. At 4/4 before scheduled time, DO NOT launch early unless every joined member explicitly opted into an early start. Simpler initial rule: no early start for scheduled parties; leader may switch to manual only with a confirmation from all joined members, so default is scheduled time.
- On launch, snapshot roster, roles, skill levels, training bonuses, chosen strategies, event seed and expected finish at backend-authoritative time. Suspend standing orders exactly at departure, not party join; settle prior standing-order earnings first.
- During expedition, progression is based on server time. Standard duration 20 minutes; introductory expedition 10 minutes. The browser is not a timer of record. Members can complete 1-2 optional individual challenges as they appear; no member can hold party completion hostage. An optional challenge window extends **24 hours after expedition completion**. Main rewards are awarded at finish; additional bonuses granted only when valid challenges resolve, individually and idempotently.
- At finish, log the party's contributions and provide a readable mini-narrative report. Resume standing orders at the actual scheduled finish timestamp, even if settlement happens later, to avoid lost progress. No double earnings for standing orders and expedition during overlapping time.

### Additional expedition behavior

- Party rewards: guaranteed XP, gold, skill XP based on role and share of guild renown. Optional active decisions are bonus-oriented; failure cannot remove baseline rewards.
- Player choices: per-expedition role and strategy; optional during-run action (choice, code/symbol ordering, deduction); text varies with role, skill and seeded outcome.
- Asynchronous players: offline players' passive skills count. A challenge started but not finished can be resumed later within its validity window.
- Guild cooperation is expeditions and shared Chronicle objectives, NOT cooperative Guild Business puzzles or a co-op crafting system.
- No automatic NPCs/fake accounts filling parties. A guild with one online member still has meaningful solo Guild Business and standing-order progress.

## Questing, story and discovery

**Premise:** The Royal Chronicle is losing pages and memories. The guild uncovers why through cooperative investigations. Two initial playable chapters: 1) The Missing Pages, 2) The Forgotten Author. Later outlines: 3) The Forbidden Revision, 4) The Final Draft. Campaign unlocks depend on collective, non-daily guild objectives; completed narrative remains replayable in the shared Chronicle and accessible to late joiners. Missing a workday never forfeits the story.

A player's journal tracks unique discoveries and 2-3-part mystery chains; essential story clues have guaranteed progression paths, while random rare discoveries are optional. A shared feed shows major expedition results, discoveries and Renown milestones. No named real-world coworker content in seeded narrative; sample names in UI are mock data only.

## Progression and engagement target

This is **not** a Monday-to-Friday AFK simulator. The ordinary high-quality use case is several independent, enjoyable check-ins **each day**, with something substantial to do at each visit. 30 seconds: inspect and set course; 2-3 minutes: finish a case; 5-15 minutes: multiple cases, party decisions, training, report/journal exploration. No hard daily quests or streaks. Repeating the same easiest puzzle must not dominate rewards. Passive rewards should be meaningful but less efficient at discovery and high-quality outcomes than interacting.

## Launch versus future

**Launch:** fully functional single hall, basic creator, three standing orders, individual Guild Business, levels/skills/one specialization, gold training, party adventures, real-time presence, manual/scheduled parties, event queue, invitations/admin, story chapters 1-2, 10-15 discoveries, guild-wide progress and activity feed, responsive UI.

**Post-launch optional:** chapters 3-4 playable, extra quests/deductions, new expedition modifiers, more discoveries and skill cap extension. Add through data, not pixel-art asset requirements. Do not promise procedural infinite content or new map artwork.

# 04. Art budget, interfaces and UI behavior

## Visual direction

Cozy, high-quality retro top-down SNES/GBA-inspired pixel RPG (original artwork only). Warm wood guild hall, bookshelves, desks, fireplace and handwritten parchment UI accents. Clean modern controls surrounding the pixel art. Pixel clarity, nearest-neighbor scaling, limited palette, comfortable contrast. Tone is whimsical and mysterious, not a constant office joke.

**Art ceiling:** One original hall background/tileset, one reusable character body sprite with 3 simple hair overlays, 5 hair colors and 5 tunic colors, and a small general-purpose effect sheet (e.g., wave, heart, exclamation, sparkle). No outfit collections, no future furniture upgrades, no pets/familiars, no generated maps for expeditions. No image-service runtime dependencies. If character creator needs a fourth hair overlay, trade it against existing art budget rather than expanding the requirement silently.

Use original handcrafted/generated pixel assets placed in repo with permissible license/source attribution. **Avoid redistributing ripped SNES/game art**. No external image hotlinks in runtime. A small tile atlas is preferable to numerous separate PNG files. Store palette data as constants and recolor or tint tunic programmatically (do not multiply sprite sheets by color combinations). Artwork must look intentional rather than unstyled rectangles and default icons; prioritize visually cohesive character animation and one gorgeous hall over quantity.

## Hall layout (single logical map)

Suggested canonical tile size 16x16; render at integer pixel scale (2x/3x/4x), camera fixed or centered. Design a hall roughly 30x20 tiles (adjust to practical layout) with six named regions:

```
+-------------------------------------------------------+
| [SCRIPTORIUM]     [ARCHIVES]      [RESTORATION TABLE]  |
| desks and books   shelves/tables  repair surface      |
|                                                       |
|            [CENTRAL GUILD FLOOR]                      |
|                                                       |
| [LOUNGE/FIREPLACE]       [EXPEDITION NOTICE BOARD]    |
|                                                       |
|                 [ENTRANCE / EXIT]                     |
+-------------------------------------------------------+
```

Keep routes unobstructed, reserve workstation positions per session when possible, provide overflow slots, allow avatar overlap correction with a small rendering offset, and never cause an auto-pathfinding loop. In absence of manual character control, this is a visually meaningful room, not a gameplay maze.

## Animation contract

Character poses: idle standing (2 frames), walking in 4 directions (3-4 frames/direction), seated/writing/reading (shared 2-frame loop), resting (2 frames), short celebration (2-3 frames) and emote bubbles. Restoration can reuse working pose with icon/small prop rather than a unique body animation. Hair overlays must align with all base frames; tint the tunic separate from skin/hair. Reuse all body frames regardless of career skill.

Work/standing orders visually play for online characters. Idle character behavior may include looking around or visiting fireplace for cosmetic breaks, seeded and bounded to avoid busy motion. Server signals authoritative task/station; browser animates path smoothly. No walking speed boost from network latency and no movement differences that change rewards.

When expedition starts, online avatars gather at board and walk to entrance, then disappear from hall. Players still see expedition roster and can open Business UI while away. Returning online avatars re-enter and resume station routine. Offline members are absent from hall but remain in saved party report.

## Core interface information architecture

- **Welcome / sign-in:** public splash screen with coherent visual identity. Username/password or invitation link; never expose members before authentication.
- **Invitation redemption:** name/password setup and character creation, explicit one-time link states (valid, expired, already used, revoked, processing). If waiting for account creation, show secure error/retry language.
- **Character creator:** display name, three hair options, five hair colors, five tunic colors, live preview. All free. Can edit after onboarding. Keyboard accessible selectors.
- **Hall main view:** hall canvas dominant on desktop. Compact status bar (level, XP, gold, standing order, online count), main panels accessible as overlays/drawers, unobtrusive activity feed and guild summary. Show no fake online players in production.
- **Guild Business:** three personal case cards, case details, action area, repeatable puzzle widget, progress, optional clue result, clear feedback and retry.
- **Expedition Board:** recruiting parties, own running party, completed reports, invite actions. Show party size, chosen roles, leader, departure mode and absolute time with local timezone display. Give manual start and scheduled mode controls. Show underfilled grace countdown and status, not a misleading full-party indicator.
- **Party lobby:** 2-4 avatars/cards, role and strategy, online status (distinct from readiness), join/leave, leader actions, invitation status. Joining means ready.
- **Expedition report:** compact timeline, the group's named contributions, rewards, pending optional cases and 24h eligibility window. Always show baseline completion separately from optional bonuses.
- **Character/profile:** levels, 3 skills, specialization and ability, gold training ranks, preview. View other players' **public** stats only.
- **Journal / Chronicle:** personal discoveries, connected mystery clues, shared campaign objectives, completed chapter recap and locked future content. No forced sequential narration.
- **Guild admin:** only accessible to admins; generate and copy invite, list token metadata without exposing raw token again, revoke; member status controls, recovery workflow, audit.
- **Help / settings:** onboarding replay, reduced motion, mute emotes, high-contrast, logout.

## Status, notification and social design

- Brief member labels: `Online`, `Idle`, `On expedition`, `Offline` (show connection and activity as separate fields). Avoid falsely declaring activity based only on XP timers.
- App-level alert counts for results, pending event, invites, rare discovery; don't notify on every ambient animation or standing-order payout.
- On return, 'While you were away' summary can be collapsed and revisited, not a forced modal.
- Emotes are one-click light bubbles; anti-spam cool-down ~10s; always muteable. No text chat in V1.
- In mixed coworker presence, use avatar name labels with collision avoidance; player card on click/tap. Sending emote/party invite never causes target's assignment to pause.

## Responsive and accessibility

- Desktop primary: browser tab on a second monitor, works at 1280x720 with hall visible and drawers accessible. Zoom 80-150% without cutoffs.
- Tablet/mobile: fit hall with pan/zoom or responsive fixed viewport; use a bottom navigation bar and full-width detail sheet, no hover-only controls. Standalone usable without keyboard shortcuts.
- HTML menus and challenge controls have focus, keyboard navigation, visible labels, proper heading hierarchy, touch targets >=44px where practical and accessible response text. Canvas avatar interaction duplicates via online-members list for keyboard/screen reader access.
- Reduced-motion mode suppresses ambient walking jitter and effects but still shows authoritative player activity/status. Avoid flashing. Color is never the only marker for presence or puzzle state.
- Keep pixel rendering crisp at high DPI; font choices readable (UI font can be non-pixel for legibility), no tiny paragraph text. All text uses straight ASCII quotes and standard hyphens in source.
- Suppress background-tab render loop when hidden to conserve CPU/battery, but continue logical state progression on backend; catch up visually and fetch updates when foregrounded. Target smooth animation at 60fps on modern desktop without monopolizing CPU while tab not visible.

## User-experience completion criteria

- A new coworker can redeem an invite, create character, enter hall and complete tutorial Business within 5 minutes without another player online.
- With 3-4 actual connected test users, hall looks alive: automatically moving avatars, coherent work animation, player name tags, real-time connection changes, one-click wave, and clear assignment stations.
- A coworker can identify their next worthwhile action within 10 seconds of returning, even with no recruiting party.
- Most menus preserve visual hall context (drawer/overlay); no mandatory page reload for hall interactions.
- No unlockable cosmetic or decorating UI exists anywhere in V1.

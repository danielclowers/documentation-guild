# Editorial coverage and verification

| Area | Coverage |
| --- | --- |
| Guild Business | 26 active templates. One numeric introduction, six fragment reconstructions, five patterns, five investigations, five classifications, and four tradeoffs. The 11 retired templates remain available to their saved instances. |
| Expedition missions | Seven summaries and 21 departure, midpoint, and return passages. All three approaches and five modifier descriptions. |
| Expedition encounters | 24 titles and setups, 72 choices and corresponding success outcomes, and three supplementary deduction clues. |
| Journal and Chronicle | 15 discoveries, two playable chapters with nine scenes, and two internal future outlines. Existing mystery membership, clue ownership, objectives, and chapter gates carry forward. |
| Player guidance | Welcome premise, seven tour steps, 11 FAQ questions, four shared paragraphs on discovery odds, and contextual messages for assignments, training, character skills, hall positions, cases, expeditions, journal, and guild activity. The account pass updates six messages. |

## Versioning

The [editorial copy](spec/CONTENT-EDITORIAL.json) overlays the existing [launch catalog](spec/CONTENT-SEED.json). Original prompts and choice consequences remain available through the launch catalog and the Guild Business generator. Migration `0011_editorial_versions.sql` gives existing case and party records version 1. New rows record version 2. The Worker uses the saved version when displaying or resolving a case, generating an expedition challenge, or showing a party report. Journal entries keep their discovery keys and ownership and use the revised descriptions. The Chronicle uses the revised scenes and existing objective state.

## Verification checklist

- [x] Compare allowed answers and option effects across both writing versions for representative seeds. Check unique matching labels, rendered placeholders, unchanged patterns, and the introductory page order.
- [x] Validate catalog references, encounter slots and deadlines, special deduction clues, story gates, and the Investigator retry.
- [x] Run Wrangler against isolated local D1 and verify legacy and revised results, reward previews, concurrent payouts, the rolling allowance, and connected-only standing orders through Worker integration.
- [x] Verify desktop and mobile Chromium, including the guild tour, case feedback, expedition approach descriptions, and the journal. Inspect desktop layouts at 1440×900 and 1920×1080. The automated layout checks also covered 2560×1440.

`pnpm check` passed with 37 tests. All 14 Chromium end-to-end tests passed across desktop and mobile.

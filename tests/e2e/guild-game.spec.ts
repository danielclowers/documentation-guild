import { characterLevel } from '../../packages/shared/src';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { GuildProfile, HallMember } from '../../packages/shared/src';

const now = Date.now() - 30_000;
const ada: HallMember = {
  id: 'ada',
  displayName: 'Ada Quill',
  hairStyle: 1,
  hairColor: 0,
  tunicColor: 2,
  station: 'Scriptorium',
  presence: 'active',
  level: 4,
  arrivalAt: now,
  stationAt: now,
  slot: 0,
};
const bea: HallMember = {
  ...ada,
  id: 'bea',
  displayName: 'Bea Vale',
  station: 'Archives',
  presence: 'idle',
  slot: 1,
};

async function enter(page: Page, tutorialStatus: 'pending' | null = null, reduced = false) {
  const reward = {
    xp: 20,
    skillXp: 10,
    gold: 12,
    renown: 0,
    discoveryChance: 8,
    newDiscoveryChance: 8,
    full: true,
    retryPenalty: false,
  };
  const low = {
    ...reward,
    xp: 5,
    skillXp: 0,
    gold: 2,
    discoveryChance: 0,
    newDiscoveryChance: 0,
    full: false,
  };
  const pages = {
    id: 'intro',
    type: 'sequence',
    title: "The Apprentice's First Mistake",
    difficulty: 'intro',
    skill: 'Scribing',
    prompt:
      'An apprentice dropped four pages on the way to the bindery. Put them back in numerical order.',
    tiles: [3, 1, 4, 2],
    attempts: 0,
    retryAt: 0,
    preview: reward,
  };
  const routeOptions = {
    id: 'choice',
    type: 'choice',
    title: 'The Market Map',
    difficulty: 'normal',
    skill: 'Scribing',
    prompt: 'An old market map is on loan for only an hour. There is time to make one useful copy.',
    attempts: 0,
    retryAt: 0,
    options: [
      {
        id: 0,
        label: 'Copy the market stalls for a merchant who has offered payment.',
        effect: 'guaranteed_gold',
      },
      {
        id: 1,
        label: 'Copy the faint markings that appear beneath the newer roads.',
        effect: 'discovery_roll',
      },
      {
        id: 2,
        label: 'Copy the entrances and public roads for anyone visiting the market.',
        effect: 'renown_bonus',
      },
    ],
    preview: reduced ? low : reward,
    choicePreviews: reduced
      ? { 0: low, 1: low, 2: low }
      : {
          0: { ...reward, gold: 16 },
          1: { ...reward, discoveryChance: 20, newDiscoveryChance: 20 },
          2: { ...reward, renown: 5 },
        },
  };
  let solved = false;

  const profile: GuildProfile = {
    memberId: ada.id,
    role: 'admin',
    character: {
      id: 'fixture-character',
      displayName: ada.displayName,
      hairStyle: ada.hairStyle,
      hairColor: ada.hairColor,
      tunicColor: ada.tunicColor,
      xp: 630,
      gold: 89,
      level: characterLevel(630),
      tutorialStatus,
      progression: {
        onExpedition: false,
        training: {},
        specialization: null,
        canSwitchAt: null,
        latestReward: null,
        order: { skill: 'Scribing', remainingMs: 180_000, running: true },
        skills: {
          Scribing: { xp: 520, level: 4 },
          Research: { xp: 110, level: 2 },
          Restoration: { xp: 60, level: 1 },
        },
      },
    },
  };
  const calls: { path: string; method: string }[] = [];
  const live = { sockets: 0, waves: 0 };
  await page.addInitScript(() => localStorage.setItem('guild.reduce-motion', 'true'));
  await page.routeWebSocket('**/api/v1/realtime/socket', (ws) => {
    live.sockets++;
    ws.send(JSON.stringify({ type: 'roster', members: [ada, bea] }));
    ws.onMessage((message) => {
      if (message === 'wave') {
        live.waves++;
        ws.send(JSON.stringify({ type: 'wave', memberId: ada.id }));
      }
    });
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    calls.push({ path, method: request.method() });
    const json = (value: unknown) => route.fulfill({ json: value });
    switch (path) {
      case '/me':
        return json(profile);
      case '/me/character':
        Object.assign(profile.character!, request.postDataJSON());
        return json(profile);
      case '/me/standing-order':
        profile.character!.progression.order!.skill = request.postDataJSON().skill;
        return json(profile);
      case '/me/recap':
        return json({
          checkedAt: Date.now(),
          standing: { xp: 3, skillXp: 5, gold: 3 },
          returned: [],
          discoveries: 1,
          challenges: 0,
          invitations: 0,
          milestones: 0,
        });
      case '/realtime/ticket':
        return json({ ticket: 'x'.repeat(43) });
      case '/me/tutorial':
        profile.character!.tutorialStatus = 'done';
        return route.fulfill({ status: 204 });
      case '/business':
        return json({
          allowance: {
            remaining: reduced ? 0 : solved ? 7 : 8,
            limit: 8,
            nextAt: reduced ? Date.now() + 500_000 : null,
          },
          cases: reduced || solved ? [routeOptions] : [pages, routeOptions],
        });
      case '/business/intro/submit':
        if (request.postDataJSON().tiles.join(',') !== '1,2,3,4') {
          pages.attempts++;
          return json({ status: 'retry', attempts: pages.attempts, retryAt: 0 });
        }
        solved = true;
        return json({
          status: 'completed',
          reward: {
            ...reward,
            skill: 'Scribing',
            outcome: 'The pages are back in order. The apprentice can finish the binding.',
            discovery: {
              key: 'echoing_index',
              title: 'The Echoing Index',
              text: 'An old library catalog lists a reading room that does not exist on the present floor plan. Several of its shelf numbers are still used elsewhere in the building.',
              rarity: 'uncommon',
              known: false,
            },
          },
        });
      case '/business/choice/submit':
        return json({
          status: 'completed',
          reward: {
            ...low,
            skill: 'Scribing',
            outcome: 'You filed the routine report.',
            discovery: null,
          },
        });
      case '/expeditions':
        return json({
          parties: [],
          modifiers: [],
          invitees: [],
          chronicle: [],
          missions: [
            {
              key: 'missing_pages',
              title: 'The Missing Pages',
              summary:
                'A village librarian found blank spaces in the Royal Chronicle. The page numbers are intact, but several events appear to have been erased.',
              tier: 'tutorial',
              minutes: 10,
              recommendedLevel: 1,
              unlocked: true,
              approaches: [
                {
                  key: 'careful',
                  label: 'Careful investigation',
                  description:
                    'Take fewer risks and improve the odds of successful optional challenges.',
                },
                {
                  key: 'curious',
                  label: 'Follow unusual leads',
                  description:
                    'Optional challenges are harder, but discovery choices have a better chance of finding something.',
                },
                {
                  key: 'supportive',
                  label: 'Document for the guild',
                  description:
                    "Focus on a useful record of the expedition and support the party's work.",
                },
              ],
            },
          ],
        });
      case '/me/journal':
        return json({
          discoveries: [
            {
              key: 'missing_chapter',
              title: 'The Missing Chapter',
              text: 'An early copy of the Royal Chronicle records a royal procession absent from later editions. The page numbering in the later copies is continuous, even though the account is gone.',
              rarity: 'common',
              source: 'chronicle',
              discoveredAt: now,
            },
            {
              key: 'echoing_index',
              title: 'The Echoing Index',
              text: 'An old library catalog lists a reading room that does not exist on the present floor plan. Several of its shelf numbers are still used elsewhere in the building.',
              rarity: 'uncommon',
              source: 'case',
              discoveredAt: now,
            },
          ],
          chains: [
            { key: 'missing_history', title: 'The Missing History', steps: 3, discoveries: [] },
          ],
          chronicle: [],
        });
      case '/guild/feed':
        return json({ renown: 100, entries: [], next: null });
      case '/admin/members':
        return json({ members: [] });
      case '/admin/invitations':
        return json({ invitations: [] });
      default:
        throw Error('Unexpected fixture route ' + path);
    }
  });
  await visitHall(page);
  return { calls, live, profile };
}

async function visitHall(page: Page) {
  await page.goto('http://127.0.0.1:4174/documentation-guild/test/guild-game.html');
  await page.getByRole('button', { name: 'Enter test hall' }).click();
  await expect(page.getByText('2 online', { exact: true })).toBeVisible();
  await expect(page.locator('.hall-art canvas')).toBeVisible();
}

test('introduces the hall, guides a first case, and can be finished or replayed', async ({
  page,
}, info) => {
  const { calls, live } = await enter(page, 'pending');
  const guide = page.locator('.guild-guide');
  const sizes =
    info.project.name === 'desktop'
      ? ([
          [1440, 900],
          [1920, 1080],
          [2560, 1440],
        ] as const)
      : [];
  async function checkLayout(element: import('@playwright/test').Locator, screen: string) {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await expect(element).toBeVisible();
      expect(await element.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
        await element.evaluate((el) => el.clientWidth + 1),
      );
      if (process.env.GUILD_UI_SCREENSHOTS)
        await page.screenshot({ path: info.outputPath(`${screen}-${width}x${height}.png`) });
    }
  }
  await expect(guide.getByRole('heading', { name: 'Welcome to the guild' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Back' }).click();
  await expect(guide.getByRole('heading', { name: 'Welcome to the guild' })).toBeVisible();
  for (let i = 0; i < 3; i++) await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Take on a case' })).toBeVisible();
  await checkLayout(guide, 'guild-tour');
  await guide.getByRole('button', { name: 'Open Guild Business' }).click();
  const menu = page.getByRole('dialog', { name: 'Guild Business' });
  await expect(menu.getByText('8/8 full-reward cases remaining')).toBeVisible();
  await menu.getByRole('button', { name: "The Apprentice's First Mistake" }).click();
  await expect(menu.getByText('10 Scribing XP')).toBeVisible();
  await menu.getByRole('button', { name: 'Submit answer' }).click();
  await expect(menu.getByText('Not quite. Check your arrangement and try again.')).toBeVisible();
  await menu.getByRole('button', { name: 'Move 1 earlier' }).click();
  await menu.getByRole('button', { name: 'Move 2 earlier' }).click();
  await menu.getByRole('button', { name: 'Move 2 earlier' }).click();
  await menu.getByRole('button', { name: 'Submit answer' }).click();
  await expect(menu.getByRole('heading', { name: 'Case complete!' })).toBeVisible();
  await expect(
    menu.getByText('The pages are back in order. The apprentice can finish the binding.'),
  ).toBeVisible();
  const notice = menu.getByRole('complementary', { name: 'New discovery' });
  await expect(notice.getByText('uncommon', { exact: true })).toBeVisible();
  await expect(notice.getByText('Added to your journal.')).toBeVisible();
  await expect(menu.getByText('7/8 full-reward cases remaining')).toBeVisible();
  await checkLayout(menu, 'case-complete');
  await notice.getByRole('button', { name: 'Read journal entry' }).click();
  await expect(page.locator('#journal-entry-echoing_index')).toBeFocused();
  for (let i = 0; i < 3; i++) await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Finish tour' }).click();
  await expect.poll(() => calls.filter(({ path }) => path === '/me/tutorial').length).toBe(1);
  await expect(guide).toHaveCount(0);
  expect(live.sockets).toBe(1);
  await visitHall(page);
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings & Help', exact: true }).click();
  await page.getByRole('button', { name: 'Replay guild tour' }).click();
  await expect(guide.getByRole('heading', { name: 'Welcome to the guild' })).toBeVisible();
  await guide.getByRole('button', { name: 'Skip tour' }).click();
  await expect(guide).toHaveCount(0);
});

test('lets a new player skip and explains reduced rewards without offering identical choices', async ({
  page,
}) => {
  const { calls, live } = await enter(page, 'pending', true);
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect.poll(() => calls.filter(({ path }) => path === '/me/tutorial').length).toBe(1);
  await page.getByRole('navigation').getByRole('button', { name: 'Guild Business' }).click();
  const menu = page.getByRole('dialog', { name: 'Guild Business' });
  await expect(menu.getByText('0/8 full-reward cases remaining')).toBeVisible();
  await menu.getByRole('button', { name: 'The Market Map' }).click();
  await expect(menu.getByRole('radio')).toHaveCount(0);
  await expect(
    menu.getByText(
      'This case is eligible for reduced rewards only. File a routine report to receive the available reward.',
    ),
  ).toBeVisible();
  await menu.getByRole('button', { name: 'File report' }).click();
  await expect(menu.getByText('You filed the routine report.')).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Case complete!' })).toBeVisible();
  await expect(
    menu.getByText('Reduced rewards: no skill XP, renown or discovery roll.'),
  ).toBeVisible();
  expect(live.sockets).toBe(1);
});

test('opens workstation and member actions without dropping realtime presence', async ({
  page,
}) => {
  const { calls, live } = await enter(page);
  const dialog = page.getByRole('dialog');
  const label = page.getByRole('button', { name: 'Archives', exact: true });
  await label.focus();
  await label.press('Enter');
  await expect(dialog.getByRole('heading', { name: 'Standing Orders', exact: true })).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'Assignment' })).toHaveValue('Research');
  expect(calls.some(({ path, method }) => path === '/me/standing-order' && method === 'PUT')).toBe(
    false,
  );
  await dialog.getByRole('button', { name: 'Change order' }).click();
  await expect(dialog.getByText('Working on Research')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(label).toBeFocused();

  const art = page.locator('.hall-art');
  const bounds = (await art.boundingBox())!;
  await page.mouse.click(
    bounds.x + bounds.width * (76 / 352),
    bounds.y + bounds.height * (109 / 240),
  );
  await expect(dialog).toHaveAccessibleName('Standing Orders');
  await expect(dialog.getByRole('combobox', { name: 'Assignment' })).toHaveValue('Scribing');
  await page.keyboard.press('Escape');

  await page.mouse.click(
    bounds.x + bounds.width * (116 / 352),
    bounds.y + bounds.height * (119 / 240),
  );
  await expect(dialog.getByRole('heading', { name: 'Bea Vale' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Wave to the hall' }).click();
  await expect.poll(() => live.waves).toBe(1);
  await dialog.getByRole('combobox', { name: 'Go to' }).selectOption('character');
  await expect(dialog.getByRole('heading', { name: 'Character & Skills' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Edit character' }).click();
  await dialog.getByRole('textbox', { name: 'Display name' }).fill('Ada Revised');
  await dialog.getByRole('button', { name: 'Save character' }).click();
  await expect(dialog.getByRole('heading', { name: 'Ada Revised' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Return to hall' }).click();
  await expect(dialog).toHaveCount(0);
  expect(live.sockets).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Character & Skills for Ada Revised' }),
  ).toBeVisible();
});

test('keeps the game menus and the hall usable at workstation resolutions', async ({
  page,
}, info) => {
  await enter(page);
  const sizes =
    info.project.name === 'desktop'
      ? ([
          [1440, 900],
          [1920, 1080],
          [2560, 1440],
        ] as const)
      : ([[393, 851]] as const);

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const art = page.locator('.hall-art');
    await expect
      .poll(async () => (await art.boundingBox())!.width)
      .toBeGreaterThan(width * (width > 1000 ? 0.65 : 0.9));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width > 1000) {
      expect((await art.boundingBox())!.height).toBeGreaterThanOrEqual(height * 0.78);
      await expect
        .poll(async () => {
          const displayWidth = (await art.boundingBox())!.width;
          return (displayWidth * (await page.evaluate(() => devicePixelRatio))) % 352;
        })
        .toBeCloseTo(0, 3);
    }
    if (process.env.GUILD_UI_SCREENSHOTS) {
      await page.screenshot({ path: info.outputPath(`hall-${width}x${height}.png`) });
    }
  }
  const menu = page.getByRole('navigation', { name: 'Guild game menus' });
  for (const title of [
    'Standing Orders',
    'Guild Business',
    'Expedition Board',
    'Character & Skills',
    'Training & Specializations',
    'Journal & Chronicle',
    'Guild Activity',
    'Settings & Help',
    'Guild Administration',
  ]) {
    await menu.getByRole('button', { name: title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible();
    if (title === 'Expedition Board') {
      await dialog
        .getByRole('combobox', { name: 'Plan an expedition' })
        .selectOption('missing_pages');
      const approach = dialog.getByRole('combobox', { name: 'Approach', exact: true });
      await expect(approach).toHaveAccessibleDescription(
        'Take fewer risks and improve the odds of successful optional challenges.',
      );
      await approach.selectOption('curious');
      await expect(approach).toHaveAccessibleDescription(
        'Optional challenges are harder, but discovery choices have a better chance of finding something.',
      );
    }
    if (title === 'Journal & Chronicle') {
      await expect(dialog.getByText('The Echoing Index', { exact: true })).toBeVisible();
      if (process.env.GUILD_UI_SCREENSHOTS)
        await page.screenshot({ path: info.outputPath('journal.png') });
      await dialog.getByRole('button', { name: 'Guild Chronicle' }).click();
      await expect(dialog.getByRole('heading', { name: 'The Unwritten Chronicle' })).toBeVisible();
    }
    if (title === 'Settings & Help') {
      await expect(dialog.getByRole('checkbox', { name: 'Reduce motion' })).toBeChecked();
      await expect(dialog.getByRole('button', { name: 'Change password' })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'While you were away' }).click();
  await page.getByRole('button', { name: 'Open journal' }).click();
  await expect(page.getByRole('dialog', { name: 'Journal & Chronicle' })).toBeVisible();
});

test('shows accurate character XP progress at thresholds and after reaching the cap', async ({
  page,
}) => {
  const { profile } = await enter(page);
  for (const [xp, level, next, value, range] of [
    [0, 1, 26, 0, 26],
    [25, 1, 26, 25, 26],
    [26, 2, 113, 0, 87],
    [112, 2, 113, 86, 87],
    [113, 3, 266, 0, 153],
    [630, 5, 779, 143, 292],
    [2677, 9, 2678, 586, 587],
    [2678, 10, 3341, 0, 663],
    [12862, 19, 12863, 1380, 1381],
    [12863, 20, null, null, null],
    [1000000, 20, null, null, null],
  ] as const) {
    profile.character!.xp = xp;
    profile.character!.level = level;
    await visitHall(page);
    const hud = page.locator('.game-hud');
    await expect(hud.getByText(`Level ${level}`, { exact: true })).toBeVisible();
    const bar = hud.getByRole('progressbar');
    if (next === null) {
      await expect(bar).toHaveAccessibleName('Maximum level reached');
      expect(await bar.evaluate((element) => (element as HTMLProgressElement).position)).toBe(1);
      await expect(
        hud.getByText(`${xp.toLocaleString()} XP · Max level`, { exact: true }),
      ).toBeVisible();
    } else {
      await expect(bar).toHaveAccessibleName('Experience toward next level');
      await expect(bar).toHaveAttribute('value', String(value));
      await expect(bar).toHaveAttribute('max', String(range));
      await expect(
        hud.getByText(`${xp.toLocaleString()} XP / ${next.toLocaleString()}`, { exact: true }),
      ).toBeVisible();
    }
  }
});

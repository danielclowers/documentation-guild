import { expect, test } from '@playwright/test';

test('renders the welcome screen and hall at the GitHub Pages base path', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'The Documentation Guild' })).toBeVisible();
  await expect(page.getByText('The guild is invitation-only.', { exact: false })).toBeVisible();
  const canvas = page.getByRole('img', { name: /pixel-art guild hall/ }).locator('canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((node) => {
        const context = (node as HTMLCanvasElement).getContext('2d');
        return context?.getImageData(177, 165, 1, 1).data[0];
      }),
    )
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
});

test('clears invitation and recovery fragments on arrival', async ({ page }) => {
  for (const route of ['redeem', 'recover']) {
    await page.goto('about:blank');
    await page.goto(`./#/${route}/${'a'.repeat(43)}`);
    await expect(page).toHaveURL(/\/documentation-guild\/$/);
  }
});

test('opens the FAQ and returns to the guild', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Help & FAQ' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Help & FAQ' })).toBeFocused();
  await page.getByText('What happens when I close the game?', { exact: true }).click();
  await expect(page.getByText('Closing your last connected tab', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the guild' }).click();
  await expect(page.getByRole('heading', { name: 'The Documentation Guild' })).toBeVisible();
});

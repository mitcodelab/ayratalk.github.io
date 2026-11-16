import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('loads the board, filters, speaks a tile, and toggles its favorite', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');

  await expect(page.locator('.modal-overlay[aria-hidden="true"]')).toHaveCount(5);
  await expect(page.locator('.modal-overlay[aria-hidden="true"]').first()).toHaveCSS('display', 'none');
  await expect(page.locator('#settings-panel[aria-hidden="true"]')).toHaveCSS('display', 'none');

  await expect(page).toHaveTitle('TalkBoard AAC v1.3.8');
  await expect(page.locator('#tile-container .tile-wrap[data-search]')).toHaveCount(21);
  await expect(page.locator('script:not([src])')).toHaveCount(0);
  await expect(page.locator('[onclick], [onload], [onerror], [oninput], [onchange], [onkeydown]')).toHaveCount(0);

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  await page.getByLabel('Search this board').fill('No');
  await expect(page.locator('#tile-container .tile-wrap[data-search]:not([hidden]) .tile')).toHaveText(['No']);
  await page.getByLabel('Search this board').fill('');
  await page.locator('#tile-container button.tile[data-tile-id="t_no"]').click();
  await expect(page.locator('#message-text .msg-word')).toContainText('No');

  await page.locator('#tile-container .tile-fav[aria-label="Add No to favorites"]').click();
  await expect(page.locator('#tile-container .tile-fav[aria-label="Remove No from favorites"]')).toHaveAttribute('aria-pressed', 'true');
  expect(pageErrors).toEqual([]);
});

test('opens from file and keeps artwork proportional', async ({ page }) => {
  await page.setViewportSize({ width: 1918, height: 445 });
  await page.goto(pathToFileURL(resolve('index.html')).href);

  await expect(page).toHaveTitle('TalkBoard AAC v1.3.8');
  await expect(page.locator('#app-styles')).toHaveJSProperty('media', 'all');
  await expect(page.locator('.board-chip-img').first()).toHaveCSS('width', '22px');
  await expect(page.locator('#tile-container .tile-img').first()).toHaveCSS('max-width', '172px');
  await expect(page.locator('#content')).toHaveCSS('max-width', 'none');
  const desktopColumns = await page.locator('.tile-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(desktopColumns).toBe(6);
});

test('yields while rendering a large custom board and keeps search/tile actions working', async ({ page }) => {
  const tileCount = 600;
  await page.goto('/');
  await page.getByRole('button', { name: /Locked/ }).click();
  for (const digit of '123456') await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByRole('button', { name: /Unlocked/ })).toBeVisible();
  await page.locator('#tab-settings').click();

  const backup = {
    app: 'TalkBoard AAC',
    version: 3,
    customBoards: [{
      id: 'stress-board',
      name: 'Stress Test',
      icon: '🧪',
      tiles: Array.from({ length: tileCount }, (_, index) => ({
        id: `stress-tile-${index}`,
        label: `Stress Tile ${index}`,
        emoji: '🔹',
        color: 'blue'
      }))
    }],
    favoriteTileIds: [],
    recentTileIds: [],
    savedPhrases: [],
    trendingData: {},
    audio: {}
  };
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-large-board.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  });

  const confirm = page.getByRole('dialog', { name: /Confirm/ });
  await expect(confirm).toContainText(`${tileCount} tile(s)`);
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  const boardButton = page.getByRole('button', { name: /Stress Test board/ });
  await expect(boardButton).toBeVisible();
  await boardButton.click();

  const tiles = page.locator('#tile-container .tile-wrap[data-search]');
  await expect(tiles).toHaveCount(tileCount, { timeout: 30_000 });
  await expect(page.locator('#tile-container')).not.toHaveAttribute('aria-busy', 'true');
  const offscreenTile = page.locator('#tile-container .tile-wrap[data-tile-id="stress-tile-599"]');
  await expect.poll(() => offscreenTile.evaluate(element => getComputedStyle(element).contentVisibility)).toBe('auto');

  await page.getByLabel('Search this board').fill(`Stress Tile ${tileCount - 1}`);
  await expect(page.locator('#tile-container .tile-wrap[data-search]:not([hidden]) .tile')).toHaveText(['🔹Stress Tile 599']);
  await page.getByRole('button', { name: `Stress Tile ${tileCount - 1}`, exact: true }).click();
  await expect(page.locator('#message-text .msg-word')).toContainText(`Stress Tile ${tileCount - 1}`);
});

test('serves the app shell after the service worker is installed and the browser goes offline', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page).toHaveTitle('TalkBoard AAC v1.3.8');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 15_000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('TalkBoard AAC v1.3.8');
    await expect(page.getByLabel('Search this board')).toBeVisible();
    await expect(page.locator('#tile-container .tile-wrap[data-search]')).toHaveCount(21);
  } finally {
    await context.close();
  }
});

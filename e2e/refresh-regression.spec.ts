import { expect, test, type Page } from '@playwright/test';
import type { SnowflakeConfig } from '../src/types';

test.setTimeout(240_000);

async function settled(page: Page) {
  await page.waitForTimeout(500);
  await expect(page.getByText('Generating…', { exact: true })).toBeHidden({ timeout: 120_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.waitForTimeout(500);
}

test('refresh rebuilds the latest loaded and edited slot configuration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('snowflake_tutorial_disabled', '1'));
  await page.goto('/');
  await page.locator('[data-tutorial="tab-global"]').waitFor({ timeout: 120_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-tutorial="save"]').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const config: SnowflakeConfig = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  Object.assign(config, {
    projectName: 'Refresh regression', slotEnabled: false, slotMode: '3-plane',
    slotBridgesEnabled: false, quality: 'low', bevelEnabled: false, extrusionDepth: 3,
  });
  config.layers.forEach((layer, index) => {
    layer.enabled = index === 0;
    layer.primary.enabled = false;
    layer.secondary.enabled = false;
    layer.secondaryEnabled = false;
    layer.textGroups?.forEach(group => { group.enabled = false; });
    layer.abstracts = [];
    layer.images = [];
    layer.hubs = [{
      id: `refresh-hub-${index}`, enabled: true, shape: 'circle', sides: 6,
      outerRadius: 35, hollow: false, wallThickness: 5, starRatio: 0.5,
      rotationOffset: 0, oscillationEnabled: false, oscillationAmplitude: 0, oscillationFrequency: 6,
    }];
  });
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'refresh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByRole('textbox', { name: 'PROJECT NAME' })).toHaveValue('Refresh regression');
  await page.locator('[data-tutorial="view-3d"]').click();
  await settled(page);
  const rows = page.locator('[data-tutorial="planes-panel"] > div:nth-child(2) > div');
  await expect(rows).toHaveCount(1);

  const slots = page.locator('[data-tutorial="slots"] button').first();
  await slots.click();
  await expect(slots).toContainText('ON');
  await expect(rows).toHaveCount(1); // Auto regeneration is off.
  await page.getByTitle('Force refresh 3D model').click();
  await settled(page);
  await expect(rows).toHaveCount(3);

  for (const index of [1, 2]) await rows.nth(index).locator('button').first().click();
  const canvas = page.locator('[data-tutorial="preview"] canvas').first();
  const slotted = await canvas.screenshot();
  await slots.click();
  await page.getByTitle('Force refresh 3D model').click();
  await settled(page);
  const uncut = await canvas.screenshot();
  expect(slotted.equals(uncut), 'slot cutting must change the base plane rendering').toBe(false);
  await page.getByTitle('Force refresh 3D model').click();
  await settled(page);
  await expect(rows).toHaveCount(3);
  expect(errors).toEqual([]);
});

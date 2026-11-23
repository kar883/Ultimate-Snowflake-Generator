import { expect, test } from '@playwright/test';
import { Jimp } from 'jimp';
import type { SnowflakeConfig } from '../src/types';

test('removes one highlighted body or all bodies from preview and STL export', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => localStorage.setItem('snowflake_tutorial_disabled', '1'));
  await page.goto('/');
  await page.locator('[data-tutorial="tab-global"]').waitFor({ timeout: 120_000 });
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-tutorial="save"]').click(),
  ]);
  const projectStream = await projectDownload.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of projectStream) chunks.push(Buffer.from(chunk));
  const config: SnowflakeConfig = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  Object.assign(config, {
    projectName: 'Body removal regression', slotEnabled: false, quality: 'low',
    bevelEnabled: false, extrusionDepth: 3, globalStrokeWeight: 0,
  });
  config.layers.forEach((layer, index) => {
    layer.enabled = index === 0;
    layer.rotation3D = { x: 0, y: 0, z: 0 };
    layer.primary.enabled = false;
    layer.secondary.enabled = false;
    layer.secondaryEnabled = false;
    layer.textGroups = [];
    layer.images = [];
    if (layer.hangingRing) layer.hangingRing.enabled = false;
    layer.hubs = index === 0 ? [{
      id: 'body-main', enabled: true, shape: 'circle', sides: 6, outerRadius: 20,
      hollow: false, wallThickness: 3, starRatio: 0.5, rotationOffset: 0,
      oscillationEnabled: false, oscillationAmplitude: 0, oscillationFrequency: 6,
    }] : [];
    layer.abstracts = index === 0 ? [{
      id: 'body-islands', enabled: true, type: 'line', arms: 2, rotationOffset: 0,
      innerRadius: 50, outerRadius: 60, amplitude: 0, frequency: 1, thickness: 5,
      mirrorEnabled: false, mirrorOffset: 0,
    }] : [];
  });
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'bodies.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
  });
  await page.locator('[data-tutorial="view-3d"]').click();
  await expect(page.getByText('Generating…', { exact: true })).toBeHidden({ timeout: 120_000 });
  await page.getByRole('button', { name: 'ID Bodies' }).click();
  await expect(page.getByText('2 disconnected bodies highlighted.')).toBeVisible({ timeout: 120_000 });

  const canvas = page.locator('[data-tutorial="preview"] canvas').first();
  const canvasSize = await canvas.boundingBox();
  if (!canvasSize) throw new Error('3D canvas is unavailable');
  await canvas.click({ position: { x: canvasSize.width / 2, y: canvasSize.height / 2 } });
  await expect(page.getByText('2 disconnected bodies highlighted.')).toBeVisible();
  const image = await Jimp.read(await canvas.screenshot());
  let xSum = 0, ySum = 0, count = 0;
  for (let y = Math.floor(image.height * 0.4); y < image.height * 0.6; y++) {
    for (let x = Math.floor(image.width / 2); x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      const [r, g, b] = image.bitmap.data.subarray(offset, offset + 3);
      if (r > 100 && r > g * 1.3 && r > b * 1.7) {
        xSum += x; ySum += y; count++;
      }
    }
  }
  expect(count, 'a highlighted body should be visible on the right').toBeGreaterThan(10);
  await canvas.click({ position: { x: xSum / count, y: ySum / count } });
  await expect(page.getByText('1 disconnected body highlighted.')).toBeVisible({ timeout: 120_000 });

  const exportBounds = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.keyboard.press('Control+e'),
    ]);
    const stream = await download.createReadStream();
    const parts: Buffer[] = [];
    for await (const chunk of stream) parts.push(Buffer.from(chunk));
    const stl = Buffer.concat(parts);
    let minX = Infinity, maxX = -Infinity;
    for (let offset = 84; offset + 50 <= stl.length; offset += 50) {
      for (let vertex = 0; vertex < 3; vertex++) {
        const x = stl.readFloatLE(offset + 12 + vertex * 12);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    return { minX, maxX };
  };
  const afterOne = await exportBounds();
  expect(afterOne.minX).toBeLessThan(-45);
  expect(afterOne.maxX).toBeLessThan(25);
  await page.getByRole('button', { name: 'Remove all highlighted bodies' }).click();
  await expect(page.getByRole('button', { name: 'Bodies: OK' })).toBeVisible({ timeout: 120_000 });
  const afterAll = await exportBounds();
  expect(afterAll.minX).toBeGreaterThan(-25);
  expect(afterAll.maxX).toBeLessThan(25);
  await page.getByTitle('Force refresh 3D model').click();
  await expect(page.getByText('2 disconnected bodies highlighted.')).toBeVisible({ timeout: 120_000 });
  expect(errors).toEqual([]);
});

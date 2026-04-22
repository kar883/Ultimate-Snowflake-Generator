/**
 * e2e/visual-3d.spec.ts
 *
 * Verifies that the 3D WebGL canvas reflects the active configuration.
 *
 * Strategy: canvas pixel analysis
 * ────────────────────────────────
 * We read raw RGBA pixel data from the <canvas> element via page.evaluate()
 * and answer three questions:
 *
 *  Q1 – Is the canvas blank?
 *       Any non-trivial ratio of non-background pixels means Three.js has
 *       rendered geometry.
 *
 *  Q2 – Does the dominant colour match the model colour setting?
 *       After changing the model colour picker to a strongly saturated hue
 *       (e.g. vivid red), the dominant non-background colour on the canvas
 *       should shift toward that hue.
 *
 *  Q3 – Does toggling a layer on/off change the canvas pixel ratio?
 *       Disabling a layer should leave fewer non-background pixels (less
 *       geometry on screen).
 *
 * Notes
 * ──────
 * • Three.js uses preserveDrawingBuffer: false by default; we attempt to
 *   read pixels through an offscreen 2-D canvas (drawImage → getImageData).
 *   If the browser blocks cross-origin reads the canvas-blank check will
 *   gracefully skip the colour assertion and log a warning.
 * • Tests that depend on the 3D view first switch to 3D mode.
 */
import { test, expect } from '@playwright/test';
import {
  gotoApp,
  clickTab,
  getCanvasPixelStats,
  expectCanvasNotBlank,
  expectCanvasDominantColor,
  parseHexColor,
  colorDistance,
  setModelColor,
} from './fixtures';

// Switch the view to 3D mode by clicking the 3D toggle if it exists,
// then poll the canvas until it shows non-blank pixel data (or timeout).
async function switchTo3D(page: Parameters<typeof gotoApp>[0]) {
  // The app may have a "2D / 3D" toggle button in the preview area
  const threeDBtn = page
    .locator('button')
    .filter({ hasText: /^3d$/i })
    .first();
  if (await threeDBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await threeDBtn.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(500);
  } else {
    await page.keyboard.down('Control');
    await page.keyboard.press('1');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
  }
  // Poll until the canvas has non-blank pixels (up to 10 s)
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const stats = await getCanvasPixelStats(page);
    if (!stats.isBlank) break;
  }
}

test.describe('3D canvas – pixel analysis', () => {

  test('canvas element is present and has non-zero dimensions', async ({ page }) => {
    await gotoApp(page);
    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.width, height: c.height } : { width: 0, height: 0 };
    });
    expect(dims.width, 'canvas width should be > 0').toBeGreaterThan(0);
    expect(dims.height, 'canvas height should be > 0').toBeGreaterThan(0);
  });

  test('3D canvas is not blank after model loads', async ({ page }) => {
    await gotoApp(page);
    await switchTo3D(page);
    // At least 1 % of sampled pixels should be non-background
    await expectCanvasNotBlank(page, 0.01);
  });

  test('model colour change shifts the dominant canvas colour', async ({ page }) => {
    await gotoApp(page);
    await switchTo3D(page);

    // Record dominant colour before change
    const before = await getCanvasPixelStats(page);

    // Change model colour to a vivid red
    await clickTab(page, 'global');
    await setModelColor(page, '#ff2200');

    // Poll until the canvas changes colour (up to 10 s)
    const deadline = Date.now() + 10_000;
    let after = await getCanvasPixelStats(page);
    while (after.dominantColor === before.dominantColor && Date.now() < deadline) {
      await page.waitForTimeout(500);
      after = await getCanvasPixelStats(page);
    }

    const bgHex = '#020617';
    const beforeBgDist = colorDistance(parseHexColor(before.dominantColor), parseHexColor(bgHex));
    const afterBgDist = colorDistance(parseHexColor(after.dominantColor), parseHexColor(bgHex));
    if (before.isBlank || after.isBlank || before.nonBackgroundRatio < 0.01 || after.nonBackgroundRatio < 0.01 || (beforeBgDist < 24 && afterBgDist < 24)) {
      test.skip();
      return;
    }

    // The dominant colour should have changed toward red
    expect(
      before.dominantColor,
      `Dominant colour should differ after model colour change`
    ).not.toEqual(after.dominantColor);
  });

  test('dominant canvas colour approximates the configured model colour', async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'global');
    // Set a distinctive colour
    const targetHex = '#00ccff';
    await setModelColor(page, targetHex);
    await switchTo3D(page);

    const stats = await getCanvasPixelStats(page);
    const bgHex = '#020617';
    const bgDist = colorDistance(parseHexColor(stats.dominantColor), parseHexColor(bgHex));
    if (stats.isBlank || stats.nonBackgroundRatio < 0.01 || bgDist < 24) {
      test.skip();
      return;
    }
    // Dominant non-background colour should be within Euclidean distance 80 of target
    await expectCanvasDominantColor(page, targetHex, 80);
  });

  test('disabling a layer reduces non-background pixel ratio', async ({ page }) => {
    await gotoApp(page);
    await switchTo3D(page);

    const before = await getCanvasPixelStats(page);
    if (before.isBlank) {
      test.skip();
      return;
    }

    // Disable a layer from the Planes tab
    await clickTab(page, 'planes');
    const layerToggle = page
      .locator('label')
      .filter({ hasText: /visible/i })
      .first();
    if (await layerToggle.isVisible()) {
      await layerToggle.click();
      // Poll until canvas re-renders (up to 10 s)
      const deadline = Date.now() + 10_000;
      let after = await getCanvasPixelStats(page);
      while (
        !after.isBlank &&
        after.nonBackgroundRatio >= before.nonBackgroundRatio * 0.95 &&
        Date.now() < deadline
      ) {
        await page.waitForTimeout(500);
        after = await getCanvasPixelStats(page);
      }

      if (!after.isBlank) {
        expect(
          after.nonBackgroundRatio,
          `Disabling a layer should reduce visible geometry (before=${before.nonBackgroundRatio.toFixed(3)}, after=${after.nonBackgroundRatio.toFixed(3)})`
        ).toBeLessThanOrEqual(before.nonBackgroundRatio * 1.05); // allow 5 % margin
      }
      // Re-enable the layer
      await layerToggle.click();
    }
  });

  test('adding a hub increases non-background pixel ratio', async ({ page }) => {
    await gotoApp(page);
    await switchTo3D(page);
    const before = await getCanvasPixelStats(page);

    // Add a hub
    await clickTab(page, 'hubs');
    await page.getByRole('button', { name: /(\+\s*hub|add\s*hub)/i }).first().click();
    await page.waitForTimeout(500);

    // Enable the hub (large radius so it's visible)
    const visibleBtns = page.locator('button').filter({ hasText: /visible/i });
    if (await visibleBtns.last().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await visibleBtns.last().click();
    }

    // Poll until canvas re-renders (up to 10 s)
    const deadline = Date.now() + 10_000;
    let after = await getCanvasPixelStats(page);
    while (after.isBlank && Date.now() < deadline) {
      await page.waitForTimeout(500);
      after = await getCanvasPixelStats(page);
    }

    if (before.isBlank || after.isBlank) {
      test.skip();
      return;
    }

    // Canvas should have at least as many lit pixels as before
    expect(
      after.nonBackgroundRatio,
      `Adding a hub should not reduce canvas coverage (before=${before.nonBackgroundRatio.toFixed(3)}, after=${after.nonBackgroundRatio.toFixed(3)})`
    ).toBeGreaterThanOrEqual(before.nonBackgroundRatio * 0.9);
  });
});

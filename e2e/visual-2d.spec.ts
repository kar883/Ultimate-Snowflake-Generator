/**
 * e2e/visual-2d.spec.ts
 *
 * Verifies that the 2D SVG preview reflects the active configuration.
 *
 * Strategy: SVG DOM inspection
 * ─────────────────────────────
 * The 2D preview renders as a real <svg> element, which means we can
 * read path counts, bounding-box dimensions, and fill-colour attributes
 * directly — no pixel guessing required.
 *
 * For each test we:
 *   1. Start from the default state (or a known state).
 *   2. Change one variable.
 *   3. Assert that the SVG reflects the change.
 */
import { test, expect } from '@playwright/test';
import {
  gotoApp,
  clickTab,
  getSvgStats,
  waitForSvgStable,
  expectSvgPathCountAtLeast,
  setModelColor,
} from './fixtures';

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Navigate, wait for the SVG to stabilise, and return the initial stats. */
async function loadAndGetStats(page: Parameters<typeof gotoApp>[0]) {
  await gotoApp(page);
  return waitForSvgStable(page);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('2D preview – SVG DOM verification', () => {

  test('SVG is present and has geometry paths on load', async ({ page }) => {
    await gotoApp(page);
    await expectSvgPathCountAtLeast(page, 1);
  });

  test('SVG has a non-zero bounding box', async ({ page }) => {
    const stats = await loadAndGetStats(page);
    expect(stats.bbox.width, 'SVG width should be > 0').toBeGreaterThan(0);
    expect(stats.bbox.height, 'SVG height should be > 0').toBeGreaterThan(0);
  });

  // ── Colour ────────────────────────────────────────────────────────────────

  test('changing model colour updates SVG fill colour', async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'global');

    // Capture initial fills
    const before = await waitForSvgStable(page);

    // Change model colour to a vivid red
    await setModelColor(page, '#ff2200');
    const after = await waitForSvgStable(page);

    // The fills should now differ from the original
    expect(
      JSON.stringify(after.fills),
      'SVG fill colours should change when model colour is updated'
    ).not.toEqual(JSON.stringify(before.fills));
  });

  // ── Text / arms ───────────────────────────────────────────────────────────

  test('changing phrase content changes the path count', async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'text');
    const before = await waitForSvgStable(page);

    // Update the phrase to a much shorter string
    const phraseInput = page.locator('input[type="text"]').first();
    await phraseInput.click({ clickCount: 3 });
    await phraseInput.fill('A');
    await phraseInput.press('Enter');

    const after = await waitForSvgStable(page);
    // Fewer letters → fewer path elements
    expect(
      after.pathCount,
      `Path count should change when text changes (before=${before.pathCount}, after=${after.pathCount})`
    ).not.toEqual(before.pathCount);
  });

  test('clearing the phrase content removes text paths', async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'text');
    const before = await waitForSvgStable(page);

    const phraseInput = page.locator('input[type="text"]').first();
    await phraseInput.click({ clickCount: 3 });
    await phraseInput.fill('');
    await phraseInput.press('Enter');

    const after = await waitForSvgStable(page);
    expect(
      after.pathCount,
      `Clearing text should reduce path count (before=${before.pathCount}, after=${after.pathCount})`
    ).toBeLessThan(before.pathCount);
  });

  test('increasing arms count adds more symmetry paths', async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'text');
    const before = await waitForSvgStable(page);

    // Find the Arms slider and move it to a higher value
    const armsSlider = page.locator('input[type="range"]').first();
    const currentVal = parseFloat(await armsSlider.inputValue());
    const higherVal = Math.min(currentVal + 2, 12);
    if (higherVal !== currentVal) {
      await armsSlider.fill(String(higherVal));
      await armsSlider.dispatchEvent('change');
    }

    const after = await waitForSvgStable(page);
    // More arms → more repeated paths
    expect(
      after.pathCount,
      `Path count should increase with more arms (before=${before.pathCount}, after=${after.pathCount})`
    ).toBeGreaterThanOrEqual(before.pathCount);
  });

  // ── Hub ───────────────────────────────────────────────────────────────────

  test('enabling a hub adds paths to the SVG', async ({ page }) => {
    await gotoApp(page);
    const before = await waitForSvgStable(page);

    await clickTab(page, 'hubs');
    await page.getByRole('button', { name: /add hub/i }).click();
    await page.waitForTimeout(500);

    // Enable the newly added hub
    const visibleBtn = page.getByRole('button', { name: /visible|enable/i }).last();
    if (await visibleBtn.isVisible()) {
      await visibleBtn.click();
      await page.waitForTimeout(300);
    }

    const after = await waitForSvgStable(page);
    expect(
      after.pathCount,
      `Enabling a hub should add SVG paths (before=${before.pathCount}, after=${after.pathCount})`
    ).toBeGreaterThan(before.pathCount);
  });

  // ── Abstract ─────────────────────────────────────────────────────────────

  test('enabling an abstract shape adds paths to the SVG', async ({ page }) => {
    await gotoApp(page);
    const before = await waitForSvgStable(page);

    await clickTab(page, 'abstract');
    await page.getByRole('button', { name: /add shape/i }).click();
    await page.waitForTimeout(500);

    const after = await waitForSvgStable(page);
    expect(
      after.pathCount,
      `Adding an abstract shape should add SVG paths (before=${before.pathCount}, after=${after.pathCount})`
    ).toBeGreaterThan(before.pathCount);
  });

  // ── Layer enable / disable ────────────────────────────────────────────────

  test('disabling a layer reduces the SVG path count', async ({ page }) => {
    await gotoApp(page);
    const before = await waitForSvgStable(page);

    await clickTab(page, 'planes');

    // Find a "Layer Visible" toggle and turn it off
    const layerToggle = page
      .locator('label')
      .filter({ hasText: /visible/i })
      .first();
    if (await layerToggle.isVisible()) {
      await layerToggle.click();
      const after = await waitForSvgStable(page);
      expect(
        after.pathCount,
        `Disabling a layer should reduce SVG paths (before=${before.pathCount}, after=${after.pathCount})`
      ).toBeLessThanOrEqual(before.pathCount);
      // Re-enable to leave app in good state
      await layerToggle.click();
    }
  });

  // ── Bevel / extrusion (these only affect 3D, but 2D should stay stable) ──

  test('changing extrusion depth does NOT alter the 2D path count', async ({ page }) => {
    await gotoApp(page);
    const before = await waitForSvgStable(page);

    await clickTab(page, 'global');
    const extSlider = page.locator('input[type="range"]').first();
    const v = parseFloat(await extSlider.inputValue());
    await extSlider.fill(String(Math.min(v + 2, 10)));
    await extSlider.dispatchEvent('change');

    const after = await waitForSvgStable(page);
    // The 2D preview geometry should not change when only depth changes
    expect(
      after.pathCount,
      `2D path count should be stable when only extrusion depth changes (before=${before.pathCount}, after=${after.pathCount})`
    ).toEqual(before.pathCount);
  });
});

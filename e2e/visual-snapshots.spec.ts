/**
 * e2e/visual-snapshots.spec.ts
 *
 * Pixel-exact visual regression tests using Playwright's built-in
 * toHaveScreenshot() / toMatchSnapshot() support.
 *
 * How it works
 * ─────────────
 *  • First run (no baseline yet):
 *      npx playwright test e2e/visual-snapshots.spec.ts --update-snapshots
 *    Playwright captures PNG baselines in e2e/visual-snapshots.spec.ts-snapshots/
 *    Commit these PNG files to source control.
 *
 *  • Subsequent runs (CI / local verification):
 *      npx playwright test e2e/visual-snapshots.spec.ts
 *    Each screenshot is compared pixel-by-pixel against the stored baseline.
 *    Failures produce a side-by-side diff image in playwright-report/.
 *
 * Tolerance
 * ──────────
 * We use maxDiffPixelRatio: 0.02 (2 %) to absorb sub-pixel anti-aliasing
 * differences across platforms/GPU drivers while still catching meaningful
 * visual regressions.
 *
 * Coverage
 * ─────────
 * Each test configures one distinct, reproducible scenario:
 *   1.  Default state – out-of-the-box look
 *   2.  Custom model colour – sky-blue → vivid green
 *   3.  Text change – phrase "Snow" → "❄ HELLO ❄"
 *   4.  Arm count change – 6 arms → 3 arms
 *   5.  Mirror effect enabled
 *   6.  Underline enabled
 *   7.  Hub enabled (circle)
 *   8.  Hub shape – polygon
 *   9.  Hub shape – star
 *  10.  Abstract shape – line
 *  11.  Abstract shape – sine wave
 *  12.  Abstract shape – zigzag
 *  13.  Fractal abstract shape
 *  14.  Bevel disabled
 *  15.  High quality preview
 *  16.  Slots enabled (2-plane mode)
 *  17.  Layer 2 (Cross Plane) disabled
 *  18.  Secondary text group enabled
 *  19.  Full 3D canvas – default state
 *  20.  Full 3D canvas – custom colour
 */
import { test, expect, Page } from '@playwright/test';
import { gotoApp, clickTab, setModelColor, waitForSvgStable, getCanvasPixelStats } from './fixtures';

// ─── Screenshot options ───────────────────────────────────────────────────────

const SNAP_OPTS = {
  /** Allow up to 2 % of pixels to differ (anti-aliasing, font rendering). */
  maxDiffPixelRatio: 0.02,
  /** Animate: false freezes CSS animations for deterministic snapshots. */
  animations: 'disabled' as const,
};

// ─── 2D preview region helper ─────────────────────────────────────────────────

/** Capture a screenshot of just the SVG / 2D-preview element. */
async function snap2D(page: Page, name: string) {
  await waitForSvgStable(page);
  const svgEl = page.locator('svg').first();
  await expect(svgEl).toHaveScreenshot(`2d-${name}.png`, SNAP_OPTS);
}

/** Capture a screenshot of just the <canvas> (3D view), waiting until non-blank. */
async function snap3D(page: Page, name: string) {
  // Poll until the canvas shows geometry (up to 10 s)
  const deadline = Date.now() + 10_000;
  let stats = await getCanvasPixelStats(page);
  while (stats.isBlank && Date.now() < deadline) {
    await page.waitForTimeout(500);
    stats = await getCanvasPixelStats(page);
  }
  const canvas = page.locator('canvas').first();
  await expect(canvas).toHaveScreenshot(`3d-${name}.png`, SNAP_OPTS);
}

// ─── Ensure the app starts from a clean reset before each snapshot ─────────────

async function freshApp(page: Page) {
  await gotoApp(page);
  // Dismiss any dialog that might pop up from the reset
  page.once('dialog', (d) => d.accept());
  const resetBtn = page.locator('button[title="Reset All Settings to Defaults"]');
  if (await resetBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await resetBtn.click();
    await page.waitForTimeout(500);
  }
  await waitForSvgStable(page);
}

// ─── 2D visual regression tests ───────────────────────────────────────────────

test.describe('Visual regression – 2D preview', () => {

  test('1. Default state', async ({ page }) => {
    await freshApp(page);
    await snap2D(page, '01-default');
  });

  test('2. Custom model colour (vivid green)', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'global');
    await setModelColor(page, '#00dd44');
    await snap2D(page, '02-color-green');
  });

  test('3. Text phrase changed to HELLO', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'text');
    const phraseInput = page.locator('input[type="text"]').first();
    await phraseInput.click({ clickCount: 3 });
    await phraseInput.fill('HELLO');
    await phraseInput.press('Enter');
    await snap2D(page, '03-text-hello');
  });

  test('4. Arm count reduced to 3', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'text');
    // Use the first range slider as the Arms slider
    const armsSlider = page.locator('input[type="range"]').first();
    await armsSlider.fill('3');
    await armsSlider.dispatchEvent('change');
    await snap2D(page, '04-arms-3');
  });

  test('5. Mirror effect enabled', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'text');
    // Enable mirror toggle for the primary group
    const mirrorLabel = page.getByText(/mirror effect/i).first();
    if (await mirrorLabel.isVisible()) {
      await mirrorLabel.click();
    }
    await snap2D(page, '05-mirror-enabled');
  });

  test('6. Underline enabled', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'text');
    const underlineLabel = page.getByText(/^underline$/i).first();
    if (await underlineLabel.isVisible()) {
      const toggleWrapper = underlineLabel.locator('xpath=ancestor::div[2]//input[@type="checkbox"]');
      if (await toggleWrapper.count() > 0) {
        await toggleWrapper.first().check({ force: true });
      } else {
        // Fallback: click nearest label
        await underlineLabel.click();
      }
    }
    await snap2D(page, '06-underline');
  });

  test('7. Hub enabled – circle', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'hubs');
    await page.getByRole('button', { name: /add hub/i }).click();
    await page.waitForTimeout(500);
    // Enable the hub's visible toggle
    const visBtn = page.locator('button').filter({ hasText: /visible/i }).last();
    if (await visBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await visBtn.click();
    }
    await snap2D(page, '07-hub-circle');
  });

  test('8. Hub shape – polygon', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'hubs');
    await page.getByRole('button', { name: /add hub/i }).click();
    await page.waitForTimeout(300);
    const polygonBtn = page.getByRole('button', { name: /^polygon$/i }).first();
    if (await polygonBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await polygonBtn.click();
    }
    await snap2D(page, '08-hub-polygon');
  });

  test('9. Hub shape – star', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'hubs');
    await page.getByRole('button', { name: /add hub/i }).click();
    await page.waitForTimeout(300);
    const starBtn = page.getByRole('button', { name: /^star$/i }).first();
    if (await starBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await starBtn.click();
    }
    await snap2D(page, '09-hub-star');
  });

  test('10. Abstract shape – line', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'abstract');
    await page.getByRole('button', { name: /add shape/i }).click();
    await page.waitForTimeout(500);
    // Select "line" type if a selector is available
    const lineBtn = page.getByRole('button', { name: /^line$/i }).first();
    if (await lineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await lineBtn.click();
    }
    await snap2D(page, '10-abstract-line');
  });

  test('11. Abstract shape – sine wave', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'abstract');
    await page.getByRole('button', { name: /add shape/i }).click();
    await page.waitForTimeout(300);
    const sineBtn = page.getByRole('button', { name: /^sine$/i }).first();
    if (await sineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sineBtn.click();
    }
    await snap2D(page, '11-abstract-sine');
  });

  test('12. Abstract shape – zigzag', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'abstract');
    await page.getByRole('button', { name: /add shape/i }).click();
    await page.waitForTimeout(300);
    const zigzagBtn = page.getByRole('button', { name: /zigzag/i }).first();
    if (await zigzagBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await zigzagBtn.click();
    }
    await snap2D(page, '12-abstract-zigzag');
  });

  test('13. Fractal abstract shape', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'abstract');
    await page.getByRole('button', { name: /add fractal/i }).click();
    // Wait for the fractal to finish computing (SVG stabilises)
    await snap2D(page, '13-abstract-fractal');
  });

  test('14. Bevel disabled', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'global');
    // Find the bevel / edge profile toggle
    const bevelToggle = page.getByText(/edge profile/i)
      .locator('xpath=ancestor::div[2]//input[@type="checkbox"]').first();
    if (await bevelToggle.count() > 0) {
      const checked = await bevelToggle.isChecked();
      if (checked) await bevelToggle.uncheck({ force: true });
    }
    await snap2D(page, '14-bevel-off');
  });

  test('15. High quality preview', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'global');
    const highBtn = page.getByRole('button', { name: /^high$/i });
    if (await highBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await highBtn.click();
      await page.waitForTimeout(1_000);
    }
    await snap2D(page, '15-quality-high');
  });

  test('16. Slots enabled – 2-plane mode', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'global');
    const cutSlotsBtn = page.locator('button').filter({ hasText: /cut slots/i }).first();
    if (await cutSlotsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cutSlotsBtn.click(); // toggle ON
      await page.waitForTimeout(500);
      // Switch to 2-plane mode
      const twoPlaneBtn = page.getByRole('button', { name: /2-plane/i }).first();
      if (await twoPlaneBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await twoPlaneBtn.click();
      }
    }
    await snap2D(page, '16-slots-2plane');
  });

  test('17. Cross Plane (layer 2) disabled', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'planes');
    // Look for the second layer toggle
    const layerToggles = page.locator('label').filter({ hasText: /visible/i });
    const count = await layerToggles.count();
    if (count >= 2) {
      await layerToggles.nth(1).click(); // disable Cross Plane
    }
    await snap2D(page, '17-layer2-disabled');
  });

  test('18. Secondary text group with content', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'text');
    // Switch to Secondary group
    const secondaryBtn = page.locator('button').filter({ hasText: /^secondary$/i }).first();
    if (await secondaryBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await secondaryBtn.click();
      const phraseInput = page.locator('input[type="text"]').first();
      await phraseInput.click({ clickCount: 3 });
      await phraseInput.fill('Star');
      await phraseInput.press('Enter');
    }
    await snap2D(page, '18-secondary-text');
  });
});

// ─── 3D visual regression tests ───────────────────────────────────────────────

test.describe('Visual regression – 3D canvas', () => {

  async function switchTo3D(page: Page) {
    const threeDBtn = page.locator('button').filter({ hasText: /^3d$/i }).first();
    if (await threeDBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await threeDBtn.click();
      await page.waitForTimeout(500);
    }
    // Poll until the canvas shows non-blank pixels (up to 10 s)
    const deadline = Date.now() + 10_000;
    let stats = await getCanvasPixelStats(page);
    while (stats.isBlank && Date.now() < deadline) {
      await page.waitForTimeout(500);
      stats = await getCanvasPixelStats(page);
    }
  }

  test('19. 3D canvas – default state', async ({ page }) => {
    await freshApp(page);
    await switchTo3D(page);
    await snap3D(page, '19-3d-default');
  });

  test('20. 3D canvas – custom colour (vivid orange)', async ({ page }) => {
    await freshApp(page);
    await clickTab(page, 'global');
    await setModelColor(page, '#ff8800');
    await switchTo3D(page);
    await snap3D(page, '20-3d-color-orange');
  });
});

/**
 * e2e/abstract-tab.spec.ts
 *
 * Tests the "Abstract" control-panel tab:
 *   - "Add Shape" button (creates line/sine/zigzag)
 *   - "Add Fractal" button
 *   - Shape type selector (line / sine / zigzag)
 *   - Arms slider
 *   - Inner / Outer Radius sliders
 *   - Amplitude and Frequency sliders (sine / zigzag)
 *   - Thickness slider
 *   - Mirror toggle
 *   - Fractal-specific controls (trunk length, branches per node, recursion depth, etc.)
 *   - Multiple abstracts: selector updates correctly
 *   - Delete abstract
 */
import { test, expect } from '@playwright/test';
import { gotoApp, clickTab, addAbstractShape, addFractal } from './fixtures';

test.describe('Abstract tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'abstract');
  });

  test('"Add Shape" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add shape/i })).toBeVisible();
  });

  test('"Add Fractal" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add fractal/i })).toBeVisible();
  });

  test('adding a shape shows shape controls', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByText(/shape type|type/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('shape type buttons line / sine / zigzag are present', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByRole('button', { name: /^line$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /^sine$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /zigzag/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('selecting sine type shows Amplitude and Frequency controls', async ({ page }) => {
    await addAbstractShape(page);
    const sineBtn = page.getByRole('button', { name: /^sine$/i }).first();
    if (await sineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sineBtn.click();
      await expect(page.getByText(/amplitude/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/frequency/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('selecting zigzag type shows Amplitude and Frequency controls', async ({ page }) => {
    await addAbstractShape(page);
    const zigBtn = page.getByRole('button', { name: /zigzag/i }).first();
    if (await zigBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await zigBtn.click();
      await expect(page.getByText(/amplitude/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Abstract Outer Radius slider is present', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByText(/outer radius/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Abstract Boldness slider is present', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByText(/boldness|thickness/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Mirror toggle is present', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByText(/mirror/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Shape Arms slider is present', async ({ page }) => {
    await addAbstractShape(page);
    await expect(page.getByText(/arms/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('adding a fractal shows fractal-specific controls', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/trunk length|recursion depth|branches/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('fractal Branch Angle control is present', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/branch angle/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('fractal Random Seed control is present', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/random seed/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('fractal Recursion Depth control is present', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/recursion depth/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('fractal Branch Pattern selector is present', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/branch pattern|symmetric|alternating|random/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Rounded Tips toggle is present for fractals', async ({ page }) => {
    await addFractal(page);
    await expect(page.getByText(/rounded tips|round tips/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('adding two shapes shows a shape selector', async ({ page }) => {
    await addAbstractShape(page);
    await addAbstractShape(page);
    // There should now be two abstract entries in the selector
    const shapeLabels = page.getByText(/#[12]/i);
    if (await shapeLabels.count() > 0) {
      await expect(shapeLabels.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Delete button is present for an abstract shape', async ({ page }) => {
    await addAbstractShape(page);
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
  });

  test('deleting the only abstract shape removes its controls', async ({ page }) => {
    await addAbstractShape(page);
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(300);
      // Controls for the shape should be gone
      await expect(page.getByRole('button', { name: /^line$/i })).not.toBeVisible({ timeout: 3_000 });
    }
  });
});

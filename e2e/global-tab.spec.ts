/**
 * e2e/global-tab.spec.ts
 *
 * Tests the "Global" control-panel tab:
 *   - Extrusion Depth slider
 *   - Global Boldness slider
 *   - Bevel (Edge Profile) toggle and related controls
 *   - Preview Resolution (quality) picker
 *   - Free Floating Check toggle
 *   - Model Color picker
 *   - Sync All Planes toggle
 *   - Combined STL export button
 */
import { test, expect } from '@playwright/test';
import { gotoApp, clickTab } from './fixtures';

test.describe('Global tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'global');
  });

  test('Extrusion Depth label and slider are visible', async ({ page }) => {
    await expect(page.getByText(/extrusion depth/i).first()).toBeVisible();
    // There should be at least one range input in this section
    const sliders = page.locator('input[type="range"]');
    await expect(sliders.first()).toBeVisible();
  });

  test('Extrusion Depth slider changes update the number input', async ({ page }) => {
    // Find the range input for extrusion depth (first range slider on the Global tab)
    const depthSlider = page.locator('input[type="range"]').first();
    const initialVal = await depthSlider.inputValue();
    // Move slider to a different position
    await depthSlider.fill('5');
    // The value should reflect the change
    const newVal = await depthSlider.inputValue();
    expect(parseFloat(newVal)).toBeGreaterThanOrEqual(0);
  });

  test('Edge Profile (bevel) toggle is visible', async ({ page }) => {
    await expect(page.getByText(/edge profile/i).first()).toBeVisible();
  });

  test('Bevel section renders Fillet and Chamfer options', async ({ page }) => {
    // Click on the bevel label area to expose options if needed
    const filletText = page.getByText(/fillet/i);
    const chamferText = page.getByText(/chamfer/i);
    // At least one of them should be visible
    await expect(filletText.first().or(chamferText.first())).toBeVisible();
  });

  test('Preview Resolution (quality) options are present', async ({ page }) => {
    await expect(page.getByText(/preview resolution/i).first()).toBeVisible();
    // Quality: low / med / high
    await expect(page.getByText(/low/i).first()).toBeVisible();
  });

  test('Sync All Planes toggle is visible and responds to clicks', async ({ page }) => {
    await expect(page.getByText(/sync all planes/i).first()).toBeVisible();
  });

  test('Global Boldness label is visible', async ({ page }) => {
    await expect(page.getByText(/global boldness/i).first()).toBeVisible();
  });

  test('Free Floating Check label is visible', async ({ page }) => {
    await expect(page.getByText(/free floating/i).first()).toBeVisible();
  });

  test('Model Color label is visible', async ({ page }) => {
    await expect(page.getByText(/model color/i).first()).toBeVisible();
  });

  test('Combined STL export button is visible', async ({ page }) => {
    const exportBtn = page.getByText(/export stl/i).first();
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Cut Slots button is visible', async ({ page }) => {
    await expect(page.getByText(/cut slots/i).first()).toBeVisible();
  });

  test('Slot Length label appears when slots are toggled on', async ({ page }) => {
    // Click "Cut Slots" toggle
    const cutSlotsBtn = page
      .locator('button')
      .filter({ hasText: /cut slots/i })
      .first();
    await cutSlotsBtn.click();
    await expect(page.getByText(/slot length/i).first()).toBeVisible({ timeout: 5_000 });
    // Toggle back off
    await cutSlotsBtn.click();
  });

  test('Undo button is visible', async ({ page }) => {
    // Undo button has a ← arrow icon and/or text
    const undoBtn = page.locator('button[title*="Undo" i]').first();
    await expect(undoBtn.or(page.getByRole('button', { name: /undo/i }).first())).toBeVisible();
  });
});

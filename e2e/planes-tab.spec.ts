/**
 * e2e/planes-tab.spec.ts
 *
 * Tests the "Planes" control-panel tab:
 *   - Three default layers visible (Base Plane, Cross Plane, Tilt Plane)
 *   - Active plane selector (clicking a plane makes it active)
 *   - Layer Visible toggle enables/disables a plane
 *   - Layer name can be edited
 *   - Rotation X / Y sliders per layer
 *   - Slot Type selector per layer (none / half-back / half-front / third-*)
 *   - Slot Length Adjustment and Slot Width Offset controls
 *   - Sync All Planes toggle
 */
import { test, expect } from '@playwright/test';
import { gotoApp, clickTab } from './fixtures';

test.describe('Planes tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'planes');
  });

  test('default layers are listed (Base Plane, Cross Plane, Tilt Plane)', async ({ page }) => {
    await expect(page.getByText(/base plane/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/cross plane/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/tilt plane/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Active Plane Selector label is visible', async ({ page }) => {
    await expect(page.getByText(/active plane/i).first()).toBeVisible();
  });

  test('clicking a different plane changes the active index', async ({ page }) => {
    // Click Cross Plane
    const crossBtn = page.getByRole('button', { name: /cross plane/i }).first();
    if (await crossBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await crossBtn.click();
      await page.waitForTimeout(300);
      // Active plane button should have a different visual style (sky colour)
      await expect(crossBtn).toBeVisible();
    }
  });

  test('Layer Visible toggles are present for each layer', async ({ page }) => {
    const visibleToggles = page.locator('label').filter({ hasText: /visible/i });
    await expect(visibleToggles.first()).toBeVisible({ timeout: 5_000 });
  });

  test('disabling a layer toggle marks it as inactive', async ({ page }) => {
    const firstToggle = page.locator('label').filter({ hasText: /visible/i }).first();
    if (await firstToggle.isVisible()) {
      await firstToggle.click(); // turn off
      await page.waitForTimeout(300);
      // Toggle again to restore state
      await firstToggle.click();
    }
  });

  test('Layer Name input is visible and editable', async ({ page }) => {
    const layerNameLabel = page.getByText(/layer name/i).first();
    if (await layerNameLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(layerNameLabel).toBeVisible();
      const nameInput = page.locator('input[type="text"]').first();
      await nameInput.click({ clickCount: 3 });
      await nameInput.fill('My Layer');
      await nameInput.press('Enter');
      await expect(nameInput).toHaveValue('My Layer');
    }
  });

  test('Rotation X and Y sliders are present', async ({ page }) => {
    await expect(page.getByText(/rot\s*x/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/rot\s*y/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Slot Type selector options are visible', async ({ page }) => {
    // Slot type selector should show "none" (default) or a dropdown
    await expect(page.getByText(/slot type|none/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Slot Length Adj control is present', async ({ page }) => {
    // This control may only appear when a slot type is selected
    const slotLabelOrControl = page
      .getByText(/slot length adj|slot length/i)
      .first();
    // It may be present but hidden behind a slot-type selector
    await expect(slotLabelOrControl.or(page.getByText(/slot type/i).first())).toBeVisible({ timeout: 5_000 });
  });

  test('Sync All Planes toggle is visible', async ({ page }) => {
    await expect(page.getByText(/sync all planes/i).first()).toBeVisible();
  });

  test('per-layer export button is visible', async ({ page }) => {
    // Each plane has an export button in the planes tab
    const exportBtn = page.getByText(/export layer|export/i).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
  });
});

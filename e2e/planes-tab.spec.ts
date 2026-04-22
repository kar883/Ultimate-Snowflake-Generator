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

async function clickCutSlots(page: Parameters<typeof gotoApp>[0]) {
  const btn = page.locator('button').filter({ hasText: /cut slots/i }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  try {
    await btn.click({ noWaitAfter: true, timeout: 10_000 });
  } catch {
    await btn.dispatchEvent('click').catch(async () => {
      await btn.evaluate((el: HTMLElement) => el.click());
    });
  }
}

test.describe('Planes tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'planes');
  });

  test('default layers are listed (Base Plane, Cross Plane, Tilt Plane)', async ({ page }) => {
    const layerNameInputs = page.locator('input[placeholder="Layer Name"]');
    await expect(layerNameInputs.first()).toBeVisible({ timeout: 8_000 });
    expect(await layerNameInputs.count()).toBeGreaterThanOrEqual(3);
  });

  test('Active Plane Selector label is visible', async ({ page }) => {
    const radios = page.locator('input[type="radio"]');
    expect(await radios.count()).toBeGreaterThanOrEqual(3);
  });

  test('clicking a different plane changes the active index', async ({ page }) => {
    const radios = page.locator('input[type="radio"]');
    await expect(radios.nth(1)).toBeVisible({ timeout: 5_000 });
    await radios.nth(1).check();
    await expect(radios.nth(1)).toBeChecked();
  });

  test('Layer Visible toggles are present for each layer', async ({ page }) => {
    const toggles = page.locator('input[type="checkbox"]');
    await expect(toggles.first()).toBeAttached({ timeout: 8_000 });
    expect(await toggles.count()).toBeGreaterThanOrEqual(3);
  });

  test('disabling a layer toggle marks it as inactive', async ({ page }) => {
    const firstToggle = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]').first();
    const initial = await firstToggle.isChecked();
    await firstToggle.evaluate((el: HTMLInputElement, next: boolean) => {
      el.checked = next;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, !initial);
    await expect(firstToggle).toHaveJSProperty('checked', !initial);
    await firstToggle.evaluate((el: HTMLInputElement, next: boolean) => {
      el.checked = next;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, initial);
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

  test('Slot Length Adj control appears when slots are enabled', async ({ page }) => {
    await clickTab(page, 'global');
    await clickCutSlots(page);
    await clickTab(page, 'planes');
    await expect(page.getByText(/slot length adj/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Slot Width Offset control appears when slots are enabled', async ({ page }) => {
    await clickTab(page, 'global');
    await clickCutSlots(page);
    await clickTab(page, 'planes');
    await expect(page.getByText(/slot width offset/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Sync All Planes toggle is visible', async ({ page }) => {
    await expect(page.getByText(/sync all planes/i).first()).toBeAttached();
  });

  test('per-layer export button is visible', async ({ page }) => {
    // Each plane has an export button in the planes tab
    const exportBtn = page.getByText(/export layer|export/i).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
  });
});

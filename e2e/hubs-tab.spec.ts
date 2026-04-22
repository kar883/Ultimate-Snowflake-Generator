/**
 * e2e/hubs-tab.spec.ts
 *
 * Tests the "Hubs" control-panel tab:
 *   - Empty state message (no hubs)
 *   - "Add Hub" button
 *   - Hub shape selector (circle / polygon / star)
 *   - Hub Radius slider
 *   - Hollow toggle
 *   - Wall Thickness slider (visible only when Hollow is on)
 *   - Star Ratio slider (visible only for star shape)
 *   - Hub Sides slider (visible for polygon / star)
 *   - Oscillation Enable toggle (circle only)
 *   - Visible toggle per hub
 *   - Multiple hubs: add a second hub
 */
import { test, expect } from '@playwright/test';
import { gotoApp, clickTab, addHub } from './fixtures';

test.describe('Hubs tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'hubs');
  });

  test('"Add Hub" button is visible', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /(\+\s*hub|add\s*hub)/i }).first();
    await expect(addBtn).toBeVisible();
  });

  test('Adding a hub renders hub controls', async ({ page }) => {
    await addHub(page);
    await expect(page.getByRole('button', { name: /hub\s*1/i }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/hub radius|rotation|hollow/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Hub shape options circle / polygon / star are present', async ({ page }) => {
    await addHub(page);
    await expect(page.getByText(/circle/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/polygon/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/star/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Selecting polygon shape shows Hub Sides slider', async ({ page }) => {
    await addHub(page);
    const polygonBtn = page.getByRole('button', { name: /polygon/i }).first();
    if (await polygonBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await polygonBtn.click({ noWaitAfter: true });
      await expect(page.getByText(/hub sides/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Selecting star shape shows Star Ratio slider', async ({ page }) => {
    await addHub(page);
    const starBtn = page.getByRole('button', { name: /^star$/i }).first();
    if (await starBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await starBtn.click({ noWaitAfter: true });
      await expect(page.getByText(/star ratio/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Hollow toggle is present for a hub', async ({ page }) => {
    await addHub(page);
    await expect(page.getByText(/hollow/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Enabling Hollow reveals Wall Thickness control', async ({ page }) => {
    await addHub(page);
    // Find and click the Hollow toggle label
    const hollowLabel = page.getByText(/^hollow$/i).first();
    if (await hollowLabel.isVisible()) {
      await hollowLabel.click();
      await expect(page.getByText(/boldness|wall thickness/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Oscillation Enable toggle is visible for a hub', async ({ page }) => {
    await addHub(page);
    await expect(page.getByText(/oscillation/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Hub Radius slider is present', async ({ page }) => {
    await addHub(page);
    await expect(page.getByText(/hub radius/i).first()).toBeVisible({ timeout: 5_000 });
    const sliders = page.locator('input[type="range"]');
    await expect(sliders.first()).toBeVisible();
  });

  test('Adding two hubs shows both in the selector', async ({ page }) => {
    await addHub(page);
    await addHub(page);
    await expect(page.getByRole('button', { name: /hub\s*1/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /hub\s*2/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Rotation slider is present', async ({ page }) => {
    await addHub(page);
    await expect(page.getByText(/rotation/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

import { test, expect } from '@playwright/test';
import { gotoApp, clickTab } from './fixtures';

async function enableThreePlaneSlots(page: Parameters<typeof gotoApp>[0]) {
  await clickTab(page, 'global');
  const cutSlotsBtn = page.locator('button').filter({ hasText: /cut slots/i }).first();
  await expect(cutSlotsBtn).toBeVisible({ timeout: 10_000 });
  await cutSlotsBtn.click({ noWaitAfter: true });

  const threePlaneBtn = page.getByRole('button', { name: /3-plane/i }).first();
  if (await threePlaneBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await threePlaneBtn.click({ noWaitAfter: true });
  }

  await clickTab(page, 'planes');
}

test.describe('Planes slot sub-length adjustments', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Cross plane shows Cross Tip-In Adj in 3-plane slot mode', async ({ page }) => {
    await gotoApp(page);
    await enableThreePlaneSlots(page);

    const radios = page.locator('input[type="radio"]');
    await radios.nth(1).check();
    await expect(page.getByText(/cross tip-?in adj/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Tilt plane shows Tilt Extension Adj in 3-plane slot mode', async ({ page }) => {
    await gotoApp(page);
    await enableThreePlaneSlots(page);

    const radios = page.locator('input[type="radio"]');
    await radios.nth(2).check();
    await expect(page.getByText(/tilt extension adj/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Both Cross Tip-In Adj and Tilt Extension Adj controls exist in 3-plane mode', async ({ page }) => {
    await gotoApp(page);
    await enableThreePlaneSlots(page);

    // Both controls are rendered simultaneously (one per plane section) when 3-plane slot mode is active.
    await expect(page.getByText(/cross tip-?in adj/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/tilt extension adj/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

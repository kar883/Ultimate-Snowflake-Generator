/**
 * e2e/header.spec.ts
 *
 * Tests the header bar: project-name input, Save / Load / Reset buttons,
 * and the Settings gear button.
 */
import { test, expect } from '@playwright/test';
import { gotoApp } from './fixtures';

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('project name input has a default value', async ({ page }) => {
    const input = page.getByPlaceholder('PROJECT NAME');
    await expect(input).toBeVisible();
    // Default project name is "MySnowflake"
    await expect(input).toHaveValue('MySnowflake');
  });

  test('project name can be changed', async ({ page }) => {
    const input = page.getByPlaceholder('PROJECT NAME');
    await input.triple_click();
    await input.fill('TestProject');
    await input.press('Enter');
    await expect(input).toHaveValue('TestProject');
  });

  test('Save button is visible and clickable', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /^save$/i });
    await expect(saveBtn).toBeVisible();
    // Click should not throw
    await saveBtn.click();
  });

  test('Load button is visible and clickable', async ({ page }) => {
    const loadBtn = page.getByRole('button', { name: /^load$/i });
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();
    // After clicking Load a file picker opens – dismiss it by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('Reset button (orange) is visible', async ({ page }) => {
    // The reset button has a title attribute
    const resetBtn = page.locator('button[title="Reset All Settings to Defaults"]');
    await expect(resetBtn).toBeVisible();
  });

  test('Reset button resets the app', async ({ page }) => {
    // Change project name first
    const input = page.getByPlaceholder('PROJECT NAME');
    await input.triple_click();
    await input.fill('Changed');
    await input.press('Enter');

    // Click Reset
    page.once('dialog', (dialog) => dialog.accept());
    const resetBtn = page.locator('button[title="Reset All Settings to Defaults"]');
    await resetBtn.click();
    // After reset the project name should return to the default
    await expect(input).toHaveValue('MySnowflake', { timeout: 5_000 });
  });

  test('Settings gear button opens the shortcuts modal', async ({ page }) => {
    const gearBtn = page.locator('button[title="Settings & Shortcuts"]');
    await expect(gearBtn).toBeVisible();
    await gearBtn.click();
    // The modal should become visible
    await expect(page.getByText(/shortcuts/i).first()).toBeVisible({ timeout: 5_000 });
    // Close with Escape
    await page.keyboard.press('Escape');
  });
});

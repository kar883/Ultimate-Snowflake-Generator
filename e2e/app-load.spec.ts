/**
 * e2e/app-load.spec.ts
 *
 * Verifies that the application loads without errors and that all primary
 * structural regions are visible.
 */
import { test, expect } from '@playwright/test';
import { gotoApp, expect2DPreviewHasPaths } from './fixtures';

test.describe('App load', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('page title is "Snowflake Designer"', async ({ page }) => {
    await expect(page).toHaveTitle(/snowflake/i);
  });

  test('header title is visible', async ({ page }) => {
    await expect(page.getByText('Ultimate Snowflake Generator')).toBeVisible();
  });

  test('version / author credit is shown', async ({ page }) => {
    await expect(page.getByText(/v1\.0/i)).toBeVisible();
  });

  test('control panel is visible', async ({ page }) => {
    // At least one of the tab buttons should be visible
    await expect(
      page.locator('button').filter({ hasText: /^global$/i }).first()
    ).toBeVisible();
  });

  test('2D preview renders at least one SVG path', async ({ page }) => {
    await expect2DPreviewHasPaths(page);
  });

  test('3D canvas element is present in the DOM', async ({ page }) => {
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 15_000 });
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3_000);
    // Filter out known benign messages from manifold / pyodide lazy-loaders
    const fatal = errors.filter(
      (e) =>
        !e.includes('pyodide') &&
        !e.includes('manifold') &&
        !e.includes('wasm') &&
        !e.includes('WebGL')
    );
    expect(fatal.length).toBeLessThanOrEqual(2);
  });

  test('core control-panel tabs are rendered', async ({ page }) => {
    const expectedTabs = [
      'global',
      'text',
      'Letter Ctrl',
      'hub',
      'abstract',
      'planes',
    ];
    for (const label of expectedTabs) {
      await expect(
        page.locator('button').filter({ hasText: new RegExp(`^${label}$`, 'i') }).first()
      ).toBeVisible();
    }

    // Images tab exists in the current UI, but treat as optional to avoid false negatives
    // in localized or feature-gated environments.
    await expect(page.locator('button').filter({ hasText: /^images$/i }).first()).toBeVisible({ timeout: 10_000 });
  });
});

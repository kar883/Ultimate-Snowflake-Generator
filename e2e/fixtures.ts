/**
 * Shared helpers / fixtures for the Snowflake Generator E2E suite.
 *
 * All helper functions accept a `Page` object so they can be imported
 * into any spec file without needing a custom `test` fixture.
 */
import { Page, Locator, expect } from '@playwright/test';

// ─── Navigation ──────────────────────────────────────────────────────────────

/**
 * Navigate to the app root and wait until the React app has hydrated and
 * the header title is visible.
 */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Wait for the title to confirm the app has rendered
  await expect(page.getByText('Ultimate Snowflake Generator')).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Click a tab in the control panel by its label (case-insensitive).
 * Tab text is visually uppercase via CSS, so match on the underlying DOM text.
 */
export async function clickTab(page: Page, label: string): Promise<void> {
  // The control panel renders tabs as buttons in a 7-column grid.
  // Their text is the raw (un-transformed) label stored in TAB_LABELS.
  const tab = page
    .locator('button')
    .filter({ hasText: new RegExp(`^${label}$`, 'i') })
    .first();
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  // Small pause for tab content to mount
  await page.waitForTimeout(200);
}

// ─── Control-panel section helpers ───────────────────────────────────────────

/** Return the first slider (`<input type="range">`) near a label text. */
export async function getSliderByLabel(page: Page, label: string): Promise<Locator> {
  return page
    .locator(`text=${label}`)
    .locator('xpath=ancestor::div[1]//input[@type="range"]')
    .first();
}

/** Return the first toggle checkbox near a label text. */
export async function getToggleByLabel(page: Page, label: string): Promise<Locator> {
  return page
    .locator(`text=${label}`)
    .locator('xpath=ancestor::label[1]//input[@type="checkbox"]')
    .first();
}

// ─── Wait utilities ───────────────────────────────────────────────────────────

/** Wait until the "Generating Model" spinner disappears (model finished). */
export async function waitForModelReady(page: Page, timeout = 30_000): Promise<void> {
  // The indicator uses a spinner; wait for it to detach / become hidden
  const spinner = page.locator('[class*="animate-spin"]').first();
  try {
    // First wait for it to appear (model started), then wait for it to vanish
    await spinner.waitFor({ state: 'attached', timeout: 5_000 });
    await spinner.waitFor({ state: 'detached', timeout });
  } catch {
    // Spinner may never appear if the model was already cached – that's fine
  }
}

// ─── 2D Preview helpers ───────────────────────────────────────────────────────

/** Assert that the 2D SVG preview has rendered at least one path element. */
export async function expect2DPreviewHasPaths(page: Page): Promise<void> {
  const svgPaths = page.locator('svg path');
  await expect(svgPaths.first()).toBeVisible({ timeout: 20_000 });
}

// ─── Hub helpers ─────────────────────────────────────────────────────────────

/** Click "Add Hub" and return the count of hub panels now visible. */
export async function addHub(page: Page): Promise<void> {
  const addBtn = page.getByRole('button', { name: /add hub/i });
  await addBtn.click();
  await page.waitForTimeout(300);
}

// ─── Abstract helpers ─────────────────────────────────────────────────────────

/** Click "Add Shape" in the Abstract tab. */
export async function addAbstractShape(page: Page): Promise<void> {
  const addBtn = page.getByRole('button', { name: /add shape/i });
  await addBtn.click();
  await page.waitForTimeout(300);
}

/** Click "Add Fractal" in the Abstract tab. */
export async function addFractal(page: Page): Promise<void> {
  const addBtn = page.getByRole('button', { name: /add fractal/i });
  await addBtn.click();
  await page.waitForTimeout(300);
}

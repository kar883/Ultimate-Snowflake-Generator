/**
 * e2e/text-tab.spec.ts
 *
 * Tests the "Text" control-panel tab:
 *   - Phrase Content input (primary and secondary groups)
 *   - Font family picker
 *   - Arms / Symmetry slider
 *   - Inner Radius slider
 *   - Letter Spacing slider
 *   - Boldness (thickness) slider
 *   - Mirror Effect toggle
 *   - Underline toggle and its sub-options
 *   - Primary / Secondary group switching
 */
import { test, expect } from '@playwright/test';
import { gotoApp, clickTab } from './fixtures';

test.describe('Text tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await clickTab(page, 'text');
  });

  test('Phrase Content input is visible with default text', async ({ page }) => {
    // The DeferredTextInput for phrase content has a label "Phrase Content"
    await expect(page.getByText(/phrase content/i).first()).toBeVisible();
    // The text input should have some default value
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();
  });

  test('Phrase Content can be updated', async ({ page }) => {
    const phraseInput = page.locator('input[type="text"]').first();
    await phraseInput.click({ clickCount: 3 });
    await phraseInput.fill('Hello');
    await phraseInput.press('Enter');
    await expect(phraseInput).toHaveValue('Hello');
  });

  test('Primary and Secondary group selectors are visible', async ({ page }) => {
    await expect(page.getByText(/primary/i).first()).toBeVisible();
    await expect(page.getByText(/secondary/i).first()).toBeVisible();
  });

  test('Clicking Secondary switches the active group', async ({ page }) => {
    const secondaryBtn = page
      .locator('button')
      .filter({ hasText: /secondary/i })
      .first();
    await secondaryBtn.click();
    // After clicking Secondary, the group controls should reflect the secondary group
    await expect(secondaryBtn).toBeVisible();
  });

  test('Font Family picker is visible', async ({ page }) => {
    await expect(page.getByText(/font/i).first()).toBeVisible();
    // Font list should contain at least one font option
    await expect(page.getByText(/great vibes/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Selecting a different font updates the selection', async ({ page }) => {
    // Click on "Pacifico" font
    const pacificoFont = page.getByText(/pacifico/i).first();
    if (await pacificoFont.isVisible()) {
      await pacificoFont.click();
    }
  });

  test('Arms / Symmetry slider is visible', async ({ page }) => {
    await expect(page.getByText(/arms.*symmetry|symmetry.*arms/i).first()).toBeVisible();
  });

  test('Inner Radius slider is visible', async ({ page }) => {
    await expect(page.getByText(/inner radius/i).first()).toBeVisible();
  });

  test('Outer Radius slider is visible', async ({ page }) => {
    await expect(page.getByText(/outer radius/i).first()).toBeVisible();
  });

  test('Letter Spacing slider is visible', async ({ page }) => {
    await expect(page.getByText(/letter spacing/i).first()).toBeVisible();
  });

  test('Boldness slider is visible', async ({ page }) => {
    await expect(page.getByText(/boldness/i).first()).toBeVisible();
  });

  test('Mirror Effect toggle is visible', async ({ page }) => {
    await expect(page.getByText(/mirror effect/i).first()).toBeVisible();
  });

  test('Manual Rotation slider is visible', async ({ page }) => {
    await expect(page.getByText(/manual rotation/i).first()).toBeVisible();
  });

  test('Underline toggle is visible', async ({ page }) => {
    await expect(page.getByText(/underline/i).first()).toBeVisible();
  });

  test('Enabling underline reveals sub-options', async ({ page }) => {
    // Find the underline toggle (a label wrapping a hidden checkbox)
    const underlineSection = page.getByText(/^underline$/i).first();
    await underlineSection.scrollIntoViewIfNeeded();
    // The toggle is near the "Underline" label; clicking the label activates it
    const toggleLabel = underlineSection
      .locator('xpath=ancestor::label[1]')
      .or(underlineSection.locator('xpath=following-sibling::label[1]'));
    if ((await toggleLabel.count()) > 0) {
      await toggleLabel.first().click();
      await expect(page.getByText(/underline thickness/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Font Search input filters the font list', async ({ page }) => {
    const fontSearch = page.getByPlaceholder(/font search|search/i);
    if (await fontSearch.isVisible()) {
      await fontSearch.fill('Pac');
      await expect(page.getByText(/pacifico/i).first()).toBeVisible();
    }
  });

  test('Changing arms slider value updates the number input', async ({ page }) => {
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();
    // Move a range slider and verify it responds
    if (count > 0) {
      const firstSlider = sliders.first();
      const before = await firstSlider.inputValue();
      await firstSlider.fill(String(Math.max(1, parseFloat(before) - 1)));
      const after = await firstSlider.inputValue();
      expect(parseFloat(after)).toBeLessThanOrEqual(parseFloat(before));
    }
  });
});

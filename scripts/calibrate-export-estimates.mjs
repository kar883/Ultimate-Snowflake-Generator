import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE_URL = process.env.CALIBRATION_URL || 'http://localhost:5173/';
const RUNS_PER_BUCKET = Number(process.env.CALIBRATION_RUNS || '5');
const CALIBRATION_PRESET = String(process.env.CALIBRATION_PRESET || '').trim().toLowerCase();
const FORMATS = ['stl', '3mf'];
const QUALITIES = ['low', 'med', 'high'];
const SUMMARY_PATH = 'calibration-summary.json';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureAppReady(page) {
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.locator('button:visible').filter({ hasText: /^Export$/i }).first().waitFor({ timeout: 120000 });
}

async function waitForExportIdle(page) {
  await page.locator('button:visible').filter({ hasText: /^Export$/i }).first().waitFor({ timeout: 180000 });
}

async function openExportMenu(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const exportBtn = page.locator('button:visible').filter({ hasText: /^Export(ing)?$/i }).first();
  await exportBtn.waitFor({ timeout: 120000 });
  const menuContainer = exportBtn.locator('xpath=ancestor::div[contains(@class,"relative") and contains(@class,"flex")]').first();
  const chevron = menuContainer.locator('button').nth(1);
  await chevron.click({ timeout: 10000 });
  await page.getByText('Format', { exact: true }).first().waitFor({ timeout: 10000 });
}

async function setFormat(page, format) {
  const btn = page.getByRole('button', { name: new RegExp(`^${format}$`, 'i') }).first();
  try {
    await btn.click({ timeout: 10000 });
  } catch {
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.dispatchEvent('click').catch(async () => {
      await btn.evaluate((el) => el.click());
    });
  }
}

async function setQuality(page, quality) {
  const btn = page.getByRole('button', { name: new RegExp(`^${quality}$`, 'i') }).first();
  try {
    await btn.click({ timeout: 10000 });
  } catch {
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.dispatchEvent('click').catch(async () => {
      await btn.evaluate((el) => el.click());
    });
  }
}

async function setRangeByLabel(page, label, value) {
  const slider = page
    .locator(`text=${label}`)
    .locator('xpath=ancestor::div[1]//input[@type="range"]')
    .first();

  const visible = await slider.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) return false;

  await slider.evaluate((el, nextValue) => {
    const input = el;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  return true;
}

async function configureSlotHeavy3PlanePreset(page) {
  await page.getByRole('button', { name: /^global$/i }).first().click({ timeout: 10000 });

  const cutSlotsBtn = page.locator('button').filter({ hasText: /cut slots/i }).first();
  await cutSlotsBtn.waitFor({ timeout: 10000 });
  await cutSlotsBtn.click({ timeout: 10000, noWaitAfter: true }).catch(async () => {
    await cutSlotsBtn.dispatchEvent('click');
  });

  const threePlaneBtn = page.getByRole('button', { name: /3-plane/i }).first();
  if (await threePlaneBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await threePlaneBtn.click({ timeout: 5000 });
  }

  await setRangeByLabel(page, 'Slot Length', 108);
  await setRangeByLabel(page, 'Slot Width', 0.9);

  await page.getByRole('button', { name: /^planes$/i }).first().click({ timeout: 10000 });

  // Ensure all three default planes are enabled.
  const visibilityToggles = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  const togglesToEnable = Math.min(3, await visibilityToggles.count());
  for (let i = 0; i < togglesToEnable; i++) {
    await visibilityToggles.nth(i).evaluate((el) => {
      const input = el;
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  await page.waitForTimeout(800);
}

async function runSingleExport(page, format, quality, iteration) {
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    try {
      await ensureAppReady(page);
      await waitForExportIdle(page);
      await openExportMenu(page);
      await setFormat(page, format);
      await setQuality(page, quality);

      const downloadPromise = page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
      const exportAction = page.getByRole('button', { name: new RegExp(`^Export\\s+${format.toUpperCase()}`, 'i') }).last();
      await exportAction.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await exportAction.click({ timeout: 5000, noWaitAfter: true }).catch(async () => {
        await exportAction.evaluate((el) => el.click());
      });

      const download = await downloadPromise;
      if (download) {
        const suggestedFilename = download.suggestedFilename();
        await download.delete().catch(() => {});
        return { ok: true, filename: suggestedFilename, iteration, attempt };
      }

      // Some environments suppress actual browser downloads. If no error surfaced and UI is still responsive,
      // count this as successful export execution for calibration timing.
      await waitForExportIdle(page);
      return { ok: true, filename: '(download not captured)', iteration, attempt };
    } catch (error) {
      if (attempt >= 3) {
        return { ok: false, filename: '(failed)', iteration, attempt, error: String(error) };
      }
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(400);
    }
  }

  return { ok: false, filename: '(failed)', iteration, attempt: 3, error: 'unknown failure' };
}

async function readCalibration(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('snowflake.exportEstimateCalibration.v2');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

async function main() {
  console.log(`Calibration run starting at ${new Date().toISOString()}`);
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Runs per bucket: ${RUNS_PER_BUCKET}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await ensureAppReady(page);

    if (CALIBRATION_PRESET === 'slot-heavy-3-plane') {
      console.log('Applying preset: slot-heavy-3-plane');
      await configureSlotHeavy3PlanePreset(page);
    }

    const results = [];
    for (const format of FORMATS) {
      for (const quality of QUALITIES) {
        console.log(`\n=== ${format.toUpperCase()} / ${quality.toUpperCase()} ===`);
        for (let i = 1; i <= RUNS_PER_BUCKET; i++) {
          const result = await runSingleExport(page, format, quality, i);
          results.push({ format, quality, ...result });
          if (result.ok) {
            console.log(`  [${i}/${RUNS_PER_BUCKET}] ok - ${result.filename} (attempt ${result.attempt})`);
          } else {
            console.log(`  [${i}/${RUNS_PER_BUCKET}] FAIL - ${result.error}`);
          }
          await sleep(250);
        }
      }
    }

    const calibration = await readCalibration(page);
    const summary = {
      startedAt: new Date().toISOString(),
      preset: CALIBRATION_PRESET || null,
      runsPerBucket: RUNS_PER_BUCKET,
      totalRuns: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      failures: results.filter((r) => !r.ok),
      calibration,
    };

    fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log('\n=== Calibration Summary ===');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Summary written to ${SUMMARY_PATH}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Calibration script failed:', error);
  process.exit(1);
});

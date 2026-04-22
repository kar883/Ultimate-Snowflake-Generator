import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE_URL = process.env.CALIBRATION_URL || 'http://localhost:5173/';
const RUNS_PER_BUCKET = Number(process.env.CALIBRATION_RUNS || '15');
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
  await page.getByRole('button', { name: new RegExp(`^${format}$`, 'i') }).first().click({ timeout: 10000 });
}

async function setQuality(page, quality) {
  await page.getByRole('button', { name: new RegExp(`^${quality}$`, 'i') }).first().click({ timeout: 10000 });
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
      await exportAction.click({ timeout: 120000, noWaitAfter: true });

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
    const raw = window.localStorage.getItem('snowflake.exportEstimateCalibration.v1');
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

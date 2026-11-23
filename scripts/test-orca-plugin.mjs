import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const plugin = 'dist-orca/snowflake_generator_orcaslicer.py';
const { html, configHtml, chunks } = JSON.parse(execFileSync(process.env.PYTHON || 'python', [
  'scripts/test-orca-plugin.py', plugin,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
assert.ok(Buffer.byteLength(html) < 2 * 1024 * 1024, 'WebView2 page must be smaller than 2 MB');

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--enable-webgl', '--use-gl=swiftshader'],
});
try {
  const configPage = await browser.newPage();
  await configPage.setContent(configHtml);
  await configPage.getByRole('heading', { name: 'Snowflake Generator configuration' }).waitFor();
  assert.match(await configPage.locator('body').innerText(), /no settings in this dialog/i);
  assert.match(await configPage.locator('body').innerText(), /import it into OrcaSlicer/i);
  await configPage.close();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('Browser:', message.text());
  });
  await page.evaluate((responses) => {
    let callback;
    window.orca = {
      onMessage(handler) { callback = handler; },
      postMessage(message) { setTimeout(() => callback(responses[message.index]), 0); },
    };
  }, chunks);
  await page.setContent(html);
  await page.locator('[data-tutorial="tab-global"]').waitFor({ timeout: 120000 });
  assert.equal(await page.locator('#orca-loading').count(), 0);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('[data-tutorial="save"]').click(),
  ]);
  assert.match(download.suggestedFilename(), /\.json$/);
  const projectParts = [];
  for await (const part of await download.createReadStream()) projectParts.push(part);
  const config = JSON.parse(Buffer.concat(projectParts).toString('utf8'));
  Object.assign(config, {
    projectName: 'Orca plugin test', slotEnabled: true, slotMode: '2-plane',
    slotBridgesEnabled: false, quality: 'low', bevelEnabled: false, extrusionDepth: 3,
  });
  config.layers.forEach((layer, index) => {
    layer.enabled = index < 2;
    layer.primary.enabled = false;
    layer.secondary.enabled = false;
    layer.secondaryEnabled = false;
    layer.textGroups?.forEach(group => { group.enabled = false; });
    layer.abstracts = [];
    layer.images = [];
    layer.hubs = [{
      id: `orca-hub-${index}`, enabled: true, shape: 'circle', sides: 6,
      outerRadius: 35, hollow: false, wallThickness: 5, starRatio: 0.5,
      rotationOffset: 0, oscillationEnabled: false, oscillationAmplitude: 0, oscillationFrequency: 6,
    }];
  });
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'orca-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
  });
  await page.locator('[data-tutorial="view-3d"]').click();
  await page.getByText('Generating…', { exact: true }).waitFor({ state: 'hidden', timeout: 120000 });
  const [stl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.keyboard.press('Control+e'),
  ]);
  assert.match(stl.suggestedFilename(), /\.stl$/);
  const stlParts = [];
  for await (const part of await stl.createReadStream()) stlParts.push(part);
  const stlBytes = Buffer.concat(stlParts);
  assert.ok(stlBytes.length > 84 && stlBytes.readUInt32LE(80) > 0, 'STL must contain triangles');
  assert.deepEqual(errors, []);
  console.log('Orca plugin bridge, app startup, project download and slotted STL export passed.');
} finally {
  await browser.close();
}

/**
 * Snowflake Generator – parametric stress suite
 *
 * Covers: console / WebGL / exception guardrails, per-tab slider sweeps (min, max,
 * 5 stratified random values), conditional slot controls, 2D + 3D render deltas,
 * 3-plane assembly rendering, JSON save/load round-trip and STL / 3MF / SVG / DXF exports.
 *
 * Environment knobs (all optional):
 *   STRESS_SEED          integer seed for the pseudo-random sampler (default: time based, always logged)
 *   STRESS_SAMPLES       random samples per control (default 5)
 *   STRESS_MAX_CONTROLS  cap on controls swept per tab, 0 = no cap (default 0)
 *   STRESS_SKIP_3D       "1" skips the 3D fallback pass of the slider sweep
 *   STRESS_PROGRESS      "1" logs each control as it is swept
 *   BASE_URL             override the app URL (default: baseURL from playwright.config.ts)
 *
 * Run from the repository root:
 *   npx.cmd playwright test e2e/snowflake-stress.spec.ts
 *   npx.cmd playwright test e2e/snowflake-stress.spec.ts --headed
 *   npx.cmd playwright test e2e/snowflake-stress.spec.ts --debug
 *   npx.cmd playwright test e2e/snowflake-stress.spec.ts --ui
 *   $env:STRESS_SEED=123; $env:STRESS_MAX_CONTROLS=3; npx.cmd playwright test e2e/snowflake-stress.spec.ts
 */
import { devices, test as base, expect, type Locator, type Page } from '@playwright/test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SnowflakeConfig } from '../src/types';

// ───────────────────────────────────────────────────────────────────────────────
// 1. Global console / WebGL / exception guardrails
// ───────────────────────────────────────────────────────────────────────────────

// Console errors matching this are treated as fatal.
const FATAL_CONSOLE = /webgl|context[ _]lost|out of memory|allocation failed|maximum call stack|uncaught|unhandled|(type|reference|range)error/i;
// Known non-fatal noise (CDN fonts offline, dev tooling, favicon...).
const IGNORED_CONSOLE = /favicon|failed to load resource|net::err|fonts\.(g|google)|devtools|\[vite\]|download the react|GL Driver Message|GPU stall|Performance/i;

class Guard {
  readonly fatals: string[] = [];
  readonly logs: string[] = [];
  constructor(private readonly page: Page) {}

  attach() {
    this.page.on('pageerror', (err) => this.fatals.push(`pageerror: ${err.message}`));
    this.page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || msg.type() === 'warning') {
        if (IGNORED_CONSOLE.test(text)) return;
        if (FATAL_CONSOLE.test(text)) this.fatals.push(`console.${msg.type()}: ${text}`);
        else this.logs.push(`console.${msg.type()}: ${text}`);
      }
    });
    this.page.on('crash', () => this.fatals.push('page crashed'));
  }

  // Throws if anything fatal has been observed, including browser-side rejections / context loss.
  async assertHealthy(where = '') {
    const browserSide = await this.page
      .evaluate(() => ((window as any).__qaFatal as string[]) ?? [])
      .catch((e) => [`page.evaluate failed (page dead?): ${e}`]);
    const all = [...this.fatals, ...browserSide];
    if (all.length) throw new Error(`Fatal runtime problem${where ? ` @ ${where}` : ''}:\n  - ${all.join('\n  - ')}`);
  }
}

const guards = new WeakMap<Page, Guard>();
const assertHealthy = (page: Page, where?: string) => guards.get(page)!.assertHealthy(where);

const test = base.extend({
  page: async ({ playwright, browserName }, use, testInfo) => {
    const options = testInfo.project.use;
    // Releasing Chromium after each test prevents WebGL resources leaking across stress cases.
    const browser = await playwright[browserName].launch({
      ...options.launchOptions,
      headless: options.headless,
      channel: options.channel,
    });
    try {
      const context = await browser.newContext({
        ...devices['Desktop Chrome'],
        acceptDownloads: true,
        baseURL: options.baseURL,
        viewport: options.viewport,
        ignoreHTTPSErrors: options.ignoreHTTPSErrors,
      });
      try {
        const page = await context.newPage();
        const guard = new Guard(page);
        guard.attach();
        guards.set(page, guard);
        await page.addInitScript(() => {
          const w = window as any;
          w.__qaFatal = [];
          // Skip the first-run tutorial so it never covers the controls.
          try { localStorage.setItem('snowflake_tutorial_disabled', '1'); } catch { /* ignore */ }
          window.addEventListener('unhandledrejection', (e) => w.__qaFatal.push(`unhandledrejection: ${String((e as PromiseRejectionEvent).reason)}`));
          window.addEventListener('error', (e) => w.__qaFatal.push(`window.error: ${(e as ErrorEvent).message}`));
          // webglcontextlost does not bubble, so listen in the capture phase.
          window.addEventListener('webglcontextlost', () => w.__qaFatal.push('WebGL context lost'), true);
        });
        await use(page);
        await guard.assertHealthy('end of test');
        if (guard.logs.length) test.info().annotations.push({ type: 'console-noise', description: guard.logs.slice(0, 10).join(' | ') });
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
});

if (process.env.BASE_URL) test.use({ baseURL: process.env.BASE_URL });

// ───────────────────────────────────────────────────────────────────────────────
// 2. Tab / control mapping matrix
// ───────────────────────────────────────────────────────────────────────────────

interface TabSpec { name: string; key: string }
// `key` is the id used by the app's `data-tutorial="tab-<key>"` attribute.
const TABS: TabSpec[] = [
  { name: 'Global Settings', key: 'global' },
  { name: 'Text', key: 'text' },
  { name: 'Letter Control', key: 'Letter Ctrl' },
  { name: 'Hubs', key: 'hubs' },
  { name: 'Abstracts', key: 'abstract' },
  { name: 'Planes', key: 'planes' },
  { name: 'Images', key: 'images' },
];
const tab = (key: string) => TABS.find((t) => t.key === key)!;

const PANEL = '[data-tutorial="panel"]';
const PREVIEW = '[data-tutorial="preview"]';

async function openApp(page: Page) {
  await page.goto('/');
  await page.locator('[data-tutorial="tab-global"]').waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator(`${PREVIEW} svg.cursor-move`).first().waitFor({ state: 'visible', timeout: 120_000 });
  await settle(page);
}

// Always click the tab before touching its controls.
async function gotoTab(page: Page, key: string) {
  const btn = page.locator(`[data-tutorial="tab-${key}"]`);
  await btn.click();
  await expect(btn).toHaveClass(/bg-sky-600/);
  await page.waitForTimeout(120);
}

// Hubs / abstracts / images only show controls once an item exists, so create one.
const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z"/></svg>';

async function prepareTab(page: Page, key: string, scenario: 'default' | 'fractal' = 'default') {
  await gotoTab(page, key);
  const panel = page.locator(PANEL);
  if (key === 'text') {
    const unlock = panel.locator('button[title="Unlock outer radius"]');
    if (await unlock.count()) await unlock.click();
  }
  if (key === 'hubs' && (await scanSliders(page)).length === 0) {
    await panel.getByRole('button', { name: '+ Hub', exact: true }).click();
  }
  if (key === 'abstract') {
    const want = scenario === 'fractal' ? /fractal/i : /shape/i;
    await panel.locator('button', { hasText: want }).first().click(); // adds + selects the new item
    if (scenario === 'fractal') {
      // Exercise seed/variation inputs visibly without pre-combining high-complexity settings.
      await panel.getByRole('button', { name: 'random', exact: true }).click();
      const setupValues: Array<{ label: RegExp; value: number }> = [
        { label: /^branches per node$/i, value: 2 },
        { label: /^recursion depth$/i, value: 2 },
        { label: /^angle variation$/i, value: 20 },
        { label: /^length variation$/i, value: 10 },
      ];
      for (const setting of setupValues) {
        const slider = (await scanSliders(page)).find((item) => setting.label.test(item.label));
        if (slider && slider.value !== setting.value) await setSlider(page, slider.index, setting.value);
      }
    }
  }
  if (key === 'images' && (await scanSliders(page)).length === 0) {
    await panel.locator('input[type="file"][accept=".svg"]').setInputFiles({
      name: 'qa-star.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SAMPLE_SVG),
    });
  }
  await settle(page);
}

// ───────────────────────────────────────────────────────────────────────────────
// 3. Settle / snapshot helpers (2D = SVG, 3D = WebGL canvas)
// ───────────────────────────────────────────────────────────────────────────────

const raf2 = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

// Waits for the render pipeline: two frames, the debounce window, and the "Stop" busy button to vanish.
async function settle(page: Page, opts: { quiet?: number; timeout?: number } = {}) {
  const { quiet = 350, timeout = 60_000 } = opts;
  await raf2(page);
  await page.waitForTimeout(quiet);
  await page.locator('button[title^="Stop ongoing processing"]').waitFor({ state: 'hidden', timeout })
    .catch(() => { throw new Error('Render pipeline did not settle (Stop button still visible)'); });
  await raf2(page);
  await assertHealthy(page, 'settle');
}

type ViewMode = '2d' | '3d';
const sha1 = (b: Buffer | string) => crypto.createHash('sha1').update(b).digest('hex');

async function setView(page: Page, mode: ViewMode) {
  await page.locator(`[data-tutorial="view-${mode}"]`).click({ timeout: 90_000 });
  if (mode === '3d') {
    await largestCanvas(page).waitFor({ state: 'visible', timeout: 90_000 });
    await settle(page, { quiet: 1_000, timeout: 90_000 });
    await ensureAutoRegen(page);
    await settle(page, { quiet: 1_000, timeout: 90_000 });
    await waitForStable(page, '3d');
  } else {
    await page.locator(`${PREVIEW} svg.cursor-move`).first().waitFor({ state: 'visible', timeout: 30_000 });
  }
  await settle(page);
}

// The component appends its main renderer before the 115px orientation-gizmo renderer.
const largestCanvas = (page: Page): Locator => page.locator(`${PREVIEW} canvas`).first();

// Auto Regen 3D must be ON for slider edits to reach the 3D viewport.
async function ensureAutoRegen(page: Page) {
  const toggle = page.locator('[data-tutorial="auto-regen"] button');
  await toggle.waitFor({ state: 'visible' });
  if ((await toggle.innerText()).trim().toUpperCase() !== 'ON') {
    await toggle.evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect(toggle).toHaveText(/^ON$/i);
}

// 2D: hash of the serialized SVG. 3D: hash of the canvas pixels (page.screenshot of the canvas element,
// because the WebGL drawing buffer is not preserved and canvas.toDataURL() would return a blank frame).
async function snapshot(page: Page, mode: ViewMode): Promise<string> {
  if (mode === '2d') {
    return page.locator(`${PREVIEW} svg.cursor-move`).first().evaluate((svg) => {
      const source = (svg as SVGElement).outerHTML;
      let first = 0x811c9dc5;
      let second = 0x9e3779b9;
      for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        first = Math.imul(first ^ code, 0x01000193);
        second = Math.imul(second ^ code, 0x85ebca6b);
      }
      return `${source.length}:${first >>> 0}:${second >>> 0}`;
    });
  }
  await raf2(page);
  return sha1(await largestCanvas(page).screenshot({ animations: 'disabled', timeout: 90_000 }));
}

// Polls until two consecutive snapshots agree (3D generation + idle animation finished).
async function waitForStable(page: Page, mode: ViewMode, timeout = 90_000): Promise<string> {
  const deadline = Date.now() + timeout;
  let prev = await snapshot(page, mode);
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const next = await snapshot(page, mode);
    if (next === prev) return next;
    prev = next;
  }
  throw new Error(`${mode} view never became stable (continuous re-render / animation?)`);
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. Slider discovery + deterministic pseudo-random sampling
// ───────────────────────────────────────────────────────────────────────────────

interface SliderInfo {
  index: number; // index among ALL range inputs inside the panel (stable nth())
  label: string;
  min: number; max: number; step: number; value: number;
  visible: boolean;
  inactive: boolean; // wrapper has pointer-events:none (the app's "disabled" look) or input.disabled
}

const sliderLocator = (page: Page) => page.locator(`${PANEL} input[type="range"]`);

async function scanSliders(page: Page): Promise<SliderInfo[]> {
  const all = await sliderLocator(page).evaluateAll((els) =>
    (els as HTMLInputElement[]).map((el, index) => {
      const wrap = el.parentElement as HTMLElement;
      const label = (wrap?.firstElementChild?.firstElementChild?.textContent ?? '').trim().replace(/\s+/g, ' ');
      const rect = el.getBoundingClientRect();
      return {
        index, label,
        min: parseFloat(el.min), max: parseFloat(el.max), step: parseFloat(el.step) || 1, value: parseFloat(el.value),
        visible: rect.width > 0 && rect.height > 0,
        inactive: el.disabled || getComputedStyle(wrap).pointerEvents === 'none',
      };
    }));
  return all.filter((s) => s.visible);
}

// Mulberry32 – tiny seedable PRNG so a failing run can be replayed with STRESS_SEED.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = process.env.STRESS_SEED ? Number(process.env.STRESS_SEED) : Date.now() % 1_000_000;
const SAMPLES = Number(process.env.STRESS_SAMPLES ?? 5);
const MAX_CONTROLS = Number(process.env.STRESS_MAX_CONTROLS ?? 0);
const rng = makeRng(SEED);

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;
const quantize = (v: number, s: Pick<SliderInfo, 'min' | 'max' | 'step'>) => {
  const snapped = s.min + Math.round((v - s.min) / s.step) * s.step;
  return Math.min(s.max, Math.max(s.min, Number(snapped.toFixed(decimalsOf(s.step)))));
};

// Absolute min, absolute max, then SAMPLES stratified random values strictly inside (min, max).
function sampleValues(s: Pick<SliderInfo, 'min' | 'max' | 'step'>, n = SAMPLES): number[] {
  const out: number[] = [s.min, s.max];
  for (let i = 0; i < n; i++) {
    const lo = s.min + ((s.max - s.min) * i) / n;
    const hi = s.min + ((s.max - s.min) * (i + 1)) / n;
    const v = quantize(lo + rng() * (hi - lo), s);
    if (v > s.min && v < s.max && !out.includes(v)) out.push(v);
  }
  return out;
}

// Commit through the paired number field so React receives the same user input path as the UI.
async function setSlider(page: Page, index: number, value: number) {
  const range = sliderLocator(page).nth(index);
  const numeric = range.locator('xpath=..').locator('input[type="number"]');
  await numeric.fill(String(value));
  await numeric.press('Enter');
  await settle(page);
}
const readSlider = (page: Page, index: number) => sliderLocator(page).nth(index).evaluate((e) => parseFloat((e as HTMLInputElement).value));
const normalizeSliderLabel = (label: string) => label.replace(/\s*\(D:\s*[\d.]+\s*mm\)/gi, '').trim();

// Controls whose effect is legitimately invisible in the viewport (export-only / metadata).
const NON_VISUAL = /export|quality|project name|detail|segments|resolution/i;

interface SweepResult { failures: string[]; noVisualEffect: SliderInfo[]; swept: number }

// Sweeps every active slider in the current tab. Each control is restored afterwards so the layout stays stable.
async function sweepSliders(page: Page, mode: ViewMode, onlyExtremes = false, subset?: SliderInfo[]): Promise<SweepResult> {
  const failures: string[] = [];
  const noVisualEffect: SliderInfo[] = [];
  let infos = subset ?? (await scanSliders(page)).filter((s) => !s.inactive);
  if (!subset && MAX_CONTROLS > 0) infos = infos.slice(0, MAX_CONTROLS);

  for (const info of infos) {
    const tag = `"${info.label}" [${info.min}..${info.max}]`;
    if (process.env.STRESS_PROGRESS === '1') console.log(`[stress] ${mode} ${tag}`);
    if (/^branches per node$/i.test(info.label)) {
      const depth = (await scanSliders(page)).find((slider) => /^recursion depth$/i.test(slider.label));
      if (depth && depth.value !== 2) await setSlider(page, depth.index, 2);
    } else if (/^(min branch length|length decay)$/i.test(info.label)) {
      const currentSliders = await scanSliders(page);
      const branches = currentSliders.find((slider) => /^branches per node$/i.test(slider.label));
      const depth = currentSliders.find((slider) => /^recursion depth$/i.test(slider.label));
      if (branches && branches.value !== 2) await setSlider(page, branches.index, 2);
      if (depth && depth.value !== 6) await setSlider(page, depth.index, 6);
    }
    const current = (await scanSliders(page)).find((s) => s.index === info.index);
    if (!current || current.label !== info.label) { failures.push(`${tag}: control moved/disappeared during sweep`); continue; }

    const original = current.value;
    const base = await waitForStable(page, mode);
    const values = onlyExtremes ? [info.min, info.max] : sampleValues(info);
    if (process.env.STRESS_PROGRESS === '1') console.log(`[stress] baseline=${base}; values=${values.join(', ')}`);
    let changed = false;
    try {
      for (const v of values) {
        await setSlider(page, info.index, v);
        const after = await readSlider(page, info.index);
        // Outer Radius is a derived measurement: its handler adjusts font size asynchronously,
        // and values below the current inner radius are intentionally ignored by the app.
        if (/^outer radius$/i.test(info.label)) {
          if (after < info.min || after > info.max) failures.push(`${tag}: derived radius ${after} is outside its bounds`);
        } else if (Math.abs(after - v) > info.step / 2 + 1e-9) {
          failures.push(`${tag}: set ${v} but control reads ${after}`);
        }
        const afterSnapshot = await snapshot(page, mode);
        if (afterSnapshot !== base) changed = true;
        if (process.env.STRESS_PROGRESS === '1') console.log(`[stress] value=${v}; changed=${afterSnapshot !== base}`);
      }
    } catch (e) {
      failures.push(`${tag}: ${(e as Error).message}`);
    } finally {
      await setSlider(page, info.index, original).catch(() => undefined);
    }
    if (!changed) noVisualEffect.push(info);
  }
  return { failures, noVisualEffect, swept: infos.length };
}

// ───────────────────────────────────────────────────────────────────────────────
// 5. Slots + planes helpers
// ───────────────────────────────────────────────────────────────────────────────

const slotButton = (page: Page) => page.locator('[data-tutorial="slots"] button').first();
const slotsOn = async (page: Page) => /\bON\b/.test((await slotButton(page).innerText()).toUpperCase());

async function setSlots(page: Page, on: boolean) {
  if ((await slotsOn(page)) !== on) await slotButton(page).click();
  await settle(page);
  expect(await slotsOn(page)).toBe(on);
}

async function setSlotMode3Plane(page: Page) {
  await page.locator('[data-tutorial="slots"] button').nth(1).click(); // dropdown arrow
  await page.locator('[data-tutorial="slots-menu"] button', { hasText: /^3-plane$/i }).click();
  await settle(page);
}

const viewportPlaneRows = (page: Page) => page.locator('[data-tutorial="planes-panel"] > div:nth-child(2) > div');

async function setViewportPlaneVisible(page: Page, idx: number, on: boolean) {
  const button = viewportPlaneRows(page).nth(idx).locator('button').first();
  const target = on ? 'ON' : 'OFF';
  if ((await button.innerText()).trim().toUpperCase() !== target) await button.click();
  await expect(button).toHaveText(new RegExp(`^${target}$`, 'i'));
  await settle(page);
}

// Uses the viewport's ON/OFF controls, not the layer-enabled switches in the Planes tab.
async function showOnlyPlanes(page: Page, on: number[]) {
  await gotoTab(page, 'planes');
  await expect(viewportPlaneRows(page)).toHaveCount(3);
  for (const i of on) await setViewportPlaneVisible(page, i, true);
  for (const i of [0, 1, 2].filter((i) => !on.includes(i))) await setViewportPlaneVisible(page, i, false);
}

// ───────────────────────────────────────────────────────────────────────────────
// 6. Download helpers
// ───────────────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join('test-results', 'stress-downloads');

async function captureDownload(page: Page, trigger: () => Promise<void>, ext: string, timeout = 180_000) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), trigger()]);
  const name = download.suggestedFilename();
  expect(name.toLowerCase().endsWith(ext), `file name "${name}" should end with ${ext}`).toBe(true);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, `${Date.now()}-${name}`);
  await download.saveAs(dest);
  expect(fs.existsSync(dest), `downloaded file exists: ${dest}`).toBe(true);
  const size = fs.statSync(dest).size;
  expect(size, `${name} must be non-empty`).toBeGreaterThan(0);
  await assertHealthy(page, `download ${ext}`);
  return { name, dest, size, buffer: fs.readFileSync(dest) };
}

async function openExportMenu(page: Page) {
  if (!(await page.locator('[data-tutorial="export-menu"]').count())) {
    await page.locator('[data-tutorial-toggle="export"]').click();
  }
  await page.locator('[data-tutorial="export-menu"]').waitFor({ state: 'visible' });
}

async function exportAs(page: Page, fmt: 'stl' | '3mf' | 'svg' | 'dxf') {
  await openExportMenu(page);
  const menu = page.locator('[data-tutorial="export-menu"]');
  await menu.getByRole('button', { name: fmt.toUpperCase(), exact: true }).click();
  return captureDownload(page, () => menu.getByRole('button', { name: new RegExp(`^Export\\s+${fmt}`, 'i') }).click(), `.${fmt}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// Each test boots a fresh page, so tests are independent (one failure does not hide the rest).
test.describe.configure({ mode: 'default' });

test.beforeAll(() => {
  test.info().annotations.push({ type: 'seed', description: `STRESS_SEED=${SEED}` });
  console.log(`[stress] pseudo-random seed: ${SEED} (replay with STRESS_SEED=${SEED})`);
});

test.describe('Foundations', () => {
  test('app boots with every tab reachable and no runtime errors', async ({ page }) => {
    await openApp(page);
    for (const t of TABS) {
      await gotoTab(page, t.key);
      await assertHealthy(page, `tab ${t.name}`);
    }
  });

  test('2D snapshot is stable at rest and changes when geometry changes', async ({ page }) => {
    await openApp(page);
    const a = await waitForStable(page, '2d');
    expect(await snapshot(page, '2d')).toBe(a);

    await prepareTab(page, 'global');
    // The delta detector itself must work: some global slider has to alter the SVG.
    let changed = false;
    for (const s of (await scanSliders(page)).filter((x) => !x.inactive)) {
      await setSlider(page, s.index, s.max);
      if ((await snapshot(page, '2d')) !== a) { changed = true; break; }
      await setSlider(page, s.index, s.value);
    }
    expect(changed).toBe(true);
  });

  test('3D canvas renders, is stable at rest and survives a view round-trip', async ({ page }) => {
    test.setTimeout(240_000);
    await openApp(page);
    await setView(page, '3d');
    const canvas = largestCanvas(page);
    const box = await canvas.boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBeTruthy();
    const a = await waitForStable(page, '3d');
    await setView(page, '2d');
    await setView(page, '3d');
    await waitForStable(page, '3d');
    await assertHealthy(page, '3D round-trip');
    expect(a).toBeTruthy();
  });
});

// ── 4 + 5. Per-tab sweep: min / max / 5 random values, with canvas-delta verification ─────────
test.describe('Slider sweep (min, max, 5 random) with render-delta verification', () => {
  const sweepTabs: Array<{ t: TabSpec; scenario: 'default' | 'fractal' }> = [
    { t: tab('global'), scenario: 'default' },
    { t: tab('text'), scenario: 'default' },
    { t: tab('Letter Ctrl'), scenario: 'default' },
    { t: tab('hubs'), scenario: 'default' },
    { t: tab('abstract'), scenario: 'default' },
    { t: tab('abstract'), scenario: 'fractal' },
    { t: tab('planes'), scenario: 'default' },
    { t: tab('images'), scenario: 'default' },
  ];

  for (const { t, scenario } of sweepTabs) {
    test(`${t.name}${scenario === 'fractal' ? ' (fractal)' : ''}`, async ({ page }) => {
      test.setTimeout(20 * 60_000);
      await openApp(page);
      await prepareTab(page, t.key, scenario);

      const result = await sweepSliders(page, '2d');
      test.info().annotations.push({ type: 'controls', description: `${result.swept} sliders swept` });
      expect(result.swept, `${t.name}: no active sliders were found`).toBeGreaterThan(0);

      // Controls with no 2D effect (extrusion depth, bevel, fillet...) must change the 3D viewport instead.
      let unexplained = result.noVisualEffect.filter((s) => !NON_VISUAL.test(s.label));
      if (unexplained.length && process.env.STRESS_SKIP_3D !== '1') {
        if (process.env.STRESS_PROGRESS === '1') {
          console.log(`[stress] 3d fallback needed for: ${unexplained.map((slider) => slider.label).join(', ')}`);
        }
        await setView(page, '3d');
        await gotoTab(page, t.key);
        const again = await sweepSliders(page, '3d', true, unexplained);
        result.failures.push(...again.failures);
        unexplained = again.noVisualEffect;
        await setView(page, '2d');
      }
      const skip3D = process.env.STRESS_SKIP_3D === '1';
      if (skip3D && unexplained.length) {
        test.info().annotations.push({ type: '3d-only-controls', description: unexplained.map((s) => s.label).join(', ') });
        unexplained = [];
      }
      expect(
        unexplained.map((s) => `"${s.label}" [${s.min}..${s.max}] never changed the 2D or 3D viewport`),
        `${t.name}: controls that did not drive a visual update`,
      ).toEqual([]);
      expect(result.failures, `${t.name}: sweep failures (seed ${SEED})`).toEqual([]);
    });
  }

  test('number inputs clamp typed values to the slider bounds', async ({ page }) => {
    test.setTimeout(180_000);
    await openApp(page);
    await prepareTab(page, 'global');
    const s = (await scanSliders(page)).filter((x) => !x.inactive)[0];
    const number = sliderLocator(page).nth(s.index).locator('xpath=..').locator('input[type="number"]');
    await number.fill(String(s.max * 10 + 1000));
    await number.press('Enter');
    await settle(page);
    expect(await readSlider(page, s.index)).toBeCloseTo(s.max, 5);
    await number.fill(String(s.min - 1000));
    await number.press('Enter');
    await settle(page);
    expect(await readSlider(page, s.index)).toBeCloseTo(s.min, 5);
  });

  test('toggles on every tab flip and restore without errors', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await openApp(page);
    for (const t of TABS) {
      await prepareTab(page, t.key);
      const boxes = page.locator(`${PANEL} input[type="checkbox"]`);
      const n = Math.min(await boxes.count(), MAX_CONTROLS || 40);
      for (let i = 0; i < n; i++) {
        const box = boxes.nth(i);
        if (!(await box.count())) break;
        await box.evaluate((e: HTMLInputElement) => e.click());
        await settle(page);
        await box.evaluate((e: HTMLInputElement) => e.click()).catch(() => undefined);
        await settle(page);
      }
    }
  });
});

// ── 3. Conditional variables: slot mechanics ───────────────────────────────────────────────────
test.describe('Slot mechanics', () => {
  const PER_PLANE = /^(slot length adj|slot width offset)/i;
  const GLOBAL_SLOT = /^(slot length|slot width)$/i;

  test('slot-dependent controls are absent when OFF and live when ON', async ({ page }) => {
    test.setTimeout(180_000);
    await openApp(page);
    await gotoTab(page, 'planes');

    await setSlots(page, false);
    const off = await scanSliders(page);
    expect(off.filter((s) => PER_PLANE.test(s.label) || GLOBAL_SLOT.test(s.label)), 'no slot sliders while OFF').toEqual([]);
    expect(await page.locator(`${PANEL} >> text=/automatic slot length/i`).count()).toBe(0);

    await setSlots(page, true);
    await gotoTab(page, 'planes');
    const on = await scanSliders(page);
    expect(on.filter((s) => PER_PLANE.test(s.label)).length, 'per-plane slot sliders mount').toBeGreaterThanOrEqual(1);
    expect(on.filter((s) => GLOBAL_SLOT.test(s.label)).length, 'global slot sliders mount').toBe(2);

    // Slot length is auto-driven (inactive) until Automatic Slot Length is unticked.
    const auto = page.locator(`${PANEL} label:has-text("Automatic slot length") input[type="checkbox"]`);
    await auto.evaluate((e: HTMLInputElement) => { if (e.checked) e.click(); });
    await settle(page);
    const manual = (await scanSliders(page)).filter((s) => GLOBAL_SLOT.test(s.label));
    for (const s of manual) expect(s.inactive, `${s.label} interactive once automatic length is off`).toBe(false);

    // Every slot control must accept its extremes with no runtime error.
    const result = await sweepSliders(page, '2d', true, (await scanSliders(page)).filter((s) => (PER_PLANE.test(s.label) || GLOBAL_SLOT.test(s.label)) && !s.inactive));
    expect(result.failures).toEqual([]);
  });

  test('slotted star exports preserve fillets, chamfers, thickness and cuts', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await openApp(page);
    const saved = await captureDownload(page, () => page.locator('[data-tutorial="save"]').click(), '.json');
    const config: SnowflakeConfig = JSON.parse(saved.buffer.toString('utf8'));
    Object.assign(config, {
      extrusionDepth: 3, bevelAmount: 0.6, bevelSegments: 5, slotMode: '3-plane',
      slotBridgesEnabled: false, manifoldExact: true, globalStrokeWeight: 0, quality: 'low',
    });
    config.layers.forEach((layer, index) => {
      layer.enabled = true;
      layer.primary.enabled = false;
      layer.secondary.enabled = false;
      layer.secondaryEnabled = false;
      layer.textGroups?.forEach((group) => { group.enabled = false; });
      layer.abstracts = [];
      layer.images = [];
      layer.hubs = [{
        id: `regression-star-${index}`, enabled: true, shape: 'star', sides: 6,
        outerRadius: 50, hollow: true, wallThickness: 5, starRatio: 0.5,
        rotationOffset: 0, oscillationEnabled: false, oscillationAmplitude: 0, oscillationFrequency: 6,
      }];
    });

    const exportBase = async (label: string, slots: boolean, style: 'fillet' | 'chamfer' | 'flat', amount = 0.6) => {
      config.projectName = label;
      config.slotEnabled = slots;
      config.bevelEnabled = style !== 'flat';
      config.bevelType = style === 'chamfer' ? 'chamfer' : 'fillet';
      config.bevelAmount = amount;
      await page.locator('input[type="file"][accept=".json"]').setInputFiles({
        name: `${label}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)),
      });
      await expect(page.getByRole('textbox', { name: 'PROJECT NAME' })).toHaveValue(label);
      await openExportMenu(page);
      const menu = page.locator('[data-tutorial="export-menu"]');
      const basePlane = menu.getByRole('button', { name: /Base Plane/i });
      if (!/Selected$/i.test(await basePlane.innerText())) await basePlane.click();
      const file = await captureDownload(page, () => menu.getByRole('button', { name: /^Export Selected/i }).click(), '.stl');
      const data = file.buffer;
      const triangles = data.readUInt32LE(80);
      expect(data.length).toBe(84 + triangles * 50);
      let minZ = Infinity;
      let maxZ = -Infinity;
      let slopedOuterFaces = 0;
      let signedVolume = 0;
      const zLevels = new Set<string>();
      for (let offset = 84; offset < data.length; offset += 50) {
        const normalZ = Math.abs(data.readFloatLE(offset + 8));
        const vertices = Array.from({ length: 3 }, (_, vertex) =>
          Array.from({ length: 3 }, (_, axis) => data.readFloatLE(offset + 12 + vertex * 12 + axis * 4)));
        for (const [, , z] of vertices) {
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
          zLevels.add(z.toFixed(3));
        }
        const [a, b, c] = vertices;
        const radius = Math.hypot((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
        if (radius > 30 && normalZ > 0.05 && normalZ < 0.95) slopedOuterFaces++;
        signedVolume += (a[0] * (b[1] * c[2] - b[2] * c[1])
          + a[1] * (b[2] * c[0] - b[0] * c[2])
          + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      return { minZ, maxZ, slopedOuterFaces, zLevels: zLevels.size, volume: Math.abs(signedVolume) };
    };

    const fillet = await exportBase('star-fillet-slots', true, 'fillet');
    await setView(page, '3d');
    const filletPreview = await waitForStable(page, '3d');
    const chamfer = await exportBase('star-chamfer-slots', true, 'chamfer');
    const flat = await exportBase('star-flat-slots', true, 'flat');
    await expect.poll(() => snapshot(page, '3d'), { timeout: 90_000 }).not.toBe(filletPreview);
    const largeFillet = await exportBase('star-large-fillet-slots', true, 'fillet', 3);
    const uncutFlat = await exportBase('star-flat-no-slots', false, 'flat');
    for (const mesh of [fillet, chamfer, flat, largeFillet, uncutFlat]) {
      expect(mesh.maxZ - mesh.minZ).toBeCloseTo(3, 3);
    }
    expect(fillet.slopedOuterFaces).toBeGreaterThan(flat.slopedOuterFaces + 20);
    expect(chamfer.slopedOuterFaces).toBeGreaterThan(flat.slopedOuterFaces + 10);
    expect(fillet.zLevels).toBeGreaterThan(chamfer.zLevels);
    expect(fillet.volume).toBeLessThan(flat.volume);
    expect(largeFillet.volume).toBeLessThan(fillet.volume);
    expect(flat.volume).toBeLessThan(uncutFlat.volume);
    await assertHealthy(page, 'slotted star edge profiles');
  });

  test('toggling slots changes the 3D viewport', async ({ page }) => {
    test.setTimeout(300_000);
    await openApp(page);
    await setSlotMode3Plane(page);
    await setView(page, '3d');
    await setSlots(page, false);
    const off = await waitForStable(page, '3d');
    await setSlots(page, true);
    const on = await waitForStable(page, '3d');
    expect(on, 'cutting slots must alter the rendered model').not.toBe(off);
  });
});

// ── 6. 3-plane interlocking assembly ───────────────────────────────────────────────────────────
test.describe('3-plane assembly viewport', () => {
  test('each plane alone, then all three, render in 3D without WebGL errors', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await openApp(page);
    await setSlotMode3Plane(page);
    await setSlots(page, true);
    await setView(page, '3d');

    const shots: string[] = [];
    for (const solo of [[0], [1], [2]]) {
      await showOnlyPlanes(page, solo);
      await settle(page);
      const s = await waitForStable(page, '3d');
      expect(await largestCanvas(page).isVisible()).toBe(true);
      shots.push(s);
    }
    await showOnlyPlanes(page, [0, 1, 2]);
    const all = await waitForStable(page, '3d');
    // The full assembly must look different from every single-plane view.
    for (const [i, s] of shots.entries()) expect(all, `assembly differs from Plane ${i + 1} only`).not.toBe(s);
    // And the single planes must differ from one another (they are rotated differently).
    expect(new Set(shots).size, 'each solo plane renders distinctly').toBeGreaterThan(1);
    await assertHealthy(page, 'assembly');
  });
});

// ── 7. JSON save / load round-trip ─────────────────────────────────────────────────────────────
test.describe('JSON save / load', () => {
  test('state survives save → noise → load, UI and viewport included', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await openApp(page);

    // a) Apply a known set of values across several tabs.
    const tabsToCheck = ['global', 'text', 'hubs', 'abstract', 'planes'];
    const applied: Record<string, Array<{ label: string; index: number; value: number }>> = {};
    for (const key of tabsToCheck) {
      await prepareTab(page, key);
      const picks = (await scanSliders(page)).filter((s) => !s.inactive).slice(0, 3);
      applied[key] = [];
      for (const s of picks) {
        const v = quantize(s.min + (s.max - s.min) * (0.3 + 0.4 * rng()), s);
        await setSlider(page, s.index, v);
        applied[key].push({ label: s.label, index: s.index, value: await readSlider(page, s.index) });
      }
    }
    const before2D = await waitForStable(page, '2d');

    // b) Save and parse the JSON payload.
    const saved = await captureDownload(page, () => page.locator('[data-tutorial="save"]').click(), '.json');
    const json = JSON.parse(saved.buffer.toString('utf8'));
    expect(Array.isArray(json.layers) && json.layers.length).toBeGreaterThan(0);
    const numbers: number[] = [];
    (function walk(v: unknown) {
      if (typeof v === 'number') numbers.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v as object).forEach(walk);
    })(json);
    for (const list of Object.values(applied)) {
      for (const a of list) {
        // Outer Radius is a computed display value; the JSON stores its text/font inputs instead.
        if (/outer radius/i.test(a.label)) continue;
        expect(numbers.some((n) => Math.abs(n - a.value) < 1e-6), `JSON contains ${a.label}=${a.value}`).toBe(true);
      }
    }

    // c) Scramble the UI with random noise.
    for (const key of tabsToCheck) {
      await gotoTab(page, key);
      for (const s of (await scanSliders(page)).filter((x) => !x.inactive).slice(0, 4)) {
        await setSlider(page, s.index, quantize(s.min + (s.max - s.min) * rng(), s));
      }
    }
    expect(await snapshot(page, '2d'), 'noise visibly changed the design').not.toBe(before2D);

    // d) Load the saved JSON through the app's hidden file input.
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: 'qa-config.json', mimeType: 'application/json', buffer: saved.buffer,
    });
    await settle(page);

    // e) Every control restored, and the viewport matches the original.
    const drift: string[] = [];
    for (const key of tabsToCheck) {
      await gotoTab(page, key);
      const now = await scanSliders(page);
      for (const a of applied[key]) {
        if (/outer radius/i.test(a.label)) continue;
        const cur = now.find((s) => s.index === a.index && normalizeSliderLabel(s.label) === normalizeSliderLabel(a.label));
        if (!cur) drift.push(`${tab(key).name}: "${a.label}" missing after load`);
        else if (Math.abs(cur.value - a.value) > cur.step / 2 + 1e-9) drift.push(`${tab(key).name}: "${a.label}" expected ${a.value}, got ${cur.value}`);
      }
    }
    expect(drift, 'controls restored by Load').toEqual([]);
    expect(await waitForStable(page, '2d'), '2D render matches original').toBe(before2D);
    await assertHealthy(page, 'json round trip');
  });
});

// ── 8. Export formats ──────────────────────────────────────────────────────────────────────────
test.describe('File exports', () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await setSlotMode3Plane(page);
    await setSlots(page, true);
  });

  test('SVG export downloads a vector file', async ({ page }) => {
    const f = await exportAs(page, 'svg');
    expect(f.buffer.toString('utf8')).toContain('<svg');
  });

  test('DXF export downloads a CAD file', async ({ page }) => {
    const f = await exportAs(page, 'dxf');
    expect(f.buffer.toString('utf8')).toContain('EOF');
  });

  test('STL export downloads a mesh', async ({ page }) => {
    test.setTimeout(300_000);
    const f = await exportAs(page, 'stl');
    const head = f.buffer.subarray(0, 5).toString('ascii');
    // ASCII STL starts with "solid"; binary STL has an 80-byte header + 4-byte count.
    expect(head === 'solid' || f.size > 84).toBe(true);
  });

  test('3MF export downloads a zip package', async ({ page }) => {
    test.setTimeout(300_000);
    const f = await exportAs(page, '3mf');
    expect(f.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});

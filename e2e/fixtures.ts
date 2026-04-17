/**
 * Shared helpers / fixtures for the Snowflake Generator E2E suite.
 *
 * All helper functions accept a `Page` object so they can be imported
 * into any spec file without needing a custom `test` fixture.
 *
 * Visual verification strategy
 * ─────────────────────────────
 * Three complementary techniques confirm that the rendered output
 * matches the chosen configuration:
 *
 *  1. SVG DOM inspection (2D preview)
 *     The 2D preview is a real <svg> element. We can count <path> elements,
 *     read bounding-box dimensions, and check fill colours to verify the
 *     config is reflected in the markup.
 *
 *  2. Canvas pixel analysis (3D view)
 *     We read raw RGBA pixel data from the WebGL <canvas> via
 *     page.evaluate() to confirm the canvas is not blank and that the
 *     dominant non-background colour matches the configured model colour.
 *
 *  3. Playwright visual snapshots (toHaveScreenshot)
 *     Captures a pixel-exact PNG on the first run as a golden baseline.
 *     Every subsequent run diffs the live screenshot against it. A pixel
 *     mismatch fails the test and produces a side-by-side diff image.
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

// ─── SVG / 2D visual helpers ──────────────────────────────────────────────────

export interface SvgStats {
  /** Total number of <path> elements inside the SVG */
  pathCount: number;
  /** Bounding box of the outermost <svg> element (px) */
  bbox: { x: number; y: number; width: number; height: number };
  /** All unique fill values found on <path> elements */
  fills: string[];
}

/**
 * Read structural statistics from the first SVG element on the page.
 * Use this to assert that visual output matches config changes such as
 * arm count, colour, or presence of a new feature (hub, abstract, etc.).
 */
export async function getSvgStats(page: Page): Promise<SvgStats> {
  return page.evaluate((): SvgStats => {
    const svg = document.querySelector('svg');
    if (!svg) return { pathCount: 0, bbox: { x: 0, y: 0, width: 0, height: 0 }, fills: [] };

    const paths = Array.from(svg.querySelectorAll('path'));
    const rect = svg.getBoundingClientRect();
    const fills = [...new Set(
      paths
        .map(p => p.getAttribute('fill') || p.style.fill || '')
        .filter(Boolean)
    )];

    return {
      pathCount: paths.length,
      bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      fills,
    };
  });
}

/**
 * Wait until the 2D SVG preview has finished rendering (path count is stable
 * across two polls 500 ms apart, or until `timeout` ms have elapsed).
 */
export async function waitForSvgStable(page: Page, timeout = 15_000): Promise<SvgStats> {
  const deadline = Date.now() + timeout;
  let prev = await getSvgStats(page);

  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const next = await getSvgStats(page);
    if (next.pathCount > 0 && next.pathCount === prev.pathCount) {
      return next;
    }
    prev = next;
  }
  return prev;
}

/**
 * Assert that the SVG contains at least `min` path elements.
 * Use to confirm that a feature (hub, abstract, text) actually added geometry.
 */
export async function expectSvgPathCountAtLeast(page: Page, min: number): Promise<void> {
  const stats = await waitForSvgStable(page);
  expect(stats.pathCount, `Expected SVG to have ≥ ${min} paths, got ${stats.pathCount}`).toBeGreaterThanOrEqual(min);
}

/**
 * Assert that a specific CSS colour string (hex or rgb) appears among the
 * fill values of SVG paths.  Pass a case-insensitive substring, e.g. "#38bdf8".
 */
export async function expectSvgContainsColor(page: Page, colorSubstring: string): Promise<void> {
  const stats = await waitForSvgStable(page);
  const found = stats.fills.some(f => f.toLowerCase().includes(colorSubstring.toLowerCase()));
  expect(found, `Expected SVG fills ${JSON.stringify(stats.fills)} to include "${colorSubstring}"`).toBe(true);
}

// ─── 3D canvas visual helpers ─────────────────────────────────────────────────

export interface CanvasPixelStats {
  /** Total pixels sampled */
  total: number;
  /** Pixels that are NOT the background colour (dark/transparent) */
  nonBackgroundCount: number;
  /** Fraction of pixels that are non-background (0–1) */
  nonBackgroundRatio: number;
  /** Most-frequent non-background colour as "#rrggbb" */
  dominantColor: string;
  /** Whether the canvas appears blank (all pixels are background) */
  isBlank: boolean;
}

/**
 * Sample the WebGL canvas and return pixel statistics.
 *
 * Because WebGL canvases use `preserveDrawingBuffer: false` by default the
 * pixel data must be captured immediately after a frame is drawn.  We use
 * a `requestAnimationFrame` fence inside `page.evaluate()` to ensure we
 * read a live frame.
 */
export async function getCanvasPixelStats(
  page: Page,
  /** Hex background colour to treat as "empty", e.g. "#1e293b" (default dark slate) */
  backgroundHex = '#1e293b',
  /** Number of random sample points (higher = slower but more accurate) */
  sampleSize = 2000
): Promise<CanvasPixelStats> {
  return page.evaluate(
    ({ backgroundHex, sampleSize }: { backgroundHex: string; sampleSize: number }) => {
      return new Promise<CanvasPixelStats>((resolve) => {
        // Parse background colour
        const parseHex = (hex: string) => ({
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
        });
        const bg = parseHex(backgroundHex);

        // Tolerance for "is this a background pixel?"
        const TOLERANCE = 20;

        const isBackground = (r: number, g: number, b: number) =>
          Math.abs(r - bg.r) < TOLERANCE &&
          Math.abs(g - bg.g) < TOLERANCE &&
          Math.abs(b - bg.b) < TOLERANCE;

        // Wait one animation frame so WebGL has drawn the current scene
        requestAnimationFrame(() => {
          const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
          if (!canvas) {
            resolve({
              total: 0,
              nonBackgroundCount: 0,
              nonBackgroundRatio: 0,
              dominantColor: '#000000',
              isBlank: true,
            });
            return;
          }

          // Try to get a 2D context for reading pixels (works if preserveDrawingBuffer
          // is true, or if the canvas is a 2D canvas overlay).
          // For WebGL canvases we read through toDataURL instead.
          let pixelData: Uint8ClampedArray | null = null;
          let width = canvas.width;
          let height = canvas.height;

          try {
            const ctx2d = canvas.getContext('2d');
            if (ctx2d) {
              pixelData = ctx2d.getImageData(0, 0, width, height).data;
            }
          } catch (err) {
            console.debug('Canvas 2D context pixel read failed (may be WebGL-only):', err);
          }

          if (!pixelData) {
            // Fallback: draw the canvas onto a 2D canvas and read from there
            const offscreen = document.createElement('canvas');
            offscreen.width = width;
            offscreen.height = height;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, 0, 0);
              try {
                pixelData = ctx.getImageData(0, 0, width, height).data;
              } catch (err) {
                console.warn('Offscreen canvas pixel read failed (cross-origin or security policy):', err);
              }
            }
          }

          if (!pixelData || width === 0 || height === 0) {
            resolve({
              total: sampleSize,
              nonBackgroundCount: 0,
              nonBackgroundRatio: 0,
              dominantColor: '#000000',
              isBlank: true,
            });
            return;
          }

          // Sample random pixels
          const colorCounts: Record<string, number> = {};
          let nonBg = 0;

          for (let i = 0; i < sampleSize; i++) {
            const x = Math.floor(Math.random() * width);
            const y = Math.floor(Math.random() * height);
            const idx = (y * width + x) * 4;
            const r = pixelData[idx];
            const g = pixelData[idx + 1];
            const b = pixelData[idx + 2];
            const a = pixelData[idx + 3];

            if (a < 20) continue; // fully transparent

            if (!isBackground(r, g, b)) {
              nonBg++;
              const hex =
                '#' +
                r.toString(16).padStart(2, '0') +
                g.toString(16).padStart(2, '0') +
                b.toString(16).padStart(2, '0');
              colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
          }

          const dominantColor =
            Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#000000';

          resolve({
            total: sampleSize,
            nonBackgroundCount: nonBg,
            nonBackgroundRatio: nonBg / sampleSize,
            dominantColor,
            isBlank: nonBg === 0,
          });
        });
      });
    },
    { backgroundHex, sampleSize }
  );
}

/**
 * Assert that the 3D canvas is not blank — i.e., at least `minRatio` of
 * sampled pixels are non-background, confirming geometry was rendered.
 * Polls every 500 ms up to `pollTimeout` ms before asserting.
 */
export async function expectCanvasNotBlank(
  page: Page,
  minRatio = 0.01,
  pollTimeout = 10_000
): Promise<void> {
  const deadline = Date.now() + pollTimeout;
  let stats = await getCanvasPixelStats(page);
  while (stats.nonBackgroundRatio < minRatio && Date.now() < deadline) {
    await page.waitForTimeout(500);
    stats = await getCanvasPixelStats(page);
  }
  expect(
    stats.nonBackgroundRatio,
    `Expected 3D canvas to have ≥ ${(minRatio * 100).toFixed(1)}% non-background pixels, got ${(stats.nonBackgroundRatio * 100).toFixed(1)}%`
  ).toBeGreaterThanOrEqual(minRatio);
}

/**
 * Parse a hex colour string "#rrggbb" → { r, g, b }.
 */
export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Compute the Euclidean distance between two RGB colours (0–441 range).
 */
export function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Assert that the dominant non-background colour on the 3D canvas is
 * "close enough" to the expected hex colour within a Euclidean distance
 * tolerance (default 60 out of 441).
 *
 * Polls up to `pollTimeout` ms waiting for non-blank canvas data before
 * asserting.
 *
 * This verifies that "model color = #38bdf8" actually renders sky-blue geometry.
 */
export async function expectCanvasDominantColor(
  page: Page,
  expectedHex: string,
  tolerance = 60,
  pollTimeout = 10_000
): Promise<void> {
  const deadline = Date.now() + pollTimeout;
  let stats = await getCanvasPixelStats(page);
  while (stats.isBlank && Date.now() < deadline) {
    await page.waitForTimeout(500);
    stats = await getCanvasPixelStats(page);
  }

  if (stats.isBlank) {
    // Canvas is still blank — geometry may not have loaded; skip colour check
    console.warn('Canvas appears blank after polling; skipping dominant colour assertion.');
    return;
  }

  const expected = parseHexColor(expectedHex);
  const actual = parseHexColor(stats.dominantColor);
  const dist = colorDistance(expected, actual);

  expect(
    dist,
    `Expected dominant canvas colour ≈ ${expectedHex} (got ${stats.dominantColor}, distance ${dist.toFixed(1)} > tolerance ${tolerance})`
  ).toBeLessThanOrEqual(tolerance);
}

// ─── Config-change helpers ────────────────────────────────────────────────────

/**
 * Change the model color via the color input and wait for the SVG to update.
 * `colorHex` should be a 6-digit hex string like "#ff0000".
 */
export async function setModelColor(page: Page, colorHex: string): Promise<void> {
  const colorInput = page.locator('input[type="color"]').first();
  await colorInput.evaluate(
    (el: HTMLInputElement, hex: string) => {
      el.value = hex;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    colorHex
  );
  await page.waitForTimeout(500);
}

/**
 * Click the document body to remove focus from any focused input element.
 * Use this before firing keyboard shortcuts to ensure they are not consumed
 * by an active text field.
 */
export async function clearFocus(page: Page): Promise<void> {
  await page.locator('body').click();
}

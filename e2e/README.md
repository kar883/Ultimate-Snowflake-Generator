# E2E Testing – Ultimate Snowflake Generator

Playwright-powered end-to-end tests that cover every major feature of the app
and include three layers of **visual verification** to confirm that the 2D and
3D renderings actually match the configuration you set.

---

## Quick start

```bash
# 1. Install dependencies (once)
npm install
npx playwright install chromium   # downloads the headless browser

# 2. Run all tests (starts the Vite dev server automatically)
npm run test:e2e

# 3. Open the interactive test UI (great for debugging)
npm run test:e2e:ui

# 4. Run tests in a headed (visible) browser
npm run test:e2e:headed

# 5. View the last HTML report
npm run test:e2e:report
```

---

## Visual snapshot baselines

The `visual-snapshots.spec.ts` file uses `toHaveScreenshot()` to capture
pixel-exact PNG references.  On the **first run** no baselines exist, so you
must generate them:

```bash
npx playwright test e2e/visual-snapshots.spec.ts --update-snapshots
```

This writes golden PNGs into `e2e/visual-snapshots.spec.ts-snapshots/`.
**Commit these files** to source control so that every subsequent CI run can
diff against them.

On subsequent runs:

```bash
npx playwright test e2e/visual-snapshots.spec.ts
```

Any pixel diff > 2 % (configurable via `maxDiffPixelRatio` in the spec) fails
the test and writes a side-by-side diff image into `playwright-report/`.

---

## Test files

| File | What it tests |
|------|---------------|
| `app-load.spec.ts` | App loads, title visible, all 7 tabs present, no JS errors |
| `header.spec.ts` | Project name, Save / Load / Reset, Settings modal |
| `global-tab.spec.ts` | Extrusion depth, bevel, quality, boldness, colour, slots toggle |
| `text-tab.spec.ts` | Phrase, font, arms, radius, spacing, mirror, underline |
| `hubs-tab.spec.ts` | Add hub, shapes (circle/polygon/star), hollow, oscillation |
| `abstract-tab.spec.ts` | Add shape/fractal, types, amplitude, frequency, fractal controls |
| `planes-tab.spec.ts` | Layer visibility, rename, rotation, slot type per layer |
| `slots.spec.ts` | Cut Slots toggle, mode (2/3-plane), per-layer adjustments |
| `export.spec.ts` | STL / ZIP / SVG / DXF buttons, quality selector, download event |
| `keyboard.spec.ts` | Alt+1–6 tab switching, Ctrl+Z/Y undo/redo, Ctrl+R regenerate |
| **`visual-2d.spec.ts`** | **SVG DOM inspection** – path count, bounding box, fill colour |
| **`visual-3d.spec.ts`** | **Canvas pixel analysis** – non-blank, dominant colour match |
| **`visual-snapshots.spec.ts`** | **Pixel-exact baselines** – 18 × 2D + 2 × 3D golden screenshots |

---

## Visual verification in depth

### 1 – SVG DOM inspection (`visual-2d.spec.ts`)

The 2D preview renders as a real `<svg>` in the DOM.  Tests read it with
`page.evaluate()` to check:

- **Path count** changes when you change text, arm count, add a hub/abstract,
  or disable a layer.
- **Bounding box** is non-zero, confirming something is rendered.
- **Fill colour** attribute on `<path>` elements matches the chosen model
  colour.

### 2 – Canvas pixel analysis (`visual-3d.spec.ts`)

`getCanvasPixelStats()` in `fixtures.ts` samples random pixels from the WebGL
`<canvas>` after a `requestAnimationFrame` fence, then computes:

| Metric | Purpose |
|--------|---------|
| `nonBackgroundRatio` | Are there any lit pixels? (canvas not blank) |
| `dominantColor` | Most-frequent non-background hex colour |
| `isBlank` | True when canvas is all background / transparent |

Tests assert:
- Canvas has ≥ 1 % non-background pixels after load.
- Changing the model colour picker causes the dominant canvas colour to shift.
- Disabling a layer reduces the coverage ratio.

### 3 – Pixel-exact snapshots (`visual-snapshots.spec.ts`)

20 deterministic scenarios (reset app → apply one change → screenshot).
Each scenario is captured as a PNG baseline.  If the rendering ever changes
unexpectedly—wrong colour, missing arm, broken bevel—the diff fails and
Playwright's HTML report shows exactly which pixels changed.

---

## Configuration

`playwright.config.ts` at the project root:

- **Base URL**: `http://localhost:5173` (Vite dev server)
- **webServer**: starts `npm run dev` automatically; reuses a running server
  locally, always starts fresh on CI.
- **Timeout**: 60 s per test, 120 s for the dev server to start.
- **Retries**: 1 on CI, 0 locally.
- **Viewport**: 1440 × 900.
- **Screenshot on failure**: enabled.
- **Trace on first retry**: enabled.

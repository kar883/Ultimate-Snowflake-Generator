import { defineConfig, devices } from '@playwright/test';

/**
 * Ultimate Snowflake Generator – Playwright E2E configuration.
 *
 * Run all tests:          npm run test:e2e
 * Interactive UI mode:    npm run test:e2e:ui
 * Headed (visible):       npm run test:e2e:headed
 * View last HTML report:  npm run test:e2e:report
 */
export default defineConfig({
  testDir: './e2e',
  /* Maximum time (ms) for a single test to complete */
  timeout: 60_000,
  /* Retry once on CI, zero locally */
  retries: process.env.CI ? 1 : 0,
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Reporter */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  /* Shared settings applied to every test */
  use: {
    /* Base URL – the Vite dev server */
    baseURL: 'http://localhost:5173',
    /* Always collect a trace on the first retry */
    trace: 'on-first-retry',
    /* Capture a screenshot on failure */
    screenshot: 'only-on-failure',
    /* Viewport that matches a typical desktop */
    viewport: { width: 1440, height: 900 },
    /* Ignore HTTPS errors (the dev server uses plain HTTP) */
    ignoreHTTPSErrors: true,
    /* Slow down actions slightly so animations finish */
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* WebGL must be enabled for the 3D canvas */
        launchOptions: {
          args: [
            '--enable-webgl',
            '--use-gl=swiftshader',
            '--disable-web-security',
          ],
        },
      },
    },
  ],

  /* Start the Vite dev server automatically before running tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

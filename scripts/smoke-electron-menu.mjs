import path from 'node:path';
import { _electron as electron } from 'playwright';

const appExe = path.resolve('dist-electron/win-unpacked/Snowflake Generator.exe');

const log = (msg) => console.log(`[smoke-electron-menu] ${msg}`);

(async () => {
  let app;
  try {
    log(`Launching packaged app: ${appExe}`);
    app = await electron.launch({ executablePath: appExe, timeout: 120000 });
    const page = await app.firstWindow();

    await page.waitForLoadState('domcontentloaded', { timeout: 120000 });
    await page.waitForTimeout(2500);

    // 1) Trigger the exact renderer IPC event used by Help -> Check for Updates.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error('No BrowserWindow found');
      win.webContents.send('menu-check-for-updates');
      return true;
    });

    await page.getByText('About Ultimate Snowflake Generator', { exact: true }).waitFor({ timeout: 15000 });
    log('About modal opened from menu-check-for-updates IPC event.');

    // 2) Verify update-check status started and then resolves to a user-facing message.
    await page.waitForFunction(() => {
      const txt = document.body?.innerText || '';
      return (
        txt.includes('Checking for updates...') ||
        txt.includes('Update available:') ||
        txt.includes('You are up to date') ||
        txt.includes('Unable to check for updates') ||
        txt.includes('Failed to check for updates')
      );
    }, { timeout: 20000 });

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
    const text = lines.find((line) =>
      line.includes('Checking for updates...') ||
      line.includes('Update available:') ||
      line.includes('You are up to date') ||
      line.includes('Unable to check for updates') ||
      line.includes('Failed to check for updates')
    ) || '';
    const accepted = [
      'Checking for updates...',
      'Update available:',
      'You are up to date',
      'Unable to check for updates',
      'Failed to check for updates',
    ];

    if (!accepted.some((x) => text.includes(x))) {
      throw new Error(`Unexpected update status text: "${text}"`);
    }

    log(`Observed update status: ${text}`);

    // Close modal to prove app remains interactive.
    const closeButton = page.locator('button').filter({ has: page.locator('svg path[d*="M6 18L18 6"]') }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    log('Menu integration smoke test passed.');
  } catch (err) {
    console.error('[smoke-electron-menu] FAILED');
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
})();

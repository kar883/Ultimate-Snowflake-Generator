const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const distIndex = path.join(projectRoot, 'dist', 'index.html');
const preloadPath = path.join(projectRoot, 'preload.js');
const reportPath = path.join(projectRoot, 'dist', 'manifold-validation.json');
const VALIDATOR_NAME = '__snowflakeRunManifoldValidation';
const VALIDATOR_TIMEOUT_MS = 120000;

function fail(message, error) {
  console.error(`\n✗ Manifold verification failed: ${message}`);
  if (error) {
    console.error(error?.stack || error?.message || error);
  }
  app.exit(1);
}

async function waitForValidator(window) {
  const start = Date.now();
  while ((Date.now() - start) < VALIDATOR_TIMEOUT_MS) {
    const ready = await window.webContents.executeJavaScript(
      `typeof window.${VALIDATOR_NAME} === 'function'`,
      true
    );
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for window.${VALIDATOR_NAME}`);
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

function startStaticServer() {
  const rootDir = path.join(projectRoot, 'dist');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      const safePath = path.normalize(relativePath).replace(/^([.][.][/\\])+/, '');
      const filePath = path.join(rootDir, safePath);

      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Internal error');
          return;
        }

        res.writeHead(200, {
          'Content-Type': getContentType(filePath),
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine static server port'));
        return;
      }

      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/index.html`,
      });
    });
  });
}

async function main() {
  fs.rmSync(reportPath, { force: true });
  const { server, url } = await startStaticServer();

  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  window.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  try {
    await window.loadURL(url);
    await waitForValidator(window);

    const result = await window.webContents.executeJavaScript(
      `window.${VALIDATOR_NAME}()`,
      true
    );

    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

    console.log('\n✓ Representative mesh manifold validation passed');
    console.log(`Report written to ${reportPath}`);
    await window.close();
    server.close();
    app.exit(0);
  } catch (error) {
    server.close();
    throw error;
  }
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady()
  .then(main)
  .catch((error) => fail('unexpected Electron validation error', error));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false, // Don't show until ready-to-show
    titleBarStyle: 'default'
  });

  // Load the app
  if (app.isPackaged) {
    mainWindow.loadFile('dist/index.html');
  } else {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Helper function to check for updates from GitHub
function checkForUpdates() {
  return new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/kar883/Ultimate-Snowflake-Generator/releases/latest', {
      headers: { 'User-Agent': 'Ultimate-Snowflake-Generator' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = (release.tag_name || '').replace('v', '');
          const currentVersion = app.getVersion();
          
          resolve({
            latestVersion,
            currentVersion,
            hasUpdate: latestVersion !== currentVersion,
            downloadUrl: 'https://github.com/kar883/Ultimate-Snowflake-Generator/releases/latest',
            releaseUrl: release.html_url
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// IPC: renderer asks main process to check update status.
ipcMain.handle('app:check-for-updates', async () => {
  try {
    const result = await checkForUpdates();
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Failed to check for updates',
      currentVersion: app.getVersion(),
      hasUpdate: false,
      latestVersion: null,
      releaseUrl: 'https://github.com/kar883/Ultimate-Snowflake-Generator/releases/latest',
    };
  }
});

// IPC: open URLs in the OS browser from renderer requests.
ipcMain.handle('app:open-external', async (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, error: 'Invalid URL' };
});

// Helper function to show About dialog
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Ultimate Snowflake Generator',
    message: 'Ultimate Snowflake Generator',
    detail: 'Version 1.0.5\nCreated by Kyle Russell\n\nA beautiful 3D snowflake design generator for art and 3D printing.\n\nVisit the GitHub repository for more information and to report issues.',
    buttons: ['GitHub Repository', 'OK'],
    defaultId: 1,
    cancelId: 1
  }).then(result => {
    if (result.response === 0) {
      shell.openExternal('https://github.com/kar883/Ultimate-Snowflake-Generator');
    }
  });
}

// Helper function to check and prompt for updates
function checkAndPromptForUpdates(isManual = false) {
  checkForUpdates().then(versionInfo => {
    if (versionInfo.hasUpdate) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: 'A new version is available!',
        detail: `Version ${versionInfo.latestVersion} is now available.\nYou are currently using version ${versionInfo.currentVersion}.\n\nWould you like to download the new version?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then(result => {
        if (result.response === 0) {
          shell.openExternal(versionInfo.releaseUrl);
        }
      });
    } else if (isManual) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'App is Up to Date',
        message: 'You are running the latest version!',
        detail: `Version ${versionInfo.currentVersion} is the latest available.`,
        buttons: ['OK']
      });
    }
  }).catch(error => {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates',
      detail: 'Failed to connect to GitHub. Please check your internet connection and try again.',
      buttons: ['OK']
    });
  });
}

// Create application menu
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Save Project',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow.webContents.send('menu-save-project');
        }
      },
      {
        label: 'Load Project',
        accelerator: 'CmdOrCtrl+L',
        click: () => {
          mainWindow.webContents.send('menu-load-project');
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => {
          mainWindow.webContents.send('menu-undo');
        }
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => {
          mainWindow.webContents.send('menu-redo');
        }
      },
      { type: 'separator' },
      {
        label: 'Reset App',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => {
          mainWindow.webContents.send('menu-reset-app');
        }
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Toggle 2D/3D View',
        accelerator: 'CmdOrCtrl+1',
        click: () => {
          mainWindow.webContents.send('menu-toggle-view');
        }
      },
      {
        label: 'Force Regenerate',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          mainWindow.webContents.send('menu-force-regenerate');
        }
      },
      { type: 'separator' },
      {
        label: 'Reset Zoom',
        click: () => {
          mainWindow.webContents.send('menu-reset-zoom');
        }
      }
    ]
  },
  {
    label: 'Export',
    submenu: [
      {
        label: 'Export Combined STL',
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          mainWindow.webContents.send('menu-export-stl');
        }
      },
      {
        label: 'Export SVG',
        click: () => {
          mainWindow.webContents.send('menu-export-svg');
        }
      },
      {
        label: 'Export DXF',
        click: () => {
          mainWindow.webContents.send('menu-export-dxf');
        }
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Ultimate Snowflake Generator',
        click: () => {
          showAbout();
        }
      },
      {
        label: 'Check for Updates',
        click: () => {
          checkAndPromptForUpdates(true);
        }
      },
      {
        label: 'Keyboard Shortcuts',
        click: () => {
          mainWindow.webContents.send('menu-shortcuts');
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Handle security warnings
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

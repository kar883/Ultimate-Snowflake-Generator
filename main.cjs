const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

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
        label: 'About',
        click: () => {
          mainWindow.webContents.send('menu-about');
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

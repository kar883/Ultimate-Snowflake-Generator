const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Menu event listeners
  onSaveProject: (callback) => ipcRenderer.on('menu-save-project', callback),
  onLoadProject: (callback) => ipcRenderer.on('menu-load-project', callback),
  onUndo: (callback) => ipcRenderer.on('menu-undo', callback),
  onRedo: (callback) => ipcRenderer.on('menu-redo', callback),
  onResetApp: (callback) => ipcRenderer.on('menu-reset-app', callback),
  onToggleView: (callback) => ipcRenderer.on('menu-toggle-view', callback),
  onForceRegenerate: (callback) => ipcRenderer.on('menu-force-regenerate', callback),
  onResetZoom: (callback) => ipcRenderer.on('menu-reset-zoom', callback),
  onExportStl: (callback) => ipcRenderer.on('menu-export-stl', callback),
  onExportSvg: (callback) => ipcRenderer.on('menu-export-svg', callback),
  onExportDxf: (callback) => ipcRenderer.on('menu-export-dxf', callback),
  onAbout: (callback) => ipcRenderer.on('menu-about', callback),
  onShortcuts: (callback) => ipcRenderer.on('menu-shortcuts', callback),

  // App utilities
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  
  // Remove all listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('menu-save-project');
    ipcRenderer.removeAllListeners('menu-load-project');
    ipcRenderer.removeAllListeners('menu-undo');
    ipcRenderer.removeAllListeners('menu-redo');
    ipcRenderer.removeAllListeners('menu-reset-app');
    ipcRenderer.removeAllListeners('menu-toggle-view');
    ipcRenderer.removeAllListeners('menu-force-regenerate');
    ipcRenderer.removeAllListeners('menu-reset-zoom');
    ipcRenderer.removeAllListeners('menu-export-stl');
    ipcRenderer.removeAllListeners('menu-export-svg');
    ipcRenderer.removeAllListeners('menu-export-dxf');
    ipcRenderer.removeAllListeners('menu-about');
    ipcRenderer.removeAllListeners('menu-shortcuts');
  }
});

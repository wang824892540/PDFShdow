const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  processPDF: (config) => ipcRenderer.invoke('process-pdf', config),
  generateSheinLabel: (params) => ipcRenderer.invoke('generate-shein-label', params),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  copyFileToClipboard: (filePath) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  onShowToast: (callback) => ipcRenderer.on('show-toast', (_event, ...args) => callback(...args)),
  getPdfMetadata: (filePath) => ipcRenderer.invoke('get-pdf-metadata', filePath),

  // Window control functions
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeRestoreWindow: () => ipcRenderer.send('maximize-restore-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  minimizeDownloadWindow: () => ipcRenderer.send('minimize-download-window'),

  // Listeners for window state changes from main process
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  
  // Download progress listeners
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', callback),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (_event, error) => callback(error)),
  onDownloadStarted: (callback) => ipcRenderer.on('download-started', callback)
})
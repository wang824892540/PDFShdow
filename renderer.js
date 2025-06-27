const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  processPDF: (args) => ipcRenderer.invoke('process-pdf', args),
  generateSheinLabel: (params) => ipcRenderer.invoke('generate-shein-label', params),
  generateMultiMergeLabel: (params) => ipcRenderer.invoke('generate-multi-merge-label', params),
  convertPdfToImages: (params) => ipcRenderer.invoke('convert-pdf-to-images', params),
  selectDirectory: () => ipcRenderer.invoke('select-output-directory'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  copyFileToClipboard: (path) => ipcRenderer.invoke('copy-file-to-clipboard', path),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getPdfMetadata: (filePath) => ipcRenderer.invoke('get-pdf-metadata', filePath),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeRestoreWindow: () => ipcRenderer.send('maximize-restore-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),

  // Updates
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  quitAndInstallUpdate: () => ipcRenderer.send('quit-and-install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),

  // Toasts from main
  onShowToast: (callback) => ipcRenderer.on('show-toast', (event, ...args) => callback(...args)),
  
  // Misc
  openOfficialWebsite: () => ipcRenderer.invoke('open-official-website'),
});
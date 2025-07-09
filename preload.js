const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // File/Directory Dialogs
  openFile: () => ipcRenderer.invoke('open-file'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openImageFiles: () => ipcRenderer.invoke('open-image-files'),

  // PDF Processing
  getPdfMetadata: (filePath) => ipcRenderer.invoke('get-pdf-metadata', filePath),
  processPDF: (args) => ipcRenderer.invoke('process-pdf', args),
  generateSheinLabel: (params) => ipcRenderer.invoke('generate-shein-label', params),
  generateMultiMergeLabel: (params) => ipcRenderer.invoke('generate-multi-merge-label', params),
  convertPdfToImages: (params) => ipcRenderer.invoke('convert-pdf-to-images', params),
  getImageAsBase64: (filePath) => ipcRenderer.invoke('get-image-as-base64', filePath),
  handleImageToPdf: (args) => ipcRenderer.invoke('handle-image-to-pdf', args),

  // System Interactions
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  copyFileToClipboard: (path) => ipcRenderer.invoke('copy-file-to-clipboard', path),
  openOfficialWebsite: () => ipcRenderer.invoke('open-official-website'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeRestoreWindow: () => ipcRenderer.send('maximize-restore-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
  
  // Updates
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),

  // Listeners from Main to Renderer
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),
  onShowToast: (callback) => ipcRenderer.on('show-toast', (event, ...args) => callback(...args)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
});
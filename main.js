const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen } = require('electron') // Added shell and clipboard, screen
const path = require('path')
const fs = require('fs').promises; // For asynchronous file operations
const { PDFDocument } = require('pdf-lib') // PDFDocument will be used by worker, but main might not need it directly for this handler anymore. Keep for now.
const { Worker } = require('worker_threads') // Added Worker
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // We will handle download manually or prompt user

// Early setup for unhandled exception toaster
let mainWindow // mainWindow will be assigned later in createWindow

// Helper function to send toast messages to the renderer process
// Defined early so it can be used by uncaughtException handler if needed,
// though mainWindow might not be ready yet in very early exceptions.
function sendToastToRenderer(message, type = 'info', duration = 3500) {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-toast', message, type, duration);
  } else {
    // Log to main process console if window is not available or destroyed
    console.log(`[Main Process Toast - ${type}]: ${message} (mainWindow not available or destroyed)`);
  }
}

process.on('uncaughtException', (error) => {
  console.error('Unhandled Main Process Exception:', error);
  // Attempt to send a toast, but window might not be ready or might be the cause of the error
  sendToastToRenderer(`主进程发生严重错误: ${error.message}`, 'error', 10000);
  // Consider logging to a file or a more robust error reporting mechanism for critical errors
  // For now, we'll let Electron's default behavior (dialog and quit) proceed after logging/toasting.
});

// Helper function to send toast messages to the renderer process
function sendToastToRenderer(message, type = 'info', duration = 3500) {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-toast', message, type, duration);
  } else {
    // Log to main process console if window is not available or destroyed
    console.log(`[Main Process Toast - ${type}]: ${message} (mainWindow not available or destroyed)`);
  }
}

// --- PDF Metadata Helper ---
async function getPdfMetadataInternal(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const fileBuffer = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer, {
      // Ignore errors for potentially problematic PDFs, try to get page count if possible
      ignoreEncryption: true,
      updateMetadata: false
    });
    return {
      success: true,
      size: stats.size,
      pageCount: pdfDoc.getPageCount()
    };
  } catch (error) {
    console.error(`Error getting metadata for ${filePath}:`, error);
    // Try to get size even if page count fails
    try {
      const stats = await fs.stat(filePath);
      return {
        success: false, // Indicate partial success or specific error type
        error: `无法完全读取PDF元数据 (例如页数): ${error.message}`,
        size: stats.size,
        pageCount: null // Explicitly null if page count failed
      };
    } catch (statError) {
      console.error(`Error getting even file size for ${filePath} after PDF error:`, statError);
      return {
        success: false,
        error: `无法读取文件属性: ${statError.message}`,
        size: null,
        pageCount: null
      };
    }
  }
}

// IPC handler for getting PDF metadata
ipcMain.handle('get-pdf-metadata', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: '无效的文件路径。', size: null, pageCount: null };
  }
  return await getPdfMetadataInternal(filePath);
});
// --- End PDF Metadata Helper ---

const SETTINGS_FILE_NAME = 'user-settings.json';
let settingsFilePath = ''; // Will be initialized in app.whenReady

// Helper function to ensure settings path is initialized
function getSettingsFilePath() {
  if (!settingsFilePath) {
    settingsFilePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
  }
  return settingsFilePath;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.round(screenWidth * 0.6),
    height: Math.round(screenHeight * 0.8), // Changed from 0.8 to 0.9
    show: false, // Don't show the window until it's ready
    frame: false, // Create a frameless window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false, // Ensure Node.js integration is off in renderer for security
      devTools: !app.isPackaged // Enable DevTools only in development
    }
  })

  // Event listeners for window state changes to notify renderer
  mainWindow.on('maximize', () => {
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized');
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-unmaximized');
    }
  });

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    // mainWindow.maximize() // Removed maximize
    mainWindow.show()
  })
}

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return null; // Return null if dialog was canceled or no file was selected
  }
  return filePaths[0];
})

ipcMain.handle('process-pdf', async (_, { filePath, operations, outputName }) => {
  return new Promise((resolve, reject) => {
    // Basic validation in main thread before starting worker
    if (!filePath || !operations || !outputName) {
      console.error('[Main Process - process-pdf] Missing required parameters.');
      resolve({ success: false, error: '主进程错误：缺少必要的参数 (文件路径、操作或输出名)。' });
      return;
    }
    if (operations.resize && (
        typeof operations.resize.width !== 'number' ||
        typeof operations.resize.height !== 'number' ||
        operations.resize.width <= 0 ||
        operations.resize.height <= 0
    )) {
        console.error('[Main Process - process-pdf] Invalid resize dimensions.');
        resolve({ success: false, error: '主进程错误：无效的自定义尺寸参数。' });
        return;
    }

    const worker = new Worker(path.join(__dirname, 'process-pdf-worker.js'), {
      workerData: { filePath, operations, outputName }
    });

    let resolved = false; // Flag to prevent multiple resolves

    worker.on('message', async (result) => { // Made async
      if (resolved) return;
      resolved = true;
      console.log('[Main Process - process-pdf] Worker finished with result:', result);
      if (result.success && result.path) {
        const metadata = await getPdfMetadataInternal(result.path);
        if (metadata.success) {
          result.outputFileSize = metadata.size;
          result.outputPageCount = metadata.pageCount;
        } else {
          // Log error but don't fail the whole operation if metadata retrieval fails for output
          console.warn(`[Main Process - process-pdf] Could not get metadata for output file ${result.path}: ${metadata.error}`);
          result.outputFileSize = null;
          result.outputPageCount = null;
          result.metadataError = metadata.error; // Optionally pass this info
        }
      }
      resolve(result);
    });

    worker.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      console.error('[Main Process - process-pdf] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || 'PDF处理工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      if (resolved) return;
      // No need to set resolved = true here, as this is a final state if no message/error was received.
      if (code !== 0) {
        console.error(`[Main Process - process-pdf] Worker stopped with exit code ${code} without sending a result.`);
        resolve({ success: false, error: `PDF处理工作线程意外终止，退出码: ${code}。` });
      } else if (!resolved) { // Exited cleanly but no message (should not happen if worker always posts message)
        console.warn('[Main Process - process-pdf] Worker exited cleanly (code 0) but did not send a result. This might indicate an issue in the worker logic.');
        resolve({ success: false, error: 'PDF处理工作线程已退出但未返回结果。' });
      }
    });
  });
})

// Download window control IPC handlers
ipcMain.on('minimize-download-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('download-started', () => {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-started');
  }
});

ipcMain.on('download-progress', (event, progress) => {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-progress', progress);
  }
});

ipcMain.on('download-complete', () => {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-complete');
  }
});

ipcMain.on('download-error', (event, error) => {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-error', error);
  }
});

ipcMain.handle('generate-shein-label', async (_, { pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM }) => {
  return new Promise((resolve, reject) => {
    // Basic validation in main thread before starting worker
    if (!pdf1Path || !pdf2Path || !outputName || typeof outputWidthMM !== 'number' || typeof outputHeightMM !== 'number' || outputWidthMM <= 0 || outputHeightMM <= 0) {
      console.error('[Main Process - generate-shein-label] Missing or invalid required parameters.');
      resolve({ success: false, error: '主进程错误：缺少必要的参数或参数无效 (PDF路径、输出名或尺寸)。' });
      return;
    }

    const worker = new Worker(path.join(__dirname, 'shein-label-worker.js'), {
      workerData: { pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM }
    });

    let resolved = false; // Flag to prevent multiple resolves

    worker.on('message', async (result) => { // Made async
      if (resolved) return;
      resolved = true;
      console.log('[Main Process - generate-shein-label] Worker finished with result:', result);
      if (result.success && result.path) {
        const metadata = await getPdfMetadataInternal(result.path);
        if (metadata.success) {
          result.outputFileSize = metadata.size;
          result.outputPageCount = metadata.pageCount;
        } else {
          console.warn(`[Main Process - generate-shein-label] Could not get metadata for output file ${result.path}: ${metadata.error}`);
          result.outputFileSize = null;
          result.outputPageCount = null;
          result.metadataError = metadata.error;
        }
      }
      resolve(result);
    });

    worker.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      console.error('[Main Process - generate-shein-label] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || 'Shein 标签处理工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      if (resolved) return;
      if (code !== 0) {
        console.error(`[Main Process - generate-shein-label] Worker stopped with exit code ${code} without sending a result.`);
        resolve({ success: false, error: `Shein 标签处理工作线程意外终止，退出码: ${code}。` });
      } else if (!resolved) { // Exited cleanly but no message
        console.warn('[Main Process - generate-shein-label] Worker exited cleanly (code 0) but did not send a result.');
        resolve({ success: false, error: 'Shein 标签处理工作线程已退出但未返回结果。' });
      }
    });
  });
});

// IPC handler to open a given path (file or directory)
ipcMain.handle('open-path', async (event, filePath) => {
  try {
    const error = await shell.openPath(filePath); // shell.openPath returns a promise
    if (error) { // Non-empty string indicates an error
      console.error(`Failed to open path ${filePath}: ${error}`);
      return { success: false, error: `无法打开路径: ${error}` };
    }
    return { success: true };
  } catch (err) { // Catch any unexpected exceptions
    console.error(`Exception opening path ${filePath}: ${err.message}`);
    return { success: false, error: `打开路径时发生异常: ${err.message}` };
  }
});

// IPC handler to show a file in its folder
ipcMain.handle('show-item-in-folder', (event, filePath) => {
  try {
    shell.showItemInFolder(filePath); // This is a synchronous operation
    return { success: true };
  } catch (err) { // Though typically synchronous, good to have a catch block
    console.error(`Exception showing item in folder ${filePath}: ${err.message}`);
    return { success: false, error: `在文件夹中显示项目时发生异常: ${err.message}` };
  }
});

// IPC handler to copy a file to the clipboard
ipcMain.handle('copy-file-to-clipboard', async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      console.error('Copy file to clipboard: Invalid file path provided.', filePath);
      return { success: false, error: '无效的文件路径。' };
    }
    // Attempting to use _writeFilesForTesting based on diagnostic logs
    // We know from logs that typeof clipboard._writeFilesForTesting is 'function'
    if (typeof clipboard._writeFilesForTesting === 'function') {
      clipboard._writeFilesForTesting([filePath]);
      console.log('Attempted to copy file(s) to clipboard using _writeFilesForTesting:', filePath);
      return { success: true }; // Indicates true file copy attempt
    } else {
      // This block should ideally not be reached if the previous logs were accurate.
      console.error('CRITICAL: clipboard._writeFilesForTesting was unexpectedly not a function. Falling back to copying path.');
      clipboard.writeText(filePath);
      console.log('File path copied to clipboard as an unexpected fallback:', filePath);
      return { success: true, action: 'path_copied_unexpected_fallback', message: 'File copy method not found, file path copied instead.' };
    }
  } catch (error) {
    console.error('Error during clipboard operation (using _writeFilesForTesting or fallback):', filePath, error);
    return { success: false, error: error.message || '剪贴板操作时发生未知错误。' };
  }
});

// IPC handler for getting settings
ipcMain.handle('get-settings', async () => {
  const filePath = getSettingsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return default settings (empty object)
      sendToastToRenderer('未找到设置文件，将使用默认设置。', 'info');
      return {};
    }
    // Other error (e.g., corrupted JSON, permissions)
    console.error(`Error reading settings file ${filePath}:`, error);
    sendToastToRenderer(`读取设置失败: ${error.message || '未知错误'}`, 'warning');
    return {}; // Return default on other errors as well to prevent app crash
  }
});

// IPC handler for saving settings
ipcMain.handle('save-settings', async (event, settings) => {
  const filePath = getSettingsFilePath();
  try {
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
    // sendToastToRenderer('设置已成功保存！', 'success');
    return { success: true };
  } catch (error) {
    console.error(`Error writing settings file ${filePath}:`, error);
    sendToastToRenderer(`保存设置失败: ${error.message || '未知错误'}`, 'error');
    return { success: false, error: error.message || 'Failed to save settings.' };
  }
});

// IPC Handlers for custom window controls
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-restore-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('toggle-dev-tools', () => {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    if (!app.isPackaged) { // Only allow in development
      mainWindow.webContents.toggleDevTools();
    } else {
      sendToastToRenderer('开发者工具在生产环境中不可用', 'warning', 3000);
    }
  }
});
// End IPC Handlers for custom window controls

app.whenReady().then(() => {
  getSettingsFilePath(); // Initialize settings path
  createWindow();

  // Auto-updater logic
  // Configure update provider
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'http://115.190.92.23:8516/updates/', // Replace with your actual update server URL
    // channel: 'latest', // Optional: specify channel if you use channels
  });

  // Check for updates when the app is ready
  // We'll call this explicitly or via IPC later, for now, let's log availability
  log.info('App starting, autoUpdater configured.');

  // Send startup toast after a short delay to allow renderer to initialize
  setTimeout(() => {
    // sendToastToRenderer('应用程序已成功启动！', 'success', 2500);
    // Initial check for updates after a delay, or trigger via UI
    // autoUpdater.checkForUpdatesAndNotify(); // Or just checkForUpdates()
    log.info('Checking for updates after startup delay...');
    autoUpdater.checkForUpdates();
  }, 5000); // Increased delay slightly, and added update check
})

// Auto-updater event listeners
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  sendToastToRenderer('正在检查更新...', 'info', 2000);
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
})

autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  sendToastToRenderer(`发现新版本 ${info.version}！正在准备下载...`, 'info', 5000);
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  }
  // Example: Automatically start download if update is available
  // Or prompt user via dialog before downloading
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '发现新版本',
    message: `发现新版本 ${info.version}。是否现在下载？`,
    buttons: ['是', '否']
  }).then(result => {
    if (result.response === 0) { // '是' button
      log.info('User agreed to download update. Starting download...');
      autoUpdater.downloadUpdate();
    } else {
      log.info('User declined to download update.');
    }
  });
})

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.', info);
  sendToastToRenderer('当前已是最新版本。', 'success', 3000);
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'not-available' });
  }
})

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
  sendToastToRenderer('更新检查失败: ' + (err.message || err), 'error', 5000);
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'error', error: err.message || String(err) });
  }
})

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent.toFixed(2) + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
  // sendToastToRenderer(`正在下载更新: ${progressObj.percent.toFixed(2)}%`, 'info', 1500); // Can be too spammy
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', {
        status: 'downloading',
        progress: {
            percent: progressObj.percent,
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total
        }
    });
  }
})

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded; will install now or on next restart.', info);
  sendToastToRenderer(`新版本 ${info.version} 已下载。重启应用以安装。`, 'success', 10000);
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
  }
  // Prompt user to quit and install
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '更新已就绪',
    message: `新版本 ${info.version} 已下载。是否立即重启并安装？`,
    buttons: ['立即重启', '稍后重启']
  }).then(result => {
    if (result.response === 0) { // '立即重启' button
      log.info('User agreed to quit and install update.');
      autoUpdater.quitAndInstall();
    } else {
      log.info('User chose to install update later.');
    }
  });
});

// IPC handler for renderer to manually check for updates
ipcMain.on('check-for-updates', () => {
  log.info('Renderer requested update check.');
  autoUpdater.checkForUpdates();
});

// IPC handler for renderer to quit and install (if update is downloaded)
ipcMain.on('quit-and-install-update', () => {
  log.info('Renderer requested quit and install.');
  autoUpdater.quitAndInstall(true, true); // isSilent = true, isForceRunAfter = true
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

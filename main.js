const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen } = require('electron') // Added shell and clipboard, screen
const path = require('path')
const fs = require('fs').promises; // For asynchronous file operations
const { PDFDocument } = require('pdf-lib') // PDFDocument will be used by worker, but main might not need it directly for this handler anymore. Keep for now.
const { Worker } = require('worker_threads') // Added Worker

let mainWindow
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
    width: Math.round(screenWidth * 0.5),
    height: Math.round(screenHeight * 0.9), // Changed from 0.8 to 0.9
    show: false, // Don't show the window until it's ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })

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

    worker.on('message', (result) => {
      if (resolved) return;
      resolved = true;
      console.log('[Main Process - process-pdf] Worker finished with result:', result);
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

    worker.on('message', (result) => {
      if (resolved) return;
      resolved = true;
      console.log('[Main Process - generate-shein-label] Worker finished with result:', result);
      resolve(result);
    });

    worker.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      console.error('[Main Process - generate-shein-label] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || 'Shein Label处理工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      if (resolved) return;
      if (code !== 0) {
        console.error(`[Main Process - generate-shein-label] Worker stopped with exit code ${code} without sending a result.`);
        resolve({ success: false, error: `Shein Label处理工作线程意外终止，退出码: ${code}。` });
      } else if (!resolved) { // Exited cleanly but no message
        console.warn('[Main Process - generate-shein-label] Worker exited cleanly (code 0) but did not send a result.');
        resolve({ success: false, error: 'Shein Label处理工作线程已退出但未返回结果。' });
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
      return {};
    }
    // Other error (e.g., corrupted JSON, permissions)
    console.error(`Error reading settings file ${filePath}:`, error);
    return {}; // Return default on other errors as well to prevent app crash
  }
});

// IPC handler for saving settings
ipcMain.handle('save-settings', async (event, settings) => {
  const filePath = getSettingsFilePath();
  try {
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error(`Error writing settings file ${filePath}:`, error);
    return { success: false, error: error.message || 'Failed to save settings.' };
  }
});

app.whenReady().then(() => {
  getSettingsFilePath(); // Initialize settings path
  createWindow();
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

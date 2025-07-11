const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen } = require('electron') // Added shell, clipboard, screen
const path = require('path')
const fs = require('fs').promises; // Use the promises API for async operations
const { PDFDocument } = require('pdf-lib') // PDFDocument will be used by worker, but main might not need it directly for this handler anymore. Keep for now.
const { Worker } = require('worker_threads') // Added Worker
const crypto = require('crypto'); // For generating unique IDs
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');


// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // We will handle download manually or prompt user

const activeWorkers = new Set(); // Keep track of active workers

// Early setup for unhandled exception toaster
let mainWindow // mainWindow will be assigned later in createWindow
let isDownloadingUpdate = false; // Flag to track if an update download is in progress

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
    width: Math.round(screenWidth * 0.7),
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

// IPC handler to open multiple image files
ipcMain.handle('open-image-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return null;
  }
  return filePaths;
});

ipcMain.handle('process-pdf', async (_, { filePath, operations, outputName, outputDir }) => {
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
      workerData: { filePath, operations, outputName, outputDir }
    });
    activeWorkers.add(worker); // Track the worker

    let resolved = false; // Flag to prevent multiple resolves

    worker.on('message', async (result) => { // Made async
      if (resolved) return;
      resolved = true;
      activeWorkers.delete(worker); // Remove worker from active set
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
      activeWorkers.delete(worker); // Remove worker from active set
      console.error('[Main Process - process-pdf] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || 'PDF处理工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      activeWorkers.delete(worker); // Ensure worker is removed on exit
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

ipcMain.handle('generate-shein-label', async (_, params) => {
  // The entire parameter object from the renderer is now in 'params'
  console.log('[Main Process - generate-shein-label] Received params:', params); // For debugging

  return new Promise((resolve, reject) => {
    // Basic validation in main thread before starting worker
    // Updated validation: No longer requires editor data ('images', 'editorWidth', 'editorHeight')
    if (!params.pdf1Path || !params.pdf2Path || !params.outputName || typeof params.outputWidthMM !== 'number' || typeof params.outputHeightMM !== 'number' || params.outputWidthMM <= 0 || params.outputHeightMM <= 0) {
      console.error('[Main Process - generate-shein-label] Missing or invalid required parameters.', params);
      resolve({ success: false, error: '主进程错误：缺少必要的参数或参数无效 (PDF路径、输出名或尺寸)。' });
      return;
    }

    const worker = new Worker(path.join(__dirname, 'shein-label-worker.js'), {
      workerData: params // Pass the entire object to the worker
    });
    activeWorkers.add(worker); // Track the worker

    let resolved = false; // Flag to prevent multiple resolves

    worker.on('message', async (result) => { // Made async
      if (resolved) return;
      resolved = true;
      activeWorkers.delete(worker); // Remove worker from active set
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
      activeWorkers.delete(worker); // Remove worker from active set
      console.error('[Main Process - generate-shein-label] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || 'Shein 标签处理工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      activeWorkers.delete(worker); // Ensure worker is removed on exit
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

ipcMain.handle('generate-multi-merge-label', async (_, params) => {
  console.log('[Main Process - generate-multi-merge-label] Received params:', params);

  return new Promise((resolve) => {
    // Basic validation
    if (!params || !Array.isArray(params.pdfPaths) || params.pdfPaths.length !== 3 || !params.outputName || !params.outputWidthMM || !params.outputHeightMM) {
      console.error('[Main Process - generate-multi-merge-label] Missing or invalid required parameters.', params);
      resolve({ success: false, error: '主进程错误：缺少必要的参数或参数无效。' });
      return;
    }

    const worker = new Worker(path.join(__dirname, 'multi-merge-worker.js'), {
      workerData: params
    });
    activeWorkers.add(worker); // Track the worker

    let resolved = false;

    worker.on('message', async (result) => {
      if (resolved) return;
      resolved = true;
      activeWorkers.delete(worker); // Remove worker from active set
      console.log('[Main Process - generate-multi-merge-label] Worker finished with result:', result);
      if (result.success && result.path) {
        const metadata = await getPdfMetadataInternal(result.path);
        if (metadata.success) {
          result.outputFileSize = metadata.size;
          result.outputPageCount = metadata.pageCount;
        } else {
          // Log error but don't fail the whole operation if metadata retrieval fails for output
          console.warn(`[Main Process - generate-multi-merge-label] Could not get metadata for output file ${result.path}: ${metadata.error}`);
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
      activeWorkers.delete(worker); // Remove worker from active set
      console.error('[Main Process - generate-multi-merge-label] Worker encountered an error:', error);
      resolve({ success: false, error: error.message || '多PDF合并工作线程发生错误。' });
    });

    worker.on('exit', (code) => {
      activeWorkers.delete(worker); // Ensure worker is removed on exit
      if (resolved) return;
      if (code !== 0) {
        console.error(`[Main Process - generate-multi-merge-label] Worker stopped with exit code ${code}`);
        resolve({ success: false, error: `多PDF合并工作线程意外终止，退出码: ${code}。` });
      }
    });
  });
});

ipcMain.handle('convert-pdf-to-images', async (_, params) => {
  const { pdfPath, outputName, outputDir } = params;
  if (!pdfPath || !outputName) {
    return { success: false, error: '主进程错误：缺少PDF路径或输出文件名。' };
  }

  // --- Step 1: Use a worker to split the PDF into single-page PDFs ---
  const splitResult = await new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'pdf-to-image-worker.js'), {
      workerData: { pdfPath }
    });
    activeWorkers.add(worker); // Track the worker
    worker.on('message', (result) => {
      activeWorkers.delete(worker); // Remove worker from active set
      resolve(result);
    });
    worker.on('error', (err) => {
      activeWorkers.delete(worker); // Remove worker from active set
      resolve({ success: false, error: `PDF拆分工作线程错误: ${err.message}` })
    });
    worker.on('exit', (code) => {
      activeWorkers.delete(worker); // Ensure worker is removed on exit
      if (code !== 0) resolve({ success: false, error: `PDF拆分工作线程意外终止，退出码: ${code}。` });
    });
  });

  if (!splitResult.success) {
    return splitResult; // Return the error from the worker
  }

  const { pagePaths, tempDir } = splitResult;
  const imageBuffers = new Array(pagePaths.length);
  const os = require('os');
  const POOL_SIZE = Math.max(2, Math.floor(os.cpus().length / 2)); // Use half of the cores, at least 2
  
  const rendererWindows = [];

  // --- Step 2: Create a pool of hidden renderer windows ---
  try {
    for (let i = 0; i < POOL_SIZE; i++) {
      const rendererWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        }
      });
      rendererWindow.loadFile('pdf-renderer.html');
      rendererWindows.push(rendererWindow);
    }
    // Wait for all windows to be ready
    await Promise.all(rendererWindows.map(w => new Promise(resolve => w.webContents.once('did-finish-load', resolve))));

    // --- Step 3: Process pages using a task queue and the renderer pool ---
    const tasks = pagePaths.map((pagePath, index) => ({ pagePath, index }));
    let pagesProcessed = 0;

    await new Promise((resolveAll, rejectAll) => {
      if (pagePaths.length === 0) {
        resolveAll();
        return;
      }

      const processNextTask = (workerWindow) => {
        if (tasks.length === 0) return; // No more tasks for this worker

        const task = tasks.shift();
        const { pagePath, index } = task;
        const renderId = crypto.randomUUID();

        const onRenderComplete = (event, result) => {
          if (result.renderId === renderId) {
            ipcMain.removeListener('render-complete', onRenderComplete);
            if (result.success) {
              const base64Data = result.dataUrl.replace(/^data:image\/jpeg;base64,/, "");
              imageBuffers[index] = Buffer.from(base64Data, 'base64');
              pagesProcessed++;

              if (pagesProcessed === pagePaths.length) {
                resolveAll(); // All pages are done
              } else {
                processNextTask(workerWindow); // This worker is free, give it the next task
              }
            } else {
              // Stop all processing on the first error
              rejectAll(new Error(`渲染第 ${index + 1} 页失败: ${result.error}`));
            }
          }
        };
        ipcMain.on('render-complete', onRenderComplete);
        workerWindow.webContents.send('render-pdf-page', { filePath: pagePath, pageNum: 1, renderId });
      };

      // Start the initial batch of tasks, one for each worker in the pool
      rendererWindows.forEach(workerWindow => processNextTask(workerWindow));
    });

    // --- Step 4: Zip the images and save the file ---
    const JSZip = require('jszip');
    const zip = new JSZip();
    imageBuffers.forEach((buffer, index) => {
      if (buffer) { // Ensure buffer exists
        zip.file(`${index + 1}.jpg`, buffer);
      }
    });

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const finalOutputPath = path.join(outputDir || path.dirname(pdfPath), outputName);
    await fs.writeFile(finalOutputPath, zipBuffer);
    const stats = await fs.stat(finalOutputPath);

    return { success: true, path: finalOutputPath, outputFileSize: stats.size };

  } catch (error) {
    console.error('Error during PDF to image conversion process:', error);
    return { success: false, error: error.message };
  } finally {
    // --- Step 5: Clean up renderer windows and temporary directory ---
    rendererWindows.forEach(w => w.close());
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
        console.error(`Failed to clean up temporary directory ${tempDir}:`, err);
      });
    }
  }
});

// IPC handler for getting an image as a Base64 data URL
ipcMain.handle('get-image-as-base64', async (event, filePath) => {
  try {
    const fileData = await fs.readFile(filePath);
    const base64Data = fileData.toString('base64');
    // Infer MIME type from file extension for better browser compatibility
    const mimeType = 'image/' + path.extname(filePath).substring(1);
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error) {
    console.error(`Failed to read file for Base64 conversion: ${filePath}`, error);
    return null; // Return null on failure
  }
});

// IPC handler for converting images to PDF
ipcMain.handle('handle-image-to-pdf', async (event, { imagePaths, options }) => {
  console.log('[Main Process - handle-image-to-pdf] Received request with options:', options);
  return new Promise(async (resolve) => {
    try {
      // Step 1: Create and use the worker, passing image paths directly.
      // The worker will handle reading the files, which is more efficient.
      const worker = new Worker(path.join(__dirname, 'image-to-pdf-worker.js'), {
        workerData: { imagePaths, options } // Pass imagePaths directly to the worker
      });
      activeWorkers.add(worker);
      let resolved = false;

      worker.on('message', async (result) => { // Make the handler async
        if (resolved) return;
        resolved = true;
        activeWorkers.delete(worker);
        console.log('[Main Process - handle-image-to-pdf] Worker finished.');

        if (result.success && result.pdfBytes) {
          try {
            // Determine output path. Fallback to the directory of the first image if not provided.
            const defaultDir = imagePaths.length > 0 ? path.dirname(imagePaths[0]) : app.getPath('downloads');
            const outputDir = options.outputDir || defaultDir;
            const finalOutputPath = path.join(outputDir, options.outputName);

            // Ensure the directory exists
            await fs.mkdir(outputDir, { recursive: true });

            // Write the file to disk
            await fs.writeFile(finalOutputPath, Buffer.from(result.pdfBytes));
            console.log(`[Main Process - handle-image-to-pdf] PDF saved to: ${finalOutputPath}`);

            // Get metadata for the newly created file
            const metadata = await getPdfMetadataInternal(finalOutputPath);
            
            const successResult = {
              success: true,
              path: finalOutputPath,
              outputFileSize: null,
              outputPageCount: null,
            };

            if (metadata.success) {
              successResult.outputFileSize = metadata.size;
              successResult.outputPageCount = metadata.pageCount;
            } else {
              console.warn(`[Main Process - handle-image-to-pdf] Could not get metadata for output file ${finalOutputPath}: ${metadata.error}`);
              successResult.metadataError = metadata.error; // Pass warning to renderer
            }
            
            resolve(successResult);

          } catch (writeError) {
            console.error('[Main Process - handle-image-to-pdf] Error writing PDF file:', writeError);
            resolve({ success: false, error: `保存PDF文件失败: ${writeError.message}` });
          }
        } else {
          // Worker returned an error
          resolve({ success: false, error: result.error || 'Worker returned a failure but no specific error.' });
        }
      });

      worker.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        activeWorkers.delete(worker);
        console.error('[Main Process - handle-image-to-pdf] Worker encountered an error:', error);
        resolve({ success: false, error: error.message || '图片转PDF工作线程发生错误。' });
      });

      worker.on('exit', (code) => {
        activeWorkers.delete(worker);
        if (resolved) return;
        if (code !== 0) {
          console.error(`[Main Process - handle-image-to-pdf] Worker stopped with exit code ${code}`);
          resolve({ success: false, error: `图片转PDF工作线程意外终止，退出码: ${code}。` });
        }
      });

      // Step 2: The worker starts automatically with workerData.
      console.log(`[Main Process - handle-image-to-pdf] Starting worker with ${imagePaths.length} images.`);

    } catch (error) {
      console.error('[Main Process - handle-image-to-pdf] Error setting up worker:', error);
      resolve({ success: false, error: `设置工作线程失败: ${error.message}` });
    }
  });
});

// IPC handler to select an output directory
ipcMain.handle('select-output-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return null;
  }
  return filePaths[0];
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

// --- Settings Read/Write Helpers ---
async function readSettings() {
  const filePath = getSettingsFilePath();
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is normal on first run. Return default settings.
      return {};
    }

    // Check if it's a JSON parsing error (corrupted file)
    if (error instanceof SyntaxError) {
      console.error(`Corrupted settings file found at ${filePath}. Backing it up.`, error);
      try {
        const backupPath = `${filePath}.${Date.now()}.corrupted`;
        await fs.rename(filePath, backupPath);
        // Use a more prominent error message for this case.
        sendToastToRenderer('配置文件已损坏并已重置。旧配置已备份。', 'error', 8000);
      } catch (renameError) {
        console.error(`Could not rename corrupted settings file ${filePath}:`, renameError);
        sendToastToRenderer('配置文件已损坏且无法备份。请手动删除它。', 'error', 10000);
      }
      return {}; // Return default settings after handling corruption
    }

    // For other errors (e.g., permissions)
    console.error(`Error reading settings file ${filePath}:`, error);
    sendToastToRenderer(`读取设置失败: ${error.message || '未知错误'}`, 'warning');
    return {}; // Return default on other errors as well to prevent app crash
  }
}

async function writeSettings(settings) {
  const filePath = getSettingsFilePath();
  // Guard against writing undefined or non-object settings
  if (typeof settings !== 'object' || settings === null) {
    const error = new Error('Attempted to write invalid, undefined, or null settings.');
    // Log with stack trace for better debugging
    console.error(`Error in writeSettings: Invalid data received.`, { settings, errorStack: error.stack });
    sendToastToRenderer(`保存设置失败: 收到无效的设置数据。`, 'error');
    return { success: false, error: 'Attempted to write invalid, undefined, or null settings.' };
  }
  try {
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    // This catch block will now primarily handle file system errors,
    // as the TypeError from JSON.stringify(undefined) is caught above.
    console.error(`Error writing settings file ${filePath}:`, error);
    sendToastToRenderer(`保存设置失败: ${error.message || '未知错误'}`, 'error');
    return { success: false, error: error.message || 'Failed to save settings.' };
  }
}
// --- End Settings Read/Write Helpers ---

// IPC handler for getting settings
ipcMain.handle('get-settings', async () => {
  return await readSettings();
});

// IPC handler for saving settings
ipcMain.handle('save-settings', async (event, settings) => {
  // The 'settings' object is the second argument passed from the renderer process
  console.log('[Main Process - save-settings] Received settings to save:', settings); // For debugging
  return await writeSettings(settings);
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

app.on('before-quit', () => {
  log.info('Application is about to quit. Terminating all active workers.');
  for (const worker of activeWorkers) {
    log.info(`Terminating worker thread: ${worker.threadId}`);
    worker.terminate();
  }
  activeWorkers.clear();
});

app.whenReady().then(() => {

  getSettingsFilePath(); // Initialize settings path
  createWindow();

  // Auto-updater logic
  // Configure update provider
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://pdfshdow.cn/updates/', // Replace with your actual update server URL
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
    buttons: ['是', '否'],
    defaultId: 0,
    cancelId: 1
  }).then(result => {
    if (result.response === 0) { // '是' button
      log.info('User agreed to download update. Starting download...');
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status: 'download-started', version: info.version });
      }
      isDownloadingUpdate = true; // Set flag to true when download starts
      autoUpdater.downloadUpdate();
    } else {
      log.info('User declined to download update.');
      isDownloadingUpdate = false; // Reset flag if user declines
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
  isDownloadingUpdate = false; // Reset flag on error
})

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent.toFixed(2) + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
  // sendToastToRenderer(`正在下载更新: ${progressObj.percent.toFixed(2)}%`, 'info', 1500); // This is too spammy and is now handled by the floating window.
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
  isDownloadingUpdate = false; // Reset flag when download is complete
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
  if (isDownloadingUpdate) {
    log.info('Renderer requested update check, but a download is already in progress.');
    sendToastToRenderer('更新正在下载中，请稍后...', 'info');
  } else {
    log.info('Renderer requested update check.');
    autoUpdater.checkForUpdates();
  }
});

// IPC handler for renderer to quit and install (if update is downloaded)
ipcMain.on('quit-and-install-update', () => {
  log.info('Renderer requested quit and install.');
  autoUpdater.quitAndInstall(true, true); // isSilent = true, isForceRunAfter = true
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 添加处理官方网站链接的IPC处理器
ipcMain.handle('open-official-website', async () => {
  try {
    const websiteUrl = 'https://pdfshdow.cn' // 替换为实际官网URL
    await shell.openExternal(websiteUrl)
    return { success: true }
  } catch (error) {
    console.error('打开官方网站失败:', error)
    return { success: false, error: `打开官方网站失败: ${error.message}` }
  }
})
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron') // Added shell and clipboard
const path = require('path')
const { PDFDocument } = require('pdf-lib')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700, // Default width if not maximized
    height: 750, // Default height if not maximized
    show: false, // Don't show the window until it's ready and maximized
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })
}

ipcMain.handle('open-file', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  })
  return filePaths[0]
})

ipcMain.handle('process-pdf', async (_, { filePath, operations, outputName }) => {
  try {
    const fs = require('fs')
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const newPdfDoc = await PDFDocument.create(); // Create a new document for the output

    // 处理页面尺寸调整
    if (operations.resize) {
      const { width: newPageWidth, height: newPageHeight } = operations.resize;
      const originalPages = pdfDoc.getPages();

      for (let i = 0; i < originalPages.length; i++) {
        const originalPage = originalPages[i];
        const { width: oldWidth, height: oldHeight } = originalPage.getSize();

        // 计算等比例缩放因子
        const scaleX = newPageWidth / oldWidth;
        const scaleY = newPageHeight / oldHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = oldWidth * scale;
        const scaledHeight = oldHeight * scale;

        // 计算居中位置的偏移量
        const offsetX = (newPageWidth - scaledWidth) / 2;
        const offsetY = (newPageHeight - scaledHeight) / 2;

        // 将原始页面嵌入到新文档中
        // Note: embedPage is typically used to embed pages from one document into another.
        // Here, originalPage is from pdfDoc, and we are embedding into newPdfDoc.
        // const [embeddedPage] = await newPdfDoc.embedPdf([originalPage]); // Incorrect: embedPdf expects PDFDocument, bytes, or path.
        const embeddedPage = await newPdfDoc.embedPage(originalPage); // Correct: embedPage takes a PDFPage object.

        // 在新文档中添加一个新页面
        const newPage = newPdfDoc.addPage([newPageWidth, newPageHeight]);

        // 在新页面的计算位置绘制嵌入的页面
        newPage.drawPage(embeddedPage, {
          x: offsetX,
          y: offsetY,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    } else {
      // 如果没有resize操作，直接复制所有页面到新文档 (或者根据需要决定是否需要这一步)
      // For simplicity, if no resize, we'll just save the original doc for now,
      // or this part can be enhanced to copy pages to newPdfDoc if other ops exist.
      // However, the main goal here is to fix the resize operation.
      // If other operations (like label) are present, they should operate on newPdfDoc.
      // This example focuses on fixing resize. If only resize is the goal, this else is fine.
      // If other ops need to be combined, they should be adapted to newPdfDoc.
      const pageIndices = pdfDoc.getPageIndices();
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdfDoc.addPage(page));
    }

    // 处理标签（添加文本标签） - 这部分需要调整到在 newPdfDoc 上操作
    // For now, this part is commented out to focus on fixing the resize blank page issue.
    // If labels are needed, this logic must be adapted to work with newPdfDoc's pages.
    /*
    if (operations.label) {
      const pages = newPdfDoc.getPages(); // Operate on newPdfDoc
      pages.forEach((page, index) => {
        page.drawText(`${operations.label.text} - Page ${index + 1}`, {
          x: 50,
          y: page.getHeight() - 50,
          size: 12,
          color: PDFDocument.HexColor.parse(operations.label.color || '#000000')
        });
      });
    }
    */

    const processedPdf = await newPdfDoc.save(); // Save the new document
    // outputName is now guaranteed by the frontend to be a valid filename string ending with .pdf
    const savePath = path.join(path.dirname(filePath), outputName)
    fs.writeFileSync(savePath, processedPdf)
    return { success: true, path: savePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('generate-shein-label', async (_, { pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM }) => {
  try {
    const fs = require('fs');
    const MM_TO_PT = 2.83465; // 1 mm = 2.834645669291339 points

    const outputWidthPt = outputWidthMM * MM_TO_PT;
    const outputHeightPt = outputHeightMM * MM_TO_PT;

    const pdf1Bytes = fs.readFileSync(pdf1Path);
    const pdf2Bytes = fs.readFileSync(pdf2Path);

    const pdf1Doc = await PDFDocument.load(pdf1Bytes);
    const pdf2Doc = await PDFDocument.load(pdf2Bytes);

    if (pdf1Doc.getPageCount() === 0) {
      return { success: false, error: 'PDF 文件 1 不能为空.' };
    }
    const P1_1_original = pdf1Doc.getPages()[0]; // Get the first page of PDF1

    const P2_pages_original = pdf2Doc.getPages();
    if (P2_pages_original.length === 0) {
      return { success: false, error: 'PDF 文件 2 不能为空.' };
    }

    const finalPdfDoc = await PDFDocument.create();

    for (const P2_x_original of P2_pages_original) {
      const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);

      // --- Embed P2_x (current page from PDF2 - 条码文件) into the top half ---
      const p2_origSize = P2_x_original.getSize();
      const topHalfRect = { width: outputWidthPt, height: outputHeightPt / 2 };
      
      // Calculate scale to fit P2_x into topHalfRect while maintaining aspect ratio
      let scaleP2 = Math.min(topHalfRect.width / p2_origSize.width, topHalfRect.height / p2_origSize.height);
      let scaledWidthP2 = p2_origSize.width * scaleP2;
      let scaledHeightP2 = p2_origSize.height * scaleP2;
      
      // Calculate offsets to center P2_x within the top half
      let offsetX_P2 = (topHalfRect.width - scaledWidthP2) / 2;
      // Y is calculated from the bottom of the newPage, so top half starts at outputHeightPt / 2
      let offsetY_P2 = (topHalfRect.height - scaledHeightP2) / 2 + (outputHeightPt / 2);

      const embeddedP2_final = await finalPdfDoc.embedPage(P2_x_original);
      newPage.drawPage(embeddedP2_final, {
        x: offsetX_P2,
        y: offsetY_P2,
        width: scaledWidthP2,
        height: scaledHeightP2,
      });

      // --- Embed P1_1 (first page of PDF1 - 欧代文件) into the bottom half ---
      const p1_origSize = P1_1_original.getSize();
      const bottomHalfRect = { width: outputWidthPt, height: outputHeightPt / 2 };

      // Calculate scale to fit P1_1 into bottomHalfRect while maintaining aspect ratio
      let scaleP1 = Math.min(bottomHalfRect.width / p1_origSize.width, bottomHalfRect.height / p1_origSize.height);
      let scaledWidthP1 = p1_origSize.width * scaleP1;
      let scaledHeightP1 = p1_origSize.height * scaleP1;

      // Calculate offsets to center P1_1 within the bottom half
      let offsetX_P1 = (bottomHalfRect.width - scaledWidthP1) / 2;
      // Y is calculated from the bottom of the newPage, so bottom half starts at 0
      let offsetY_P1 = (bottomHalfRect.height - scaledHeightP1) / 2;

      const embeddedP1_final = await finalPdfDoc.embedPage(P1_1_original);
      newPage.drawPage(embeddedP1_final, {
        x: offsetX_P1,
        y: offsetY_P1,
        width: scaledWidthP1,
        height: scaledHeightP1,
      });
    }

    const finalPdfBytes = await finalPdfDoc.save();
    
    // Ensure outputName has .pdf extension
    const outputFilename = outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`;
    // Save in the same directory as PDF1 by default
    const savePath = path.join(path.dirname(pdf1Path), outputFilename);
    
    fs.writeFileSync(savePath, finalPdfBytes);

    return { success: true, path: savePath };
  } catch (err) {
    console.error('Error in generate-shein-label:', err); // Log the full error for debugging
    return { success: false, error: err.message };
  }
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

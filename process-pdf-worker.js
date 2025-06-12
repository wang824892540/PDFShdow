// process-pdf-worker.js
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Helper function to read a stream into a Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function performPdfProcessing({ filePath, operations, outputName }) {
  try {
    // --- This core logic is almost identical to the original process-pdf in main.js ---
    if (!filePath || !operations || !outputName) {
      // Basic validation for required parameters
      throw new Error('Missing required parameters (filePath, operations, or outputName) in worker.');
    }

    const readStream = fs.createReadStream(filePath);
    const pdfBytes = await streamToBuffer(readStream);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const newPdfDoc = await PDFDocument.create();

    if (operations.resize) {
      const { width: newPageWidth, height: newPageHeight } = operations.resize;
      if (typeof newPageWidth !== 'number' || typeof newPageHeight !== 'number' || newPageWidth <= 0 || newPageHeight <= 0) {
        throw new Error('Invalid resize dimensions provided in worker.');
      }
      const originalPages = pdfDoc.getPages();

      for (let i = 0; i < originalPages.length; i++) {
        const originalPage = originalPages[i];
        const { width: oldWidth, height: oldHeight } = originalPage.getSize();
        const scaleX = newPageWidth / oldWidth;
        const scaleY = newPageHeight / oldHeight;
        const scale = Math.min(scaleX, scaleY);
        const scaledWidth = oldWidth * scale;
        const scaledHeight = oldHeight * scale;
        const offsetX = (newPageWidth - scaledWidth) / 2;
        const offsetY = (newPageHeight - scaledHeight) / 2;
        const embeddedPage = await newPdfDoc.embedPage(originalPage);
        const newPage = newPdfDoc.addPage([newPageWidth, newPageHeight]);
        newPage.drawPage(embeddedPage, {
          x: offsetX,
          y: offsetY,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    } else {
      // If no resize operation, copy all pages
      // This logic might need review if other operations are to be combined
      // and should also operate on newPdfDoc. For now, it's a direct copy.
      const pageIndices = pdfDoc.getPageIndices();
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdfDoc.addPage(page));
    }

    // Note: The operations.label part is omitted here for now,
    // focusing on refactoring the resize functionality to the worker.
    // If labels are needed, they should operate on newPdfDoc here.

    const processedPdfBytes = await newPdfDoc.save();
    // outputName is expected to be a valid .pdf filename string from the frontend
    const savePath = path.join(path.dirname(filePath), outputName);
    
    // fs.writeFileSync(savePath, processedPdfBytes); // Replaced with stream
    const writeStream = fs.createWriteStream(savePath);
    writeStream.write(processedPdfBytes);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    return { success: true, path: savePath };
    // --- Core logic ends ---
  } catch (err) {
    // Ensure errors are caught within the worker and returned
    console.error('Error in PDF processing worker:', err.toString()); // Log error in worker too
    return { success: false, error: err.message || 'An unknown error occurred in the PDF worker.' };
  }
}

// Execute processing and send result back to the main thread
performPdfProcessing(workerData)
  .then(result => {
    parentPort.postMessage(result);
  })
  .catch(err => { // Fallback catch, though performPdfProcessing should handle its errors
    console.error('Unhandled promise rejection in PDF worker:', err.toString());
    parentPort.postMessage({ success: false, error: err.message || 'Unknown unhandled error in worker' });
  });
// multi-merge-worker.js
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function performMultiMergeGeneration({ pdfPaths, outputName, outputWidthMM, outputHeightMM, outputDir, images, editorWidth, editorHeight }) {
  try {
    if (!pdfPaths || pdfPaths.length !== 3 || !outputName || !outputWidthMM || !outputHeightMM || !images || !editorWidth || !editorHeight) {
      throw new Error('Missing required parameters in multi-merge worker.');
    }

    const MM_TO_PT = 2.83465;
    const outputWidthPt = outputWidthMM * MM_TO_PT;
    const outputHeightPt = outputHeightMM * MM_TO_PT;

    const scaleX = outputWidthPt / editorWidth;
    const scaleY = outputHeightPt / editorHeight;

    const finalPdfDoc = await PDFDocument.create();
    const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);

    for (let i = 0; i < pdfPaths.length; i++) {
      const pdfPath = pdfPaths[i];
      const imageData = images.find(img => img.path === pdfPath);

      if (!imageData) {
        console.warn(`No image data found for PDF: ${pdfPath}`);
        continue;
      }

      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      if (pdfDoc.getPageCount() === 0) {
        console.warn(`PDF file is empty: ${pdfPath}`);
        continue;
      }

      const [firstPage] = await finalPdfDoc.embedPdf(pdfDoc, [0]);

      newPage.drawPage(firstPage, {
        x: imageData.x * scaleX,
        y: outputHeightPt - (imageData.y * scaleY) - (imageData.height * scaleY), // Invert Y
        width: imageData.width * scaleX,
        height: imageData.height * scaleY,
      });
    }

    const finalPdfBytes = await finalPdfDoc.save();
    
    const outputFilename = outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`;
    const baseDir = outputDir || path.dirname(pdfPaths[0]);
    const savePath = path.join(baseDir, outputFilename);
    
    fs.writeFileSync(savePath, finalPdfBytes);
    
    return { success: true, path: savePath };
  } catch (err) {
    console.error('Error in multi-merge processing worker:', err.toString());
    return { success: false, error: err.message || 'An unknown error occurred in the multi-merge worker.' };
  }
}

performMultiMergeGeneration(workerData)
  .then(result => {
    parentPort.postMessage(result);
  })
  .catch(err => {
    console.error('Unhandled promise rejection in multi-merge worker:', err.toString());
    parentPort.postMessage({ success: false, error: err.message || 'Unknown unhandled error in multi-merge worker' });
  });
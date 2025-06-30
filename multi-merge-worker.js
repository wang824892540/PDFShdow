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

    // Load all PDF documents
    const [ecRepPath, ecoLabelPath, barcodePath] = pdfPaths; // [0]欧代, [1]环保, [2]条码
    const ecRepDoc = await PDFDocument.load(fs.readFileSync(ecRepPath));
    const ecoLabelDoc = await PDFDocument.load(fs.readFileSync(ecoLabelPath));
    const barcodeDoc = await PDFDocument.load(fs.readFileSync(barcodePath));

    const barcodePageCount = barcodeDoc.getPageCount();
    if (barcodePageCount === 0) {
      throw new Error('Barcode PDF cannot be empty.');
    }

    const finalPdfDoc = await PDFDocument.create();

    // Embed the static pages (EC Rep and Eco Label) once.
    const [embeddedEcRepPage] = await finalPdfDoc.embedPdf(ecRepDoc, [0]);
    const [embeddedEcoLabelPage] = await finalPdfDoc.embedPdf(ecoLabelDoc, [0]);

    // Find the layout data for each element from the 'images' array using their static IDs
    const ecRepImageData = images.find(img => img.id === 'multi-merge-pdf-1');
    const ecoLabelImageData = images.find(img => img.id === 'multi-merge-pdf-2');
    const barcodeImageData = images.find(img => img.id === 'multi-merge-pdf-3');

    if (!ecRepImageData || !ecoLabelImageData || !barcodeImageData) {
      throw new Error('Could not find layout data for all required PDF elements.');
    }

    // Loop through each page of the barcode PDF
    for (let i = 0; i < barcodePageCount; i++) {
      const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);
      
      // Embed the current barcode page
      const [embeddedBarcodePage] = await finalPdfDoc.embedPdf(barcodeDoc, [i]);

      // Draw EC Rep (static)
      newPage.drawPage(embeddedEcRepPage, {
        x: ecRepImageData.x * scaleX,
        y: outputHeightPt - (ecRepImageData.y * scaleY) - (ecRepImageData.height * scaleY),
        width: ecRepImageData.width * scaleX,
        height: ecRepImageData.height * scaleY,
      });

      // Draw Eco Label (static)
      newPage.drawPage(embeddedEcoLabelPage, {
        x: ecoLabelImageData.x * scaleX,
        y: outputHeightPt - (ecoLabelImageData.y * scaleY) - (ecoLabelImageData.height * scaleY),
        width: ecoLabelImageData.width * scaleX,
        height: ecoLabelImageData.height * scaleY,
      });

      // Draw Barcode (current page)
      newPage.drawPage(embeddedBarcodePage, {
        x: barcodeImageData.x * scaleX,
        y: outputHeightPt - (barcodeImageData.y * scaleY) - (barcodeImageData.height * scaleY),
        width: barcodeImageData.width * scaleX,
        height: barcodeImageData.height * scaleY,
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
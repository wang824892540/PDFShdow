// shein-label-worker.js
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { log } = require('console');

// Helper function to read a stream into a Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function performSheinLabelGeneration({ pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM, outputDir }) {
  try {
    // pdf1 is EC Rep (bottom), pdf2 is Barcode (top)
    if (!pdf1Path || !pdf2Path || !outputName || !outputWidthMM || !outputHeightMM) {
      throw new Error('工作线程缺少必要的参数。');
    }

    const MM_TO_PT = 2.83465;
    const outputWidthPt = outputWidthMM * MM_TO_PT;
    const outputHeightPt = outputHeightMM * MM_TO_PT;

    const ecRepBytes = fs.readFileSync(pdf1Path);
    const barcodeBytes = fs.readFileSync(pdf2Path);
    
    const ecRepDoc = await PDFDocument.load(ecRepBytes);
    const barcodeDoc = await PDFDocument.load(barcodeBytes);

    if (ecRepDoc.getPageCount() === 0) {
      return { success: false, error: '欧代文件 (PDF 1) 不能为空.' };
    }
    if (barcodeDoc.getPageCount() === 0) {
      return { success: false, error: '条码文件 (PDF 2) 不能为空.' };
    }

    const ecRepPageOriginal = ecRepDoc.getPages()[0];
    const barcodePagesOriginal = barcodeDoc.getPages();

    const finalPdfDoc = await PDFDocument.create();

    // Embed the EC Rep page once, as it's the same on all final pages.
    const embeddedEcRepPage = await finalPdfDoc.embedPage(ecRepPageOriginal);
    const { width: ecRepWidth, height: ecRepHeight } = ecRepPageOriginal.getSize();
    const scaledEcRepHeight = ecRepHeight * (outputWidthPt / ecRepWidth);

    const GAP_PT = 5; // A small gap between the two PDFs

    for (let i = 0; i < barcodePagesOriginal.length; i++) {
       const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);
       const barcodePageOriginal = barcodePagesOriginal[i];

       // Embed the current barcode page
       const embeddedBarcodePage = await finalPdfDoc.embedPage(barcodePageOriginal);
       const { width: barcodeWidth, height: barcodeHeight } = barcodePageOriginal.getSize();
       
       // Scale barcode to fit the page width
       const scaledBarcodeHeight = barcodeHeight * (outputWidthPt / barcodeWidth);
       
       // Calculate total content height and starting Y for vertical centering
       const totalContentHeight = scaledBarcodeHeight + GAP_PT + scaledEcRepHeight;
       const startY = (outputHeightPt - totalContentHeight) / 2;

       // Draw EC Rep (Bottom element of the centered block)
       newPage.drawPage(embeddedEcRepPage, {
           x: 0,
           y: startY,
           width: outputWidthPt,
           height: scaledEcRepHeight,
       });

       // Draw Barcode (Top element of the centered block)
       newPage.drawPage(embeddedBarcodePage, {
           x: 0,
           y: startY + scaledEcRepHeight + GAP_PT,
           width: outputWidthPt,
           height: scaledBarcodeHeight,
       });
    }

    const finalPdfBytes = await finalPdfDoc.save();
    
    const outputFilename = outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`;
    const baseDir = outputDir || path.dirname(pdf1Path);
    const savePath = path.join(baseDir, outputFilename);
    
    const writeStream = fs.createWriteStream(savePath);
    writeStream.write(finalPdfBytes);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    return { success: true, path: savePath };
  } catch (err) {
    console.error('Error in Shein 标签 processing worker:', err.toString());
    return { success: false, error: err.message || 'An unknown error occurred in the Shein 标签 worker.' };
  }
}

performSheinLabelGeneration(workerData)
  .then(result => {
    parentPort.postMessage(result);
  })
  .catch(err => {
    console.error('Unhandled promise rejection in Shein 标签 worker:', err.toString());
    parentPort.postMessage({ success: false, error: err.message || 'Unknown unhandled error in Shein 标签 worker' });
  });

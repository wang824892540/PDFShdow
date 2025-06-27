// pdf-to-image-worker.js
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { PDFDocument } = require('pdf-lib');

async function splitPdf() {
  const { pdfPath } = workerData;
  try {
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const numPages = pdfDoc.getPageCount();
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-split-'));
    const pagePaths = [];

    for (let i = 0; i < numPages; i++) {
      const newDoc = await PDFDocument.create();
      const [copiedPage] = await newDoc.copyPages(pdfDoc, [i]);
      newDoc.addPage(copiedPage);
      
      const pdfBytes = await newDoc.save();
      const pagePath = path.join(tempDir, `page-${i + 1}.pdf`);
      await fs.writeFile(pagePath, pdfBytes);
      pagePaths.push(pagePath);
    }

    parentPort.postMessage({ success: true, pagePaths, tempDir });
  } catch (error) {
    console.error('Error in PDF split worker:', error);
    parentPort.postMessage({ success: false, error: error.message || 'An unknown error occurred.' });
  }
}

splitPdf();
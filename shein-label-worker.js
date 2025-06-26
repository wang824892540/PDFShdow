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

async function performSheinLabelGeneration({ pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM, outputDir, images, editorWidth, editorHeight }) {
  try {
    if (!pdf1Path || !pdf2Path || !outputName || !outputWidthMM || !outputHeightMM || !images || !editorWidth || !editorHeight) {
      throw new Error('Missing required parameters in Shein 标签 worker.');
    }

    const MM_TO_PT = 2.83465;
    const outputWidthPt = outputWidthMM * MM_TO_PT;
    const outputHeightPt = outputHeightMM * MM_TO_PT;

    const scaleX = outputWidthPt / editorWidth;
    const scaleY = outputHeightPt / editorHeight;

    const pdf1Bytes = fs.readFileSync(pdf1Path);
    const pdf1Doc = await PDFDocument.load(pdf1Bytes);
    const pdf2Bytes = fs.readFileSync(pdf2Path);
    const pdf2Doc = await PDFDocument.load(pdf2Bytes);

    if (pdf1Doc.getPageCount() === 0) {
      return { success: false, error: 'PDF 文件 1 不能为空.' };
    }
    const P1_1_original = pdf1Doc.getPages()[0];
    const embeddedP1 = await PDFDocument.create();
    const [p1Page] = await embeddedP1.copyPages(pdf1Doc, [0]);
    
    const P2_pages_original = pdf2Doc.getPages();
    if (P2_pages_original.length === 0) {
      return { success: false, error: 'PDF 文件 2 不能为空.' };
    }

    const finalPdfDoc = await PDFDocument.create();

    const image1Data = images.find(img => img.id === 'shein-pdf-1');
    const image2Data = images.find(img => img.id === 'shein-pdf-2');

    if (!image1Data || !image2Data) {
       throw new Error('Image data is missing from the worker payload.');
    }

    for (let i = 0; i < P2_pages_original.length; i++) {
       const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);
       
       // Embed the first page of PDF1 (EC Rep)
       const embeddedP1_final = await finalPdfDoc.embedPage(P1_1_original);
       newPage.drawPage(embeddedP1_final, {
           x: image1Data.x * scaleX,
           y: outputHeightPt - (image1Data.y * scaleY) - (image1Data.height * scaleY), // Invert Y and adjust for height
           width: image1Data.width * scaleX,
           height: image1Data.height * scaleY,
       });

       // Embed the current page of PDF2 (Barcode)
       const P2_x_original = P2_pages_original[i];
       const embeddedP2_final = await finalPdfDoc.embedPage(P2_x_original);
       newPage.drawPage(embeddedP2_final, {
           x: image2Data.x * scaleX,
           y: outputHeightPt - (image2Data.y * scaleY) - (image2Data.height * scaleY), // Invert Y and adjust for height
           width: image2Data.width * scaleX,
           height: image2Data.height * scaleY,
       });
    }

    const finalPdfBytes = await finalPdfDoc.save();
    
    const outputFilename = outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`;
    const baseDir = outputDir || path.dirname(pdf1Path);
    const savePath = path.join(baseDir, outputFilename); // Save in the outputDir or the same directory as PDF1
    
    // fs.writeFileSync(savePath, finalPdfBytes); // Replaced with stream
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

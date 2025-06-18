// shein-label-worker.js
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

async function performSheinLabelGeneration({ pdf1Path, pdf2Path, outputName, outputWidthMM, outputHeightMM, outputDir }) {
  try {
    if (!pdf1Path || !pdf2Path || !outputName || !outputWidthMM || !outputHeightMM) {
      throw new Error('Missing required parameters in Shein 标签 worker.');
    }

    const MM_TO_PT = 2.83465; // 1 mm = 2.834645669291339 points
    const outputWidthPt = outputWidthMM * MM_TO_PT;
    const outputHeightPt = outputHeightMM * MM_TO_PT;

    const readStream1 = fs.createReadStream(pdf1Path);
    const pdf1Bytes = await streamToBuffer(readStream1);
    const pdf1Doc = await PDFDocument.load(pdf1Bytes);

    const readStream2 = fs.createReadStream(pdf2Path);
    const pdf2Bytes = await streamToBuffer(readStream2);
    const pdf2Doc = await PDFDocument.load(pdf2Bytes);

    if (pdf1Doc.getPageCount() === 0) {
      return { success: false, error: 'PDF 文件 1 不能为空.' };
    }
    const P1_1_original = pdf1Doc.getPages()[0];

    const P2_pages_original = pdf2Doc.getPages();
    if (P2_pages_original.length === 0) {
      return { success: false, error: 'PDF 文件 2 不能为空.' };
    }

    const finalPdfDoc = await PDFDocument.create();

    for (const P2_x_original of P2_pages_original) {
      const newPage = finalPdfDoc.addPage([outputWidthPt, outputHeightPt]);

      const p2_origSize = P2_x_original.getSize();
      const topHalfRect = { width: outputWidthPt, height: outputHeightPt / 2 };
      
      let scaleP2 = Math.min(topHalfRect.width / p2_origSize.width, topHalfRect.height / p2_origSize.height);
      let scaledWidthP2 = p2_origSize.width * scaleP2;
      let scaledHeightP2 = p2_origSize.height * scaleP2;
      
      let offsetX_P2 = (topHalfRect.width - scaledWidthP2) / 2;
      let offsetY_P2 = (topHalfRect.height - scaledHeightP2) / 2 + (outputHeightPt / 2);

      const embeddedP2_final = await finalPdfDoc.embedPage(P2_x_original);
      newPage.drawPage(embeddedP2_final, {
        x: offsetX_P2,
        y: offsetY_P2,
        width: scaledWidthP2,
        height: scaledHeightP2,
      });

      const p1_origSize = P1_1_original.getSize();
      const bottomHalfRect = { width: outputWidthPt, height: outputHeightPt / 2 };

      let scaleP1 = Math.min(bottomHalfRect.width / p1_origSize.width, bottomHalfRect.height / p1_origSize.height);
      let scaledWidthP1 = p1_origSize.width * scaleP1;
      let scaledHeightP1 = p1_origSize.height * scaleP1;

      let offsetX_P1 = (bottomHalfRect.width - scaledWidthP1) / 2;
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
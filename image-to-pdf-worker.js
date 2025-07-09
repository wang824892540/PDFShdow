const { parentPort, workerData } = require('worker_threads');
const { PDFDocument, PageSizes } = require('pdf-lib');
const fs = require('fs').promises;
const sharp = require('sharp');

// The main function that runs the PDF generation
async function generatePdf() {
  // Get image paths and options from workerData
  const { imagePaths, options } = workerData;

  if (!imagePaths || !options) {
    throw new Error('Worker did not receive imagePaths or options.');
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const jpegQuality = Math.round(options.quality * 100);

    for (const imagePath of imagePaths) {
      // Use sharp to read, compress, and get a buffer
      const compressedImageBuffer = await sharp(imagePath)
        .jpeg({ quality: jpegQuality })
        .toBuffer();
      
      // Embed the compressed JPEG buffer
      const image = await pdfDoc.embedJpg(compressedImageBuffer);

      let pageSize;
      if (options.pageSize === 'Shein') {
        // Shein size: 70mm x 60mm. 1mm = 2.83465 points
        const widthInPoints = 70 * 2.83465;
        const heightInPoints = 60 * 2.83465;
        pageSize = [widthInPoints, heightInPoints];
      } else if (options.pageSize === 'custom' && options.customWidth > 0 && options.customHeight > 0) {
        // Convert mm to points (1mm = 2.83465 points)
        const widthInPoints = options.customWidth * 2.83465;
        const heightInPoints = options.customHeight * 2.83465;
        pageSize = [widthInPoints, heightInPoints];
      } else {
        pageSize = PageSizes[options.pageSize] || PageSizes.A4;
      }

      if (options.orientation === 'landscape') {
        pageSize = [pageSize[1], pageSize[0]];
      }

      const page = pdfDoc.addPage(pageSize);
      const { width: pageW, height: pageH } = page.getSize();

      let drawWidth, drawHeight, drawX, drawY;

      if (options.scaleMode === 'stretch') {
        drawWidth = pageW;
        drawHeight = pageH;
        drawX = 0;
        drawY = 0;
      } else { // 'aspectFit'
        const pageAspectRatio = pageW / pageH;
        const imageAspectRatio = image.width / image.height;

        if (imageAspectRatio > pageAspectRatio) {
          drawWidth = pageW;
          drawHeight = pageW / imageAspectRatio;
        } else {
          drawHeight = pageH;
          drawWidth = pageH * imageAspectRatio;
        }
        drawX = (pageW - drawWidth) / 2;
        drawY = (pageH - drawHeight) / 2;
      }

      page.drawImage(image, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();
    // Post the result back to the main thread.
    // The second argument is a list of transferable objects.
    // Transferring the ArrayBuffer avoids a copy.
    parentPort.postMessage({ success: true, pdfBytes: pdfBytes.buffer }, [pdfBytes.buffer]);
  } catch (error) {
    // If an error occurs, post an error message back.
    console.error('Error in image-to-pdf-worker:', error);
    parentPort.postMessage({ success: false, error: error.message });
  }
}

// Run the generation
generatePdf();
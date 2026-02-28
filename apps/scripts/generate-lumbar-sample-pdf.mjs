#!/usr/bin/env node

/**
 * Generate a PDF from the canonical lumbar spine note text.
 * 
 * Usage: node scripts/generate-lumbar-sample-pdf.mjs
 * 
 * Requires: npm install --save-dev pdf-lib
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const inputFile = join(repoRoot, 'sample-data', 'lumbar-spine-note.txt');
const outputFile = join(repoRoot, 'sample-data', 'lumbar-spine-note.pdf');

try {
  // Read the canonical note
  const noteText = readFileSync(inputFile, 'utf-8');
  
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const { width, height } = page.getSize();
  
  // Load fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Title
  page.drawText('Progress Note', {
    x: 50,
    y: height - 50,
    size: 18,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  
  // Draw the note content
  const lines = noteText.split('\n');
  let yPosition = height - 80;
  const fontSize = 10;
  const lineHeight = 14;
  const margin = 50;
  const maxWidth = width - (margin * 2);
  
  for (const line of lines) {
    if (yPosition < 50) {
      // Add a new page if needed
      const newPage = pdfDoc.addPage([612, 792]);
      yPosition = height - 50;
    }
    
    // Handle empty lines
    if (line.trim() === '') {
      yPosition -= lineHeight;
      continue;
    }
    
    // Check if line is a header (starts with specific patterns)
    const isHeader = /^(Patient:|Date of Service:|Chief Complaint:|History:|Physical Examination:|Imaging:|Assessment:|Plan:|Attending:|Facility:|NPI:)/.test(line);
    const isDiagnosis = /^-\s*[A-Z]\d+\.\d+/.test(line);
    
    const font = isHeader || isDiagnosis ? helveticaBoldFont : helveticaFont;
    const size = isHeader ? 11 : fontSize;
    
    // Word wrap for long lines
    const words = line.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const textWidth = font.widthOfTextAtSize(testLine, size);
      
      if (textWidth > maxWidth && currentLine) {
        // Draw current line and start new one
        page.drawText(currentLine, {
          x: margin,
          y: yPosition,
          size: size,
          font: font,
          color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    // Draw the remaining line
    if (currentLine) {
      page.drawText(currentLine, {
        x: margin,
        y: yPosition,
        size: size,
        font: font,
        color: rgb(0, 0, 0),
      });
      yPosition -= lineHeight;
    }
  }
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  writeFileSync(outputFile, pdfBytes);
  
  console.log(`✓ PDF generated successfully: ${outputFile}`);
} catch (error) {
  console.error('Error generating PDF:', error.message);
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('\nPlease install pdf-lib first:');
    console.error('  npm install --save-dev pdf-lib');
  }
  process.exit(1);
}

// Unit tests for functions/acceptance-letter-service.js
// Tests the acceptance letter PDF generation with the official FEWA template.
// Runs standalone with node; requires no active Firestore, Cloud Storage, or SMTP network calls.

const assert = require('assert');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const {
    generateAcceptanceLetterPdf,
    formatLetterDate,
    TEMPLATE_PATH
} = require('../acceptance-letter-service');

async function main() {
    console.log('[1] Template PDF exists and is readable');
    assert.ok(fs.existsSync(TEMPLATE_PATH), `Template file does not exist at ${TEMPLATE_PATH}`);
    const templateStats = fs.statSync(TEMPLATE_PATH);
    assert.ok(templateStats.size > 200000, `Template file unexpectedly small: ${templateStats.size} bytes`);
    console.log(`  PASS: template exists (${templateStats.size} bytes)`);

    console.log('\n[2] formatLetterDate returns expected British English date format');
    const fixedDate = new Date('2026-10-23T12:00:00Z');
    const formatted = formatLetterDate(fixedDate);
    assert.strictEqual(formatted, '23 October 2026');
    const defaultFormatted = formatLetterDate();
    assert.match(defaultFormatted, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    console.log(`  PASS: formatLetterDate returns "${formatted}"`);

    console.log('\n[3] Standard acceptance letter generation with full fields');
    const standardData = {
        studentName: 'Amina Wangari Kamau',
        dearName: 'Amina',
        admissionNumber: '2026/042',
        course: 'Diploma in Cosmetology',
        level: 'Diploma Level 6',
        dateText: '23 October 2026'
    };
    const pdfBytes = await generateAcceptanceLetterPdf(standardData);
    assert.ok(pdfBytes instanceof Uint8Array, 'Expected output to be a Uint8Array');
    assert.ok(pdfBytes.length > 200000, `Generated PDF size unexpectedly small: ${pdfBytes.length} bytes`);

    // Verify PDF structure and pages
    const loadedDoc = await PDFDocument.load(pdfBytes);
    const pages = loadedDoc.getPages();
    assert.strictEqual(pages.length, 1, 'Acceptance letter must be exactly 1 page');
    const { width, height } = pages[0].getSize();
    assert.strictEqual(Math.round(width), 595, `Expected A4 width 595, got ${width}`);
    assert.strictEqual(Math.round(height), 842, `Expected A4 height 842, got ${height}`);
    console.log(`  PASS: generated valid 1-page PDF (${pdfBytes.length} bytes, ${Math.round(width)}x${Math.round(height)}pt)`);

    console.log('\n[4] Acceptance letter generation without optional level (Short Course) and default dateText');
    const shortCourseData = {
        studentName: 'Brian Kiprop',
        dearName: 'Brian',
        admissionNumber: '2026/043',
        course: 'Short Course in Nail Art & Technology',
        level: undefined,
        dateText: undefined
    };
    const shortCourseBytes = await generateAcceptanceLetterPdf(shortCourseData);
    assert.ok(shortCourseBytes instanceof Uint8Array);
    const shortDoc = await PDFDocument.load(shortCourseBytes);
    assert.strictEqual(shortDoc.getPageCount(), 1);
    console.log('  PASS: successfully generated PDF without optional level and with default dateText');

    console.log('\n[5] Stress test with long strings (font autoscaling to fit underlines)');
    const longData = {
        studentName: 'Christopher Alexander Montgomery-Cunningham-Kipkorir',
        dearName: 'Christopher Alexander',
        admissionNumber: 'FEWA/ADM/2026/EXT/999999',
        course: 'Comprehensive Advanced International Certificate in Cosmetology and Aesthetic Beauty Therapies',
        level: 'Advanced Professional Diploma Level 7 (International Accreditation)',
        dateText: '31 December 2026'
    };
    const longBytes = await generateAcceptanceLetterPdf(longData);
    assert.ok(longBytes instanceof Uint8Array);
    const longDoc = await PDFDocument.load(longBytes);
    assert.strictEqual(longDoc.getPageCount(), 1);
    console.log('  PASS: long student and course titles fit and render without error');

    console.log('\nALL ACCEPTANCE LETTER TESTS PASSED');
}

main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});

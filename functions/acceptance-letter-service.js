// ------------------------------------------------------------------------
// OFFICIAL ACCEPTANCE LETTER PDF GENERATION
// ------------------------------------------------------------------------
//
// Fills the real FEWA acceptance letter (functions/templates/FEWA-Acceptance-
// Letter-Template.pdf) by drawing text on top of the original template page
// -- the template file itself is only ever read, never modified. The
// template has no AcroForm fields (confirmed by inspection); it is a flat,
// text-layer PDF with underlined blanks, so each blank's position was
// measured directly off the template with pdfjs-dist and hardcoded below.
// Re-measure FIELDS if the template file is ever replaced.
//
// TEMPLATE DESIGN:
// The official template (functions/templates/FEWA-Acceptance-Letter-Template.pdf)
// contains the fixed institution letterhead, body text, checklist, and signature.
// Dynamic fields (Date, Student Name, Admission Number, Course, Level, and Dear Name)
// are drawn precisely on the underlined blank coordinates measured from the template.

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'FEWA-Acceptance-Letter-Template.pdf');

// x/y are the PDF-point baseline (bottom-left origin) where each blank
// starts; maxWidth is that blank's own underline width, so filled text stays
// confined to the line it belongs on instead of overlapping neighbouring text.
const FIELDS = {
    date: { x: 82.2, y: 709.85, maxWidth: 132 },
    studentName: { x: 131.2, y: 682.13, maxWidth: 252 },
    admissionNumber: { x: 157.8, y: 668.33, maxWidth: 234 },
    course: { x: 94.8, y: 654.53, maxWidth: 294 },
    level: { x: 86.2, y: 640.73, maxWidth: 300 },
    dearName: { x: 77.5, y: 585.17, maxWidth: 180 }
};

const BASE_FONT_SIZE = 11;
const MIN_FONT_SIZE = 7;

// Shrinks the font just enough for long values (e.g. a long programme title)
// to still fit within their own blank, rather than overflowing onto the
// printed label text that follows on the same line.
function fitFontSize(font, text, maxWidth) {
    let size = BASE_FONT_SIZE;
    while (size > MIN_FONT_SIZE && font.widthOfTextAtSize(text, size) > maxWidth) {
        size -= 0.5;
    }
    return size;
}

function formatLetterDate(date = new Date()) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// studentName/dearName/admissionNumber/course are required -- every accepted
// application has these by the time promoteAcceptedApplication runs (see
// validateApplication in admission-service.js). level is optional: Short
// Courses have no qualification level, matching the website's own display.
async function generateAcceptanceLetterPdf({ studentName, dearName, admissionNumber, course, level, dateText }) {
    const templateBytes = fs.readFileSync(TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const black = rgb(0, 0, 0);

    const draw = (key, text) => {
        if (!text) return;
        const field = FIELDS[key];
        const size = fitFontSize(font, text, field.maxWidth);
        page.drawText(text, { x: field.x, y: field.y, size, font, color: black });
    };

    draw('date', dateText || formatLetterDate());
    draw('studentName', studentName);
    draw('admissionNumber', admissionNumber);
    draw('course', course);
    draw('level', level);
    draw('dearName', dearName);

    return pdfDoc.save();
}

module.exports = { generateAcceptanceLetterPdf, formatLetterDate, TEMPLATE_PATH };

// ------------------------------------------------------------------------
// ACCEPTANCE LETTER DELIVERY (PDF generation + secure storage + email)
// ------------------------------------------------------------------------
//
// Composes acceptance-letter-service.js (fills the official PDF template),
// Cloud Storage (private per-student document, same bucket/rules already
// used for every other student document), and email-service.js (Zoho relay)
// into the single action triggered when an application is accepted. Kept
// separate from admission-service.js so that file stays focused on the
// Firestore transaction and never needs to know about PDF layout, Storage
// paths, or SMTP.

const { generateAcceptanceLetterPdf, formatLetterDate } = require('./acceptance-letter-service');
const { qualificationLevelForProgram } = require('./course-catalog');

// studentId is "{year}/{sequence}" (e.g. "2026/001") -- "/" is a path
// separator in Cloud Storage and not safe in a filename, so it is replaced
// with "-" here only, matching the suggested "FEWA-Acceptance-Letter-
// ADMISSION-NUMBER.pdf" naming. The admission number shown ON the letter
// itself (drawn by acceptance-letter-service.js) is left unchanged.
function buildLetterFileName(studentId) {
    return `FEWA-Acceptance-Letter-${String(studentId).replace(/\//g, '-')}.pdf`;
}

// Matches the existing students/{studentUid}/documents/{documentId}/{fileName}
// pattern already enforced by storage.rules (owner + admin/superadmin read,
// write: if false for everyone but the Admin SDK) -- no rules changes needed.
function buildStoragePath(applicationId, fileName) {
    return `students/${applicationId}/documents/acceptance-letter/${fileName}`;
}

async function buildAndStoreLetter({ bucket, applicationId, application, studentId }) {
    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    const fullName = [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ').trim();

    const pdfBytes = await generateAcceptanceLetterPdf({
        studentName: fullName,
        dearName: person.firstName || fullName,
        admissionNumber: studentId,
        course: programme.program || '',
        level: qualificationLevelForProgram(programme.program || ''),
        dateText: formatLetterDate()
    });

    const fileName = buildLetterFileName(studentId);
    const storagePath = buildStoragePath(applicationId, fileName);
    await bucket.file(storagePath).save(Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        metadata: { cacheControl: 'private, max-age=0' }
    });

    return { pdfBytes, fileName, storagePath };
}

// Returns a (application, studentId) => Promise<{fileName, storagePath}>
// function, matching the shape admission-service.js already expects from
// sendAcceptanceEmail -- generation+storage failures here intentionally
// propagate (never send an email for a letter that doesn't exist).
function createAcceptanceLetterSender({ bucket, applicationId, sendAcceptanceEmail }) {
    return async function sendAcceptanceLetterEmail(application, studentId) {
        const letter = await buildAndStoreLetter({ bucket, applicationId, application, studentId });
        await sendAcceptanceEmail(application, studentId, {
            filename: letter.fileName,
            content: Buffer.from(letter.pdfBytes),
            contentType: 'application/pdf'
        });
        return { fileName: letter.fileName, storagePath: letter.storagePath };
    };
}

module.exports = { buildAndStoreLetter, buildLetterFileName, buildStoragePath, createAcceptanceLetterSender };

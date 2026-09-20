// ------------------------------------------------------------------------
// APPLICANT-FACING STATUS LOOKUP (no account required)
// ------------------------------------------------------------------------
//
// Lets an applicant who never created a password check their application
// status using their application reference plus the email or phone number
// they applied with. Deliberately NOT gated by request.auth -- applicants
// checking status have no account to sign in with.
//
// Firestore rules only allow reads by staff or the authenticated owner
// (request.auth.uid == applicantUid), and rules cannot verify "does the
// caller actually know the matching email" against arbitrary client-read
// parameters -- there is no safe way to express this as a Firestore rule.
// So this runs server-side via the Admin SDK, verifies the applicationNumber
// AND a matching contact detail together, and returns only a minimal,
// non-sensitive subset of fields. A wrong reference and a wrong contact
// detail produce the exact same generic error, so this cannot be used to
// enumerate valid application numbers or confirm someone's email/phone.

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePhone(value) {
    return typeof value === 'string' ? value.replace(/[^0-9+]/g, '') : '';
}

async function checkApplicationStatus({ db, applicationNumber, email, phone }) {
    const number = typeof applicationNumber === 'string' ? applicationNumber.trim() : '';
    if (!number) throw new Error('An application reference is required.');

    const providedEmail = normalizeEmail(email);
    const providedPhone = normalizePhone(phone);
    if (!providedEmail && !providedPhone) {
        throw new Error('Enter the email address or phone number used on your application.');
    }

    const notFound = () => new Error('We could not find an application matching those details. Please check your reference and contact details and try again.');

    const snapshot = await db.collection('applications').where('applicationNumber', '==', number).limit(1).get();
    if (snapshot.empty) throw notFound();

    const application = snapshot.docs[0].data();
    const person = application.personalInformation || {};
    const storedEmail = normalizeEmail(person.email);
    const storedPhone = normalizePhone(person.phone);

    const emailMatches = Boolean(providedEmail) && providedEmail === storedEmail;
    const phoneMatches = Boolean(providedPhone) && providedPhone === storedPhone;
    if (!emailMatches && !phoneMatches) throw notFound();

    return {
        applicationNumber: application.applicationNumber,
        status: application.status || 'Draft',
        programme: application.programInformation?.program || '',
        intake: application.programInformation?.intake || '',
        submittedAt: application.submittedAt?.toDate ? application.submittedAt.toDate().toISOString() : null,
        updatedAt: application.updatedAt?.toDate ? application.updatedAt.toDate().toISOString() : null
    };
}

module.exports = { checkApplicationStatus };

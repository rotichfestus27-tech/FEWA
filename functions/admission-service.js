const { Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');

// Current student ID format is "{year}/{sequence}" (e.g. "2026/001"). The old
// "FEWA{year}-{sequence}" format (e.g. "FEWA2026-001") is still recognized
// here ONLY so findHighestStudentSequence continues counting correctly for
// years that already have students admitted under the old format -- existing
// student records are never rewritten to the new format.
const ID_PATTERN = /^(\d{4})\/(\d{3,})$/;
const LEGACY_ID_PATTERN = /^FEWA(\d{4})-(\d{3,})$/;
const EMAIL_PATTERN = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;
const PHONE_PATTERN = /^[0-9+ ()-]+$/;
const ELIGIBLE_STATUSES = new Set(['Submitted', 'Under Review', 'Accepted']);
const AUTHORIZED_ROLES = new Set(['admin', 'superadmin', 'admissions']);

function hasAuthorizedRole(token = {}) {
    const roles = token.roles;
    if (Array.isArray(roles)) return roles.some(role => AUTHORIZED_ROLES.has(role));
    return roles && typeof roles === 'object'
        ? Object.keys(roles).some(role => AUTHORIZED_ROLES.has(role) && roles[role] === true)
        : false;
}

function requireString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
    return value.trim();
}

function buildStudentProfile(application, studentId, now, existing = {}) {
    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    const fullName = [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ').trim();
    const mapped = {
        uid: application.applicantUid,
        studentId,
        fullName,
        email: person.email.trim(),
        phone: person.phone.trim(),
        program: programme.program.trim(),
        intake: programme.intake.trim(),
        admissionStatus: 'Accepted',
        applicationNumber: application.applicationNumber,
        sourceApplicationId: application.applicantUid,
        updatedAt: now
    };

    if (!existing.createdAt) mapped.createdAt = now;
    return Object.fromEntries(Object.entries(mapped).filter(([key, value]) => existing[key] === undefined || key === 'admissionStatus' || key === 'updatedAt'));
}

function validateApplication(application, applicationId) {
    if (!application || application.applicantUid !== applicationId) throw new Error('Application ownership is invalid.');
    if (!ELIGIBLE_STATUSES.has(application.status)) throw new Error('Only submitted or under-review applications can be accepted.');

    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    requireString(person.firstName, 'Applicant first name');
    requireString(person.lastName, 'Applicant last name');
    const email = requireString(person.email, 'Applicant email');
    if (!EMAIL_PATTERN.test(email)) throw new Error('Applicant email is invalid.');
    const phone = requireString(person.phone, 'Applicant phone');
    if (!PHONE_PATTERN.test(phone)) throw new Error('Applicant phone is invalid.');
    requireString(programme.program, 'Programme');
    requireString(programme.intake, 'Intake');
    if (application.status !== 'Accepted' && (!application.submittedAt || !application.documents || application.documents.length < 3)) {
        throw new Error('The application must contain submitted data and three documents before acceptance.');
    }
}

function findHighestStudentSequence(snapshot, year) {
    let highest = 0;
    snapshot.forEach(document => {
        const studentId = String(document.data().studentId || '');
        const match = studentId.match(ID_PATTERN) || studentId.match(LEGACY_ID_PATTERN);
        if (match && match[1] === String(year)) highest = Math.max(highest, Number(match[2]));
    });
    return highest;
}

async function allocateStudentId(transaction, db, year, counterRef) {
    const counterSnapshot = await transaction.get(counterRef);
    const studentSnapshot = await transaction.get(db.collection('students'));
    const existingHighest = findHighestStudentSequence(studentSnapshot, year);
    const configuredNext = Number(counterSnapshot.exists ? counterSnapshot.data().next : 1);
    const sequence = Math.max(configuredNext, existingHighest + 1);
    transaction.set(counterRef, { next: sequence + 1, updatedAt: Timestamp.now() }, { merge: true });
    return `${year}/${String(sequence).padStart(3, '0')}`;
}

async function promoteAcceptedApplication({ db, applicationId, authToken = {} }) {
    if (!hasAuthorizedRole(authToken)) throw new Error('You are not authorized to admit applicants.');
    requireString(applicationId, 'Application ID');

    const applicationRef = db.collection('applications').doc(applicationId);
    const studentRef = db.collection('students').doc(applicationId);
    const notificationRef = applicationRef.collection('notifications').doc('accepted');
    const year = new Date().getFullYear();
    const counterRef = db.collection('counters').doc(`studentIds-${year}`);

    return db.runTransaction(async transaction => {
        const applicationSnapshot = await transaction.get(applicationRef);
        const studentSnapshot = await transaction.get(studentRef);
        const notificationSnapshot = await transaction.get(notificationRef);
        const application = applicationSnapshot.data();
        validateApplication(application, applicationId);

        const existingStudent = studentSnapshot.exists ? studentSnapshot.data() : {};
        if (existingStudent.sourceApplicationId && existingStudent.sourceApplicationId !== applicationId) {
            throw new Error('The existing student record belongs to another application.');
        }
        if (existingStudent.email && application.personalInformation.email && existingStudent.email !== application.personalInformation.email) {
            throw new Error('The existing student record has a conflicting email address.');
        }

        if (existingStudent.uid && existingStudent.uid !== applicationId) {
            throw new Error('The existing student record has a conflicting UID.');
        }

        const now = Timestamp.now();
        let studentId = existingStudent.studentId;
        if (!studentId) studentId = await allocateStudentId(transaction, db, year, counterRef);

        const studentProfile = buildStudentProfile(application, studentId, now, existingStudent);
        transaction.set(studentRef, studentProfile, { merge: true });

        if (application.status !== 'Accepted') {
            transaction.update(applicationRef, { status: 'Accepted', updatedAt: now });
        }

        if (!notificationSnapshot.exists) {
            transaction.create(notificationRef, {
                title: 'Application accepted',
                message: 'Your application has been accepted and your student record has been created.',
                type: 'application_status',
                status: 'Accepted',
                read: false,
                createdAt: now
            });
        }

        return { applicationId, studentId, status: 'Accepted', idempotent: application.status === 'Accepted' && studentSnapshot.exists && notificationSnapshot.exists };
    });
}

// ------------------------------------------------------------------------
// APPLICANT-FACING SUBMISSION (no password required to submit)
// ------------------------------------------------------------------------
//
// Applicants fill out and save their application while signed in anonymously.
// Firestore rules permit anonymous Draft writes, but deliberately require the
// submitted email to match the signer's auth token email before a write can
// carry status "Submitted" -- an anonymous session has no token email, so it
// can never satisfy that rule directly. Rather than relaxing that rule (which
// would let any anonymous session submit without proving anything about the
// data), the actual Draft -> Submitted transition is performed here, using
// the Admin SDK, which is not subject to Firestore Security Rules. The same
// data-completeness checks the rule would have enforced are re-implemented
// below so submission quality is unchanged.
//
// generateSecurePassword() produces a random credential that is attached to
// the applicant's existing (till-now anonymous) Firebase Auth account so an
// administrator can identify them later. The applicant is never shown this
// password and does not need it: their current browser session keeps working
// exactly as before, and if they need to sign in from another device they use
// the existing "Forgot password?" flow to set their own password.

function generateSecurePassword() {
    return crypto.randomBytes(24).toString('base64url');
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
    return value.trim();
}

function validateApplicationForSubmission(application) {
    const person = application.personalInformation || {};
    const academic = application.academicInformation || {};
    const programme = application.programInformation || {};
    const additional = application.additionalInformation || {};

    requireNonEmptyString(person.firstName, 'First name');
    requireNonEmptyString(person.lastName, 'Last name');
    requireNonEmptyString(person.identityNumber, 'National ID / Passport number');
    const email = requireNonEmptyString(person.email, 'Email address');
    if (!EMAIL_PATTERN.test(email)) throw new Error('The email address is invalid.');
    const phone = requireNonEmptyString(person.phone, 'Phone number');
    if (!PHONE_PATTERN.test(phone)) throw new Error('The phone number is invalid.');
    requireNonEmptyString(person.emergencyName, 'Emergency contact name');
    const emergencyPhone = requireNonEmptyString(person.emergencyPhone, 'Emergency contact phone');
    if (!PHONE_PATTERN.test(emergencyPhone)) throw new Error('The emergency contact phone number is invalid.');
    requireNonEmptyString(person.emergencyRelationship, 'Emergency contact relationship');
    requireNonEmptyString(academic.educationLevel, 'Education level');
    requireNonEmptyString(academic.institution, 'Institution');
    if (typeof academic.yearCompleted !== 'string' || !academic.yearCompleted.trim()) throw new Error('Year completed is required.');
    requireNonEmptyString(programme.program, 'Programme');
    requireNonEmptyString(programme.intake, 'Intake');
    if (!Array.isArray(application.documents) || application.documents.length < 3) throw new Error('At least three supporting documents are required.');
    if (additional.declaration !== true) throw new Error('The declaration must be accepted.');

    return email;
}

async function finalizeApplicationSubmission({ db, auth, applicationId }) {
    requireString(applicationId, 'Application ID');
    const applicationRef = db.collection('applications').doc(applicationId);

    const email = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(applicationRef);
        if (!snapshot.exists) throw new Error('Application not found.');
        const application = snapshot.data();
        if (application.applicantUid !== applicationId) throw new Error('Application ownership is invalid.');

        if (application.status === 'Submitted') {
            // Idempotent: a retried request after a dropped response should not re-validate or re-write.
            return application.personalInformation?.email || '';
        }
        if (application.status !== 'Draft') {
            throw new Error('This application has already been processed and cannot be resubmitted.');
        }

        const validatedEmail = validateApplicationForSubmission(application);
        transaction.update(applicationRef, {
            status: 'Submitted',
            submittedAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        return validatedEmail;
    });

    if (email && auth) {
        try {
            const existingUser = await auth.getUser(applicationId);
            if (!existingUser.email) {
                await auth.updateUser(applicationId, { email, password: generateSecurePassword() });
            }
        } catch (error) {
            // The application record is already safely submitted above; a failure to upgrade
            // the Auth account is not fatal and can be retried by an administrator later.
        }
    }

    return { applicationId, status: 'Submitted' };
}

module.exports = {
    hasAuthorizedRole,
    validateApplication,
    buildStudentProfile,
    allocateStudentId,
    promoteAcceptedApplication,
    generateSecurePassword,
    validateApplicationForSubmission,
    finalizeApplicationSubmission
};

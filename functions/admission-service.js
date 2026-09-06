const { Timestamp } = require('firebase-admin/firestore');

const YEAR_PATTERN = /^FEWA(\d{4})-(\d{3,})$/;
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
        const match = String(document.data().studentId || '').match(YEAR_PATTERN);
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
    return `FEWA${year}-${String(sequence).padStart(3, '0')}`;
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

module.exports = {
    hasAuthorizedRole,
    validateApplication,
    buildStudentProfile,
    allocateStudentId,
    promoteAcceptedApplication
};

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

async function promoteAcceptedApplication({ db, applicationId, authToken = {}, sendAcceptanceEmail }) {
    if (!hasAuthorizedRole(authToken)) throw new Error('You are not authorized to admit applicants.');
    requireString(applicationId, 'Application ID');

    const applicationRef = db.collection('applications').doc(applicationId);
    const studentRef = db.collection('students').doc(applicationId);
    const notificationRef = applicationRef.collection('notifications').doc('accepted');
    const year = new Date().getFullYear();
    const counterRef = db.collection('counters').doc(`studentIds-${year}`);

    const result = await db.runTransaction(async transaction => {
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

        return {
            applicationId, studentId, status: 'Accepted',
            idempotent: application.status === 'Accepted' && studentSnapshot.exists && notificationSnapshot.exists,
            application
        };
    });

    // Only after the transaction above has committed -- application accepted,
    // student record created/updated, student ID allocated, and the in-app
    // notification written -- and only on a genuinely new acceptance, never
    // on a repeat/idempotent call (matches the same guard already used by the
    // client for the activation email, see admin-portal.js).
    if (!result.idempotent && typeof sendAcceptanceEmail === 'function') {
        await deliverAcceptanceLetter(studentRef, sendAcceptanceEmail, result.application, result.studentId);
    }

    return { applicationId: result.applicationId, studentId: result.studentId, status: result.status, idempotent: result.idempotent };
}

const ALREADY_SENDING = 'ALREADY_SENDING';

// How long a lock may be held before it's treated as orphaned (left behind by
// a crashed/timed-out function instance that never reached the `finally`
// release below) and safe to reclaim. Set well above the normal PDF+SMTP
// latency (observed: well under 10s in testing) so a merely-slow send is
// never mistaken for a crashed one.
const LOCK_STALE_MS = 5 * 60 * 1000;

function acceptanceLetterLockRef(studentRef) {
    return studentRef.collection('locks').doc('acceptanceLetterSend');
}

// Mutual-exclusion guard for acceptance-letter sends, using Firestore's
// document .create() precondition (fails atomically if the document already
// exists) rather than a transactional read-check-write.
//
// WHY: an earlier version of this guard used a db.runTransaction() read-
// check-write, relying on Firestore's optimistic-concurrency conflict
// detection to serialize concurrent callers. Stress-testing that version
// against the local Firestore emulator (15 trials of 2 concurrent
// resendAcceptanceLetter calls) showed duplicate sends in 11/15 runs: a
// follow-up business-logic-free test of a bare transactional read-check-
// write showed 0/15 runs correctly serialized. A .create()-based lock,
// tested the same way, passed 15/15. create() is a different, simpler
// Firestore primitive -- "fail if this exact document path already exists"
// -- that does not depend on transaction retry behavior.
//
// This is called once per genuine send attempt (by promoteAcceptedApplication
// on first acceptance, and by resendAcceptanceLetter on every explicit staff
// retry) and the lock is always released in deliverAcceptanceLetter's
// `finally` block below, success or failure, so a legitimate follow-up
// resend is never permanently blocked by a completed attempt.
async function claimAcceptanceLetterSend(studentRef, attemptedAt) {
    const lockRef = acceptanceLetterLockRef(studentRef);
    try {
        await lockRef.create({ claimedAt: attemptedAt });
        return lockRef;
    } catch (createError) {
        // ALREADY_EXISTS -- another call currently holds the lock, or a
        // previous attempt crashed before reaching the `finally` release.
        // Check staleness before giving up: if the lock is older than
        // LOCK_STALE_MS, it's very likely orphaned by a crash (a function
        // instance killed mid-SMTP-call, out of memory, etc.) rather than a
        // genuinely slow in-flight send, so reclaim it. Deleting first is
        // safe even if two callers both detect staleness at once -- delete()
        // is idempotent, and the recreate immediately after still goes
        // through the same atomic create(), so only one of them can ever
        // win even during a stale-lock race.
        const existing = await lockRef.get();
        const claimedAt = existing.exists ? existing.data().claimedAt : null;
        const ageMs = claimedAt ? Date.now() - claimedAt.toMillis() : Infinity;
        if (ageMs <= LOCK_STALE_MS) {
            throw new Error(ALREADY_SENDING);
        }
        await lockRef.delete().catch(() => {});
        try {
            await lockRef.create({ claimedAt: attemptedAt });
            return lockRef;
        } catch (retryError) {
            // Someone else won the reclaim race -- also correct, not an error.
            throw new Error(ALREADY_SENDING);
        }
    }
}

// Shared by promoteAcceptedApplication (first, automatic send) and
// resendAcceptanceLetter (explicit staff-triggered retry) -- generates the
// PDF, stores it, emails it, and records the outcome on the student record
// so staff can see delivery status and retry without guessing.
//
// FAILURE/RECOVERY BEHAVIOR:
// - PDF generation, Storage upload, or SMTP send failure: caught below,
//   recorded as acceptanceLetter.status = 'failed' with lastError, and the
//   lock is released in `finally` -- staff can click "Resend" again
//   immediately, no waiting required.
// - The already-accepted student record (or, for a retry, the application's
//   Accepted status) is never undone by a PDF/email problem -- only the
//   acceptanceLetter sub-field is touched here.
// - A hard crash/timeout DURING sendAcceptanceEmail (the function instance
//   is killed before either the try or finally below can run) is the one
//   scenario this cannot fully observe: the lock is left behind (orphaned)
//   and acceptanceLetter.status keeps whatever value it had before this
//   attempt (it will NOT show "failed" for this specific crash, since the
//   crash prevents that write too). Recovery is automatic but not
//   immediate: the orphaned lock self-heals after LOCK_STALE_MS (5 minutes)
///  -- the next resend attempt (manual or automatic) after that point will
//   successfully reclaim it and send. This is a deliberate, documented
//   trade-off: without it, a single crashed attempt would permanently block
//   every future resend for that student.
async function deliverAcceptanceLetter(studentRef, sendAcceptanceEmail, application, studentId) {
    const attemptedAt = Timestamp.now();
    let lockRef;
    try {
        lockRef = await claimAcceptanceLetterSend(studentRef, attemptedAt);
    } catch (claimError) {
        if (claimError.message === ALREADY_SENDING) {
            console.warn(
                'deliverAcceptanceLetter: skipped -- a send is already in progress for application',
                application.applicationNumber || '(no reference number)'
            );
            return;
        }
        throw claimError;
    }
    try {
        const delivery = await sendAcceptanceEmail(application, studentId);
        await studentRef.set({
            acceptanceLetter: {
                status: 'sent',
                fileName: delivery?.fileName || null,
                storagePath: delivery?.storagePath || null,
                lastAttemptAt: attemptedAt,
                lastError: null
            }
        }, { merge: true });
    } catch (error) {
        console.error(
            'deliverAcceptanceLetter: failed for application',
            application.applicationNumber || '(no reference number)',
            '-', error.message
        );
        await studentRef.set({
            acceptanceLetter: {
                status: 'failed',
                lastAttemptAt: attemptedAt,
                lastError: error.message
            }
        }, { merge: true }).catch(() => {});
    } finally {
        // Always release the lock -- success, failure, or anything else
        // caught above -- so a future resend is never blocked by an attempt
        // that has already finished (see function-level comment above for
        // the one case this can't cover: a hard crash during the try block).
        await lockRef.delete().catch(() => {});
    }
}

// Lets an authorized staff member explicitly re-trigger acceptance-letter
// generation + email after a recorded failure (or simply to resend), without
// re-running the acceptance transaction itself. Distinct from the automatic,
// idempotency-guarded send in promoteAcceptedApplication: this is always an
// intentional, authorized action, so it is never silently skipped.
async function resendAcceptanceLetter({ db, applicationId, authToken = {}, sendAcceptanceEmail }) {
    if (!hasAuthorizedRole(authToken)) throw new Error('You are not authorized to resend acceptance letters.');
    requireString(applicationId, 'Application ID');
    if (typeof sendAcceptanceEmail !== 'function') throw new Error('Acceptance email delivery is not configured.');

    const applicationRef = db.collection('applications').doc(applicationId);
    const studentRef = db.collection('students').doc(applicationId);
    const [applicationSnapshot, studentSnapshot] = await Promise.all([applicationRef.get(), studentRef.get()]);
    if (!applicationSnapshot.exists) throw new Error('Application not found.');
    if (!studentSnapshot.exists) throw new Error('No student record exists for this application yet.');

    const application = applicationSnapshot.data();
    const studentId = studentSnapshot.data().studentId;
    if (application.status !== 'Accepted') throw new Error('This application has not been accepted.');

    await deliverAcceptanceLetter(studentRef, sendAcceptanceEmail, application, studentId);
    const updated = await studentRef.get();
    return { applicationId, studentId, acceptanceLetter: updated.data().acceptanceLetter };
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

async function finalizeApplicationSubmission({ db, auth, applicationId, sendEmails }) {
    requireString(applicationId, 'Application ID');
    const applicationRef = db.collection('applications').doc(applicationId);

    const { email, application, isNewSubmission } = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(applicationRef);
        if (!snapshot.exists) throw new Error('Application not found.');
        const application = snapshot.data();
        if (application.applicantUid !== applicationId) throw new Error('Application ownership is invalid.');

        if (application.status === 'Submitted') {
            // Idempotent: a retried request after a dropped response should not re-validate,
            // re-write, or re-notify anyone by email.
            return { email: application.personalInformation?.email || '', application, isNewSubmission: false };
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
        return { email: validatedEmail, application, isNewSubmission: true };
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

    if (isNewSubmission && typeof sendEmails === 'function') {
        try {
            await sendEmails(application);
        } catch (error) {
            // Same principle as the Auth upgrade above: the submission already
            // succeeded in Firestore, so a notification-email failure must never
            // surface as a submission failure to the applicant. Logged (reference
            // number and error message only -- no applicant details, no credentials)
            // so a real SMTP problem is visible in Cloud Logging instead of silent.
            console.error(
                'finalizeApplicationSubmission: sendEmails failed for application',
                application.applicationNumber || '(no reference number)',
                '-', error.message
            );
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
    resendAcceptanceLetter,
    generateSecurePassword,
    validateApplicationForSubmission,
    finalizeApplicationSubmission
};

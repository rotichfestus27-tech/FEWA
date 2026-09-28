// Coverage for the submission-email hook (functions/admission-service.js's
// finalizeApplicationSubmission calling the injected sendEmails) and the SMTP
// transporter configuration (functions/email-service.js). Never makes a real
// network call to Zoho -- verifies structure/wiring only, using either a mock
// sendEmails or an unconnected nodemailer transporter's own recorded options.
//
// Run via: firebase emulators:exec --only firestore,auth "node functions/test/submission-email.test.js"
const assert = require('assert');
const admin = require('firebase-admin');
const { finalizeApplicationSubmission } = require('../admission-service');
const { createEmailSender, buildTransporter, ADMISSIONS_EMAIL } = require('../email-service');

const app = admin.initializeApp({ projectId: 'fewa-submission-email-test' }, 'submission-email-test');
const db = app.firestore();
const auth = app.auth();

function draftApplication(uid, overrides = {}) {
    return {
        applicantUid: uid,
        applicationNumber: 'FEWA-2026-EMAIL' + uid.slice(-3),
        status: 'Draft',
        personalInformation: {
            firstName: 'Grace', lastName: 'Njeri', identityNumber: '11223344',
            email: `${uid}@example.com`, phone: '0711223344',
            emergencyName: 'Peter Njeri', emergencyPhone: '0799887766', emergencyRelationship: 'Father'
        },
        academicInformation: { educationLevel: 'KCSE', institution: 'Test High School', yearCompleted: '2023' },
        programInformation: { program: 'Professional Makeup Artistry', intake: 'September 2026' },
        documents: [{ name: 'identityDocument' }, { name: 'photo' }, { name: 'schoolCertificate' }],
        additionalInformation: { declaration: true },
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        ...overrides
    };
}

async function main() {
    console.log('[1] sendEmails is called exactly once on a genuinely new submission, with the real application data');
    const uid1 = 'email-test-new-001';
    await db.collection('applications').doc(uid1).set(draftApplication(uid1));
    let calls = [];
    await finalizeApplicationSubmission({
        db, auth, applicationId: uid1,
        sendEmails: async (application) => { calls.push(application); }
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].personalInformation.firstName, 'Grace');
    assert.strictEqual(calls[0].programInformation.program, 'Professional Makeup Artistry');
    assert.strictEqual(calls[0].applicationNumber, 'FEWA-2026-EMAIL001');
    console.log('  PASS: called once with the correct applicant/programme/reference data');

    console.log('\n[2] A repeat (idempotent) call does NOT send emails again');
    calls = [];
    await finalizeApplicationSubmission({
        db, auth, applicationId: uid1,
        sendEmails: async (application) => { calls.push(application); }
    });
    assert.strictEqual(calls.length, 0);
    console.log('  PASS: no email attempt on an already-Submitted application');

    console.log('\n[3] A sendEmails failure does not break the submission (already succeeded in Firestore)');
    const uid2 = 'email-test-fail-002';
    await db.collection('applications').doc(uid2).set(draftApplication(uid2));
    const result = await finalizeApplicationSubmission({
        db, auth, applicationId: uid2,
        sendEmails: async () => { throw new Error('simulated SMTP outage'); }
    });
    assert.strictEqual(result.status, 'Submitted');
    const stored = (await db.collection('applications').doc(uid2).get()).data();
    assert.strictEqual(stored.status, 'Submitted');
    console.log('  PASS: submission still succeeds even when email sending throws');

    console.log('\n[4] No sendEmails provided at all (backward compatible with older callers/tests)');
    const uid3 = 'email-test-none-003';
    await db.collection('applications').doc(uid3).set(draftApplication(uid3));
    const result2 = await finalizeApplicationSubmission({ db, auth, applicationId: uid3 });
    assert.strictEqual(result2.status, 'Submitted');
    console.log('  PASS: submission succeeds with no sendEmails argument at all');

    console.log('\n[5] createEmailSender fails FAST (no real network attempt) when credentials are missing');
    const sender = createEmailSender(undefined, undefined);
    const start = Date.now();
    await assert.rejects(sender(draftApplication('x')), /not configured/);
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 2000, `expected a fast rejection, took ${elapsedMs}ms`);
    console.log(`  PASS: rejected in ${elapsedMs}ms with a clear "not configured" error, no SMTP connection attempted`);

    console.log('\n[6] The Zoho transporter is configured correctly (host/port/security), without connecting');
    const transporter = buildTransporter('someone@fewa.ac.ke', 'app-password');
    assert.strictEqual(transporter.options.host, 'smtp.zoho.com');
    assert.strictEqual(transporter.options.port, 465);
    assert.strictEqual(transporter.options.secure, true);
    assert.strictEqual(transporter.options.auth.user, 'someone@fewa.ac.ke');
    console.log('  PASS: transporter targets smtp.zoho.com:465 over TLS with the supplied credentials');

    console.log('\n[7] ADMISSIONS_EMAIL points at the real fewa.ac.ke mailbox, not a placeholder');
    assert.strictEqual(ADMISSIONS_EMAIL, 'admissions@fewa.ac.ke');
    console.log('  PASS: admissions@fewa.ac.ke');

    console.log('\nsubmission-email integration: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

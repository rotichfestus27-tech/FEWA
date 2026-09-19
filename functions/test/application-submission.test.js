// Functional coverage for finalizeApplicationSubmission (functions/index.js +
// functions/admission-service.js), which previously had no committed test.
// Invokes the REAL exported handler via .run({data, auth}) so the ownership
// guarantee ("operates only on the caller's own application") is verified
// against the actual production code path, not a re-implementation of it.
//
// Run via: firebase emulators:exec --only firestore,auth "node functions/test/application-submission.test.js"
const assert = require('assert');
const admin = require('firebase-admin');
const handlers = require('../index');

const db = admin.firestore();
const auth = admin.auth();

function draftApplication(uid, overrides = {}) {
    return {
        applicantUid: uid,
        applicationNumber: 'FEWA-2026-000' + uid.slice(-3),
        status: 'Draft',
        personalInformation: {
            firstName: 'Amina', lastName: 'Otieno', identityNumber: '34567890',
            email: `${uid}@example.com`, phone: '0712345678',
            emergencyName: 'John Otieno', emergencyPhone: '0798765432', emergencyRelationship: 'Father'
        },
        academicInformation: { educationLevel: 'KCSE', institution: 'Nairobi High School', yearCompleted: '2023' },
        programInformation: { program: 'Professional Makeup Artistry', intake: 'September 2026' },
        documents: [{ name: 'identityDocument' }, { name: 'photo' }, { name: 'schoolCertificate' }],
        additionalInformation: { declaration: true },
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        ...overrides
    };
}

async function assertHttpsError(promise, messagePattern) {
    try {
        await promise;
        assert.fail('expected the call to throw an HttpsError but it succeeded');
    } catch (error) {
        assert.strictEqual(error.code, 'failed-precondition', `expected failed-precondition, got "${error.code}" (${error.message})`);
        if (messagePattern) assert.match(error.message, messagePattern);
    }
}

async function main() {
    console.log('[1] Happy path: caller finalizes their OWN Draft application');
    const uidHappy = 'sub-happy-uid';
    // A real Auth user must exist for this uid, exactly as it always would in production --
    // request.auth.uid is never valid without a backing Firebase Auth user behind it.
    await auth.createUser({ uid: uidHappy });
    await db.collection('applications').doc(uidHappy).set(draftApplication(uidHappy));
    const result = await handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidHappy, token: {} } });
    assert.strictEqual(result.status, 'Submitted');
    const doc = (await db.collection('applications').doc(uidHappy).get()).data();
    assert.strictEqual(doc.status, 'Submitted');
    assert.ok(doc.submittedAt, 'submittedAt must be set');
    const upgradedUser = await auth.getUser(uidHappy).catch(() => null);
    const hasPasswordProvider = upgradedUser?.providerData?.some((p) => p.providerId === 'password');
    assert.ok(upgradedUser?.email === `${uidHappy}@example.com` && hasPasswordProvider, 'backend account should be upgraded with email + a generated password (password provider present)');
    console.log('  PASS: application submitted, status/submittedAt correct, backend account credentials created');

    console.log('\n[2] Ownership: client-supplied applicationId in "data" is ignored -- only the caller\'s own uid is ever used');
    const uidOwnerA = 'sub-owner-a';
    const uidOwnerB = 'sub-owner-b';
    await auth.createUser({ uid: uidOwnerA });
    await auth.createUser({ uid: uidOwnerB });
    await db.collection('applications').doc(uidOwnerA).set(draftApplication(uidOwnerA));
    await db.collection('applications').doc(uidOwnerB).set(draftApplication(uidOwnerB));
    await handlers.finalizeApplicationSubmission.run({ data: { applicationId: uidOwnerB }, auth: { uid: uidOwnerA, token: {} } });
    assert.strictEqual((await db.collection('applications').doc(uidOwnerA).get()).data().status, 'Submitted', 'the CALLER\'s own application (A) must be the one finalized');
    assert.strictEqual((await db.collection('applications').doc(uidOwnerB).get()).data().status, 'Draft', 'a different applicant\'s application (B) must be untouched, even though it was named in "data"');
    console.log('  PASS: attempting to target another applicant\'s application via data.applicationId has no effect -- only auth.uid is ever used');

    console.log('\n[3] Idempotency: finalizing an already-Submitted application succeeds without re-validating');
    const idempotentResult = await handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidHappy, token: {} } });
    assert.strictEqual(idempotentResult.status, 'Submitted');
    console.log('  PASS: repeat call is idempotent');

    console.log('\n[4] Validation: missing required field is rejected, status stays Draft');
    const uidMissingPhone = 'sub-missing-phone';
    await auth.createUser({ uid: uidMissingPhone });
    const incomplete = draftApplication(uidMissingPhone);
    incomplete.personalInformation.phone = '';
    await db.collection('applications').doc(uidMissingPhone).set(incomplete);
    await assertHttpsError(
        handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidMissingPhone, token: {} } }),
        /Phone number is required/
    );
    assert.strictEqual((await db.collection('applications').doc(uidMissingPhone).get()).data().status, 'Draft');
    console.log('  PASS: rejected with a clear message, status unchanged');

    console.log('\n[5] Validation: fewer than 3 documents is rejected');
    const uidFewDocs = 'sub-few-docs';
    await auth.createUser({ uid: uidFewDocs });
    await db.collection('applications').doc(uidFewDocs).set(draftApplication(uidFewDocs, { documents: [{ name: 'identityDocument' }] }));
    await assertHttpsError(
        handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidFewDocs, token: {} } }),
        /three supporting documents/
    );
    console.log('  PASS: rejected for insufficient documents');

    console.log('\n[6] Validation: declaration not accepted is rejected');
    const uidNoDeclaration = 'sub-no-declaration';
    await auth.createUser({ uid: uidNoDeclaration });
    await db.collection('applications').doc(uidNoDeclaration).set(draftApplication(uidNoDeclaration, { additionalInformation: { declaration: false } }));
    await assertHttpsError(
        handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidNoDeclaration, token: {} } }),
        /declaration must be accepted/
    );
    console.log('  PASS: rejected when the declaration checkbox was not accepted');

    console.log('\n[7] An application already past Draft/Submitted cannot be re-finalized');
    const uidProcessed = 'sub-already-processed';
    await auth.createUser({ uid: uidProcessed });
    await db.collection('applications').doc(uidProcessed).set(draftApplication(uidProcessed, { status: 'Under Review' }));
    await assertHttpsError(
        handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidProcessed, token: {} } }),
        /already been processed/
    );
    console.log('  PASS: rejected for an application already moved past Draft/Submitted');

    console.log('\n[8] Malformed input: no application document exists for this caller at all');
    await auth.createUser({ uid: 'sub-does-not-exist' });
    await assertHttpsError(
        handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: 'sub-does-not-exist', token: {} } }),
        /Application not found/
    );
    console.log('  PASS: rejected with a clear "not found" message');

    console.log('\n[9] An account that already has an email is not overwritten');
    const uidHasEmail = 'sub-has-email';
    await auth.createUser({ uid: uidHasEmail, email: 'already-set@example.com', password: 'Password1!' });
    await db.collection('applications').doc(uidHasEmail).set(draftApplication(uidHasEmail));
    await handlers.finalizeApplicationSubmission.run({ data: {}, auth: { uid: uidHasEmail, token: {} } });
    const existingUser = await auth.getUser(uidHasEmail);
    assert.strictEqual(existingUser.email, 'already-set@example.com', 'the pre-existing email must be left untouched');
    console.log('  PASS: an account that already had a real email/password was not modified');

    console.log('\nfinalizeApplicationSubmission: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

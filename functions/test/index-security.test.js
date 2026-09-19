// Tests the security boundaries that live in functions/index.js itself -- the
// unauthenticated/unauthorized rejection checks that wrap every callable
// function -- by invoking the REAL exported handlers via the .run({data, auth})
// method firebase-functions v6 provides for exactly this purpose. This is a
// different layer than admission-service.test.js, which calls the inner
// service functions directly and is left untouched.
//
// Requires FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to be set
// (via `firebase emulators:exec --only firestore,auth "node ..."`), because
// functions/index.js calls admin.initializeApp() at module load time and every
// handler below reaches real admin.firestore()/admin.auth() calls routed to
// the emulators.
const assert = require('assert');
const admin = require('firebase-admin');
const handlers = require('../index');

const db = admin.firestore();
const auth = admin.auth();

function draftApplication(uid) {
    return {
        applicantUid: uid,
        applicationNumber: 'FEWA-2026-000301',
        status: 'Draft',
        personalInformation: {
            firstName: 'Test', lastName: 'Applicant', identityNumber: 'ID-1',
            email: 'sec-test@example.com', phone: '+254700000010',
            emergencyName: 'Contact', emergencyPhone: '+254700000011', emergencyRelationship: 'Sibling'
        },
        academicInformation: { educationLevel: 'KCSE', institution: 'School', yearCompleted: '2025' },
        programInformation: { program: 'Cosmetology & Advanced Beauty Therapy', intake: 'September 2026' },
        documents: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        additionalInformation: { declaration: true },
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
    };
}

async function assertHttpsError(promise, code, messagePattern) {
    try {
        await promise;
        assert.fail('expected the call to throw an HttpsError but it succeeded');
    } catch (error) {
        assert.strictEqual(error.code, code, `expected error.code "${code}", got "${error.code}" (${error.message})`);
        if (messagePattern) assert.match(error.message, messagePattern);
    }
}

async function main() {
    console.log('[1] Unauthenticated callers are rejected by every function');
    await assertHttpsError(handlers.promoteAcceptedApplication.run({ data: {} }), 'unauthenticated');
    await assertHttpsError(handlers.finalizeApplicationSubmission.run({ data: {} }), 'unauthenticated');
    await assertHttpsError(handlers.setUserRole.run({ data: {} }), 'unauthenticated');
    await assertHttpsError(handlers.listStaffAccounts.run({ data: {} }), 'unauthenticated');
    console.log('  PASS: all 4 functions reject a request with no auth context');

    console.log('\n[2] setUserRole and listStaffAccounts reject authenticated non-superadmin callers');
    const nonAdminAuth = { uid: 'sec-non-admin', token: { roles: { admissions: true } } };
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'someone@example.com', role: 'admin', grant: true }, auth: nonAdminAuth }),
        'permission-denied', /superadmin/
    );
    await assertHttpsError(
        handlers.listStaffAccounts.run({ data: {}, auth: nonAdminAuth }),
        'permission-denied', /superadmin/
    );
    console.log('  PASS: a non-superadmin (admissions role) is rejected with permission-denied for both functions');

    const noRolesAuth = { uid: 'sec-no-roles', token: {} };
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'someone@example.com', role: 'admin', grant: true }, auth: noRolesAuth }),
        'permission-denied'
    );
    console.log('  PASS: an authenticated account with NO roles at all is also rejected');

    console.log('\n[3] promoteAcceptedApplication rejects an authenticated but non-staff caller');
    const promoteUid = 'sec-promote-target';
    await db.collection('applications').doc(promoteUid).set({ ...draftApplication(promoteUid), status: 'Submitted', submittedAt: admin.firestore.Timestamp.now() });
    await assertHttpsError(
        handlers.promoteAcceptedApplication.run({ data: { applicationId: promoteUid }, auth: { uid: 'sec-random-caller', token: {} } }),
        'permission-denied'
    );
    assert.strictEqual((await db.collection('applications').doc(promoteUid).get()).data().status, 'Submitted', 'status must not have changed');
    console.log('  PASS: a caller with no admin/admissions/superadmin role cannot promote an application');

    console.log('\n[4] setUserRole succeeds end-to-end for an authenticated superadmin caller');
    const superadminAuth = { uid: 'sec-superadmin-caller', token: { roles: { superadmin: true } } };
    const targetUser = await auth.createUser({ email: 'sec-grant-target@example.com', password: 'Password1!' });
    const grantResult = await handlers.setUserRole.run({ data: { email: 'sec-grant-target@example.com', role: 'lecturer', grant: true }, auth: superadminAuth });
    assert.deepStrictEqual(grantResult.roles, ['lecturer']);
    const refreshed = await auth.getUser(targetUser.uid);
    assert.strictEqual(refreshed.customClaims?.roles?.lecturer, true, 'the custom claim must actually be persisted');
    console.log('  PASS: an authorized superadmin call reaches the real service layer and the claim is set on the account');

    console.log('\n[5] listStaffAccounts succeeds for a superadmin and reflects the grant above');
    const staffResult = await handlers.listStaffAccounts.run({ data: {}, auth: superadminAuth });
    const listed = staffResult.accounts.find((a) => a.email === 'sec-grant-target@example.com');
    assert.ok(listed, 'the just-granted account should appear in the staff list');
    assert.deepStrictEqual(listed.roles, ['lecturer']);
    console.log('  PASS: listStaffAccounts (superadmin) returns the account with its correct role');

    console.log('\nindex.js security boundaries: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

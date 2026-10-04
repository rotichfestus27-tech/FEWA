// Coverage for the staff invitation flow (functions/roles-service.js's
// inviteStaffAccount, wired in functions/index.js). Never makes a real
// network call to Zoho -- uses an injected mock sendInvitation for the
// business-logic tests, and the real exported handler only for the
// authorization-gate test (which must fail before ever reaching email).
//
// Run via: firebase emulators:exec --only firestore,auth "node functions/test/invite-staff.test.js"
const assert = require('assert');
const admin = require('firebase-admin');
const { inviteStaffAccount, VALID_ROLES } = require('../roles-service');
const handlers = require('../index');

const app = admin.initializeApp({ projectId: 'fewa-invite-staff-test' }, 'invite-staff-test');
const db = app.firestore();
const auth = app.auth();

const SUPERADMIN_AUTH = { uid: 'invite-superadmin-caller', token: { roles: { superadmin: true } } };

async function assertHttpsError(promise, code, messagePattern) {
    try {
        await promise;
        assert.fail('expected the call to throw an HttpsError but it succeeded');
    } catch (error) {
        assert.strictEqual(error.code, code, `expected "${code}", got "${error.code}" (${error.message})`);
        if (messagePattern) assert.match(error.message, messagePattern);
    }
}

async function main() {
    console.log('[1] Superadmin can invite a new staff member -- account, role, metadata, and email all correct');
    let sent = null;
    const result = await inviteStaffAccount({
        auth, db, callerUid: SUPERADMIN_AUTH.uid,
        targetName: 'Jane Wanjiru', targetEmail: 'jane.invite@example.com', role: 'admissions',
        sendInvitation: async (payload) => { sent = payload; }
    });
    assert.strictEqual(result.email, 'jane.invite@example.com');
    assert.strictEqual(result.role, 'admissions');
    const createdUser = await auth.getUser(result.uid);
    assert.strictEqual(createdUser.displayName, 'Jane Wanjiru');
    assert.strictEqual(createdUser.customClaims?.roles?.admissions, true, 'the role must be set as a custom claim');
    assert.ok(!createdUser.passwordHash, 'no password should ever be set on the new account');
    console.log('  PASS: Firebase Auth account created with the correct name, no password, and the assigned role claim');

    console.log('\n[2] Password setup link targets the existing account-setup.html staff flow');
    assert.ok(sent, 'sendInvitation must have been called');
    assert.strictEqual(sent.email, 'jane.invite@example.com');
    assert.strictEqual(sent.role, 'admissions');
    // The emulator (like real Firebase Auth) wraps our continue URL, percent-encoded,
    // inside its own action-handler link -- decode it to check the real destination.
    const continueUrl = decodeURIComponent(new URL(sent.resetLink).searchParams.get('continueUrl') || '');
    assert.match(continueUrl, /account-setup\.html/);
    assert.match(continueUrl, /portal=staff/);
    console.log('  PASS: the generated link continues to account-setup.html?portal=staff');

    console.log('\n[3] Staff metadata is written to the existing users/{uid} collection');
    const profile = await db.collection('users').doc(result.uid).get();
    assert.ok(profile.exists, 'a users/{uid} document must be created');
    assert.strictEqual(profile.data().email, 'jane.invite@example.com');
    assert.strictEqual(profile.data().role, 'admissions');
    assert.strictEqual(profile.data().invitedBy, SUPERADMIN_AUTH.uid);
    console.log('  PASS: users/{uid} metadata matches the invited account');

    console.log('\n[4] Duplicate email (account already exists) is rejected, not silently overwritten');
    await assert.rejects(
        inviteStaffAccount({
            auth, db, callerUid: SUPERADMIN_AUTH.uid,
            targetName: 'Jane Again', targetEmail: 'jane.invite@example.com', role: 'finance',
            sendInvitation: async () => { throw new Error('must not be called'); }
        }),
        /already exists/
    );
    const stillOriginal = await auth.getUser(result.uid);
    assert.strictEqual(stillOriginal.customClaims?.roles?.admissions, true, 'the original role must be unchanged');
    assert.strictEqual(stillOriginal.customClaims?.roles?.finance, undefined, 'no new role should have been added');
    console.log('  PASS: duplicate email rejected, the existing account/role were not modified');

    console.log('\n[5] An unrecognized role is rejected before any account is created');
    await assert.rejects(
        inviteStaffAccount({
            auth, db, callerUid: SUPERADMIN_AUTH.uid,
            targetName: 'Someone New', targetEmail: 'bad-role@example.com', role: 'principal',
            sendInvitation: async () => { throw new Error('must not be called'); }
        }),
        /not a recognized role/
    );
    await assert.rejects(auth.getUserByEmail('bad-role@example.com'), /no user record/i);
    console.log('  PASS: invalid role rejected, no orphan account was created');

    console.log('\n[6] A missing full name is rejected');
    await assert.rejects(
        inviteStaffAccount({
            auth, db, callerUid: SUPERADMIN_AUTH.uid,
            targetName: '  ', targetEmail: 'no-name@example.com', role: 'admin',
            sendInvitation: async () => { throw new Error('must not be called'); }
        }),
        /full name is required/
    );
    console.log('  PASS: empty name rejected');

    console.log('\n[7] Every VALID_ROLES entry is accepted (admin, admissions, finance, lecturer, superadmin)');
    for (const role of VALID_ROLES) {
        const r = await inviteStaffAccount({
            auth, db, callerUid: SUPERADMIN_AUTH.uid,
            targetName: `Test ${role}`, targetEmail: `role-${role}@example.com`, role,
            sendInvitation: async () => {}
        });
        assert.strictEqual(r.role, role);
    }
    console.log('  PASS: all 5 existing roles can be used to invite a new staff member -- no new role was introduced');

    console.log('\n[8] Non-superadmin cannot call inviteStaffAccount (real exported handler, authorization gate)');
    const nonSuperadminAuth = { uid: 'not-a-superadmin', token: { roles: { admissions: true } } };
    await assertHttpsError(
        handlers.inviteStaffAccount.run({ data: { name: 'Nope', email: 'blocked@example.com', role: 'admin' }, auth: nonSuperadminAuth }),
        'permission-denied'
    );
    await assert.rejects(auth.getUserByEmail('blocked@example.com'), /no user record/i);
    console.log('  PASS: non-superadmin caller rejected with permission-denied, no account was created');

    console.log('\n[9] An unauthenticated caller cannot call inviteStaffAccount');
    await assertHttpsError(
        handlers.inviteStaffAccount.run({ data: { name: 'Nope', email: 'anon@example.com', role: 'admin' }, auth: undefined }),
        'unauthenticated'
    );
    console.log('  PASS: unauthenticated caller rejected');

    console.log('\ninvite-staff (inviteStaffAccount): PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

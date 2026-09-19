// Functional coverage for setUserRole / listStaffAccounts (functions/index.js
// + functions/roles-service.js), which previously had no committed test.
// The basic "authenticated superadmin can grant a role, and it then appears
// in listStaffAccounts" path is already covered in index-security.test.js;
// this file focuses on the remaining role-management business logic: revoke,
// preserving other roles, invalid input, and the anti-lockout safeguards.
//
// Run via: firebase emulators:exec --only auth "node functions/test/roles-service.test.js"
// (Firestore is not needed -- roles-service.js only touches Firebase Auth.)
const assert = require('assert');
const admin = require('firebase-admin');
const handlers = require('../index');

const auth = admin.auth();
const SUPERADMIN_AUTH = { uid: 'roles-superadmin-caller', token: { roles: { superadmin: true } } };

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
    console.log('[1] Granting a second role preserves the first (roles are merged, not replaced)');
    const staff1 = await auth.createUser({ email: 'multi-role@example.com', password: 'Password1!' });
    await handlers.setUserRole.run({ data: { email: 'multi-role@example.com', role: 'admissions', grant: true }, auth: SUPERADMIN_AUTH });
    const afterFirst = await handlers.setUserRole.run({ data: { email: 'multi-role@example.com', role: 'lecturer', grant: true }, auth: SUPERADMIN_AUTH });
    assert.deepStrictEqual([...afterFirst.roles].sort(), ['admissions', 'lecturer']);
    console.log('  PASS: both roles present after two separate grants');

    console.log('\n[2] Revoking one role leaves the other intact');
    const afterRevoke = await handlers.setUserRole.run({ data: { email: 'multi-role@example.com', role: 'lecturer', grant: false }, auth: SUPERADMIN_AUTH });
    assert.deepStrictEqual(afterRevoke.roles, ['admissions']);
    const refreshed = await auth.getUser(staff1.uid);
    assert.strictEqual(refreshed.customClaims?.roles?.lecturer, undefined, 'the revoked role must not remain in the custom claim');
    assert.strictEqual(refreshed.customClaims?.roles?.admissions, true, 'the untouched role must remain');
    console.log('  PASS: revoke removes only the targeted role');

    console.log('\n[3] Rejects an unrecognized role name');
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'multi-role@example.com', role: 'principal', grant: true }, auth: SUPERADMIN_AUTH }),
        'failed-precondition', /not a recognized role/
    );
    console.log('  PASS: invalid role rejected');

    console.log('\n[4] Rejects a missing/empty email');
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: '', role: 'admin', grant: true }, auth: SUPERADMIN_AUTH }),
        'failed-precondition', /email address is required/
    );
    console.log('  PASS: empty email rejected');

    console.log('\n[5] Rejects granting a role to an email with no matching account');
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'no-such-account@example.com', role: 'admin', grant: true }, auth: SUPERADMIN_AUTH }),
        'failed-precondition', /No account was found/
    );
    console.log('  PASS: unknown account rejected with a clear message');

    console.log('\n[6] A superadmin cannot remove their own superadmin role');
    const selfUser = await auth.createUser({ email: 'self-lockout@example.com', password: 'Password1!' });
    await handlers.setUserRole.run({ data: { email: 'self-lockout@example.com', role: 'superadmin', grant: true }, auth: SUPERADMIN_AUTH });
    const selfCallerAuth = { uid: selfUser.uid, token: { roles: { superadmin: true } } };
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'self-lockout@example.com', role: 'superadmin', grant: false }, auth: selfCallerAuth }),
        'failed-precondition', /cannot remove your own superadmin/
    );
    console.log('  PASS: self-removal of superadmin blocked');

    console.log('\n[7] The last remaining superadmin cannot be revoked by someone else either');
    // At this point in the test run, prior test files/emulator state may have created other
    // superadmins, so establish a clean, isolated pair for this specific check.
    const onlyAdmin = await auth.createUser({ email: 'only-superadmin@example.com', password: 'Password1!' });
    const otherCaller = await auth.createUser({ email: 'other-caller@example.com', password: 'Password1!' });
    await handlers.setUserRole.run({ data: { email: 'only-superadmin@example.com', role: 'superadmin', grant: true }, auth: SUPERADMIN_AUTH });
    // Demote every other superadmin created earlier in this run so "only-superadmin" is truly the last one.
    await handlers.setUserRole.run({ data: { email: 'self-lockout@example.com', role: 'superadmin', grant: false }, auth: { uid: onlyAdmin.uid, token: { roles: { superadmin: true } } } });
    await assertHttpsError(
        handlers.setUserRole.run({ data: { email: 'only-superadmin@example.com', role: 'superadmin', grant: false }, auth: { uid: otherCaller.uid, token: { roles: { superadmin: true } } } }),
        'failed-precondition', /At least one superadmin account must remain/
    );
    console.log('  PASS: removing the last superadmin is blocked even when requested by a different superadmin');

    console.log('\n[8] Once a second superadmin exists, the first CAN be revoked');
    await handlers.setUserRole.run({ data: { email: 'other-caller@example.com', role: 'superadmin', grant: true }, auth: { uid: onlyAdmin.uid, token: { roles: { superadmin: true } } } });
    const finalResult = await handlers.setUserRole.run({ data: { email: 'only-superadmin@example.com', role: 'superadmin', grant: false }, auth: { uid: otherCaller.uid, token: { roles: { superadmin: true } } } });
    assert.ok(!finalResult.roles.includes('superadmin'));
    console.log('  PASS: revoke succeeds once a second superadmin exists');

    console.log('\n[9] listStaffAccounts excludes accounts with no roles and reflects current state accurately');
    await auth.createUser({ email: 'zero-roles@example.com', password: 'Password1!' });
    const listing = await handlers.listStaffAccounts.run({ data: {}, auth: SUPERADMIN_AUTH });
    const emails = listing.accounts.map((a) => a.email);
    assert.ok(!emails.includes('zero-roles@example.com'), 'an account with no roles must not appear in the staff list');
    const multiRoleEntry = listing.accounts.find((a) => a.email === 'multi-role@example.com');
    assert.ok(multiRoleEntry, 'a role-bearing account must appear in the staff list');
    assert.deepStrictEqual(multiRoleEntry.roles, ['admissions']);
    console.log('  PASS: staff list correctly includes role-bearing accounts and excludes role-less ones');

    console.log('\nroles-service (setUserRole / listStaffAccounts): PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

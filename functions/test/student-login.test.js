// Functional + security coverage for resolveStudentLoginEmail (functions/index.js +
// functions/student-login-service.js) -- the Student-ID login resolver.
// Invokes the REAL exported handler via .run({data}) (no auth -- this function is
// intentionally callable by anyone signed out, since it runs before sign-in).
//
// Run via: firebase emulators:exec --only firestore "node functions/test/student-login.test.js"
const assert = require('assert');
const admin = require('firebase-admin');
const handlers = require('../index');

const db = admin.firestore();

async function assertHttpsError(promise, messagePattern) {
    try {
        await promise;
        assert.fail('expected the call to throw an HttpsError but it succeeded');
    } catch (error) {
        assert.strictEqual(error.code, 'not-found', `expected not-found, got "${error.code}" (${error.message})`);
        if (messagePattern) assert.match(error.message, messagePattern);
    }
}

async function main() {
    await db.collection('students').doc('login-test-uid').set({
        uid: 'login-test-uid',
        studentId: '2026/501',
        fullName: 'Amina Otieno',
        email: 'amina.login@example.com',
        program: 'Professional Makeup Artistry'
    });

    console.log('[1] No authentication is required to call this function');
    const result = await handlers.resolveStudentLoginEmail.run({ data: { studentId: '2026/501' } });
    assert.strictEqual(result.email, 'amina.login@example.com');
    console.log('  PASS: succeeded with no auth context, resolved the correct email');

    console.log('\n[2] Only email is returned -- no name, programme, or other student data leaked');
    const keys = Object.keys(result).sort();
    assert.deepStrictEqual(keys, ['email']);
    console.log(`  PASS: returned fields are exactly [${keys.join(', ')}]`);

    console.log('\n[3] Whitespace around the Student ID is tolerated');
    const padded = await handlers.resolveStudentLoginEmail.run({ data: { studentId: '  2026/501  ' } });
    assert.strictEqual(padded.email, 'amina.login@example.com');
    console.log('  PASS: leading/trailing whitespace trimmed before lookup');

    console.log('\n[4] An unknown Student ID is rejected with a generic message');
    await assertHttpsError(
        handlers.resolveStudentLoginEmail.run({ data: { studentId: '2026/999' } }),
        /No account was found/
    );
    console.log('  PASS: rejected with the generic not-found message');

    console.log('\n[5] A legacy-format Student ID also resolves correctly (existing students unaffected)');
    await db.collection('students').doc('legacy-login-uid').set({
        uid: 'legacy-login-uid',
        studentId: 'FEWA2025-042',
        fullName: 'Brian Kamau',
        email: 'brian.legacy@example.com'
    });
    const legacyResult = await handlers.resolveStudentLoginEmail.run({ data: { studentId: 'FEWA2025-042' } });
    assert.strictEqual(legacyResult.email, 'brian.legacy@example.com');
    console.log('  PASS: a student admitted under the old admission-number format can still resolve and log in');

    console.log('\n[6] Missing Student ID is rejected');
    await assertHttpsError(
        handlers.resolveStudentLoginEmail.run({ data: {} }),
        /Student ID is required/
    );
    console.log('  PASS: rejected for missing input');

    console.log('\n[7] Empty-string Student ID is rejected the same way (not treated as "match everything")');
    await assertHttpsError(
        handlers.resolveStudentLoginEmail.run({ data: { studentId: '' } }),
        /Student ID is required/
    );
    console.log('  PASS: rejected for empty input');

    console.log('\nresolveStudentLoginEmail: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

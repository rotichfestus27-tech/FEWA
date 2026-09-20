// Functional + security coverage for checkApplicationStatus (functions/index.js +
// functions/status-check-service.js) -- the new no-account status lookup.
// Invokes the REAL exported handler via .run({data}) (no auth -- this function is
// intentionally callable by anyone, protected by requiring a matching reference +
// contact detail instead).
//
// Run via: firebase emulators:exec --only firestore "node functions/test/status-check.test.js"
const assert = require('assert');
const admin = require('firebase-admin');
const handlers = require('../index');

const db = admin.firestore();

function application(uid, overrides = {}) {
    return {
        applicantUid: uid,
        applicationNumber: `FEWA-2026-${uid}`,
        status: 'Under Review',
        personalInformation: {
            firstName: 'Amina', lastName: 'Otieno',
            email: 'amina.status@example.com', phone: '0712345678'
        },
        programInformation: { program: 'Professional Makeup Artistry', intake: 'September 2026' },
        submittedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        ...overrides
    };
}

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
    const uid = 'status-check-uid';
    await db.collection('applications').doc(uid).set(application(uid));

    console.log('[1] No authentication is required to call this function');
    const byEmail = await handlers.checkApplicationStatus.run({ data: { applicationNumber: 'FEWA-2026-status-check-uid', email: 'amina.status@example.com' } });
    assert.strictEqual(byEmail.status, 'Under Review');
    console.log('  PASS: succeeded with no auth context at all');

    console.log('\n[2] Correct reference + matching PHONE also succeeds');
    const byPhone = await handlers.checkApplicationStatus.run({ data: { applicationNumber: 'FEWA-2026-status-check-uid', phone: '0712345678' } });
    assert.strictEqual(byPhone.applicationNumber, 'FEWA-2026-status-check-uid');
    assert.strictEqual(byPhone.programme, 'Professional Makeup Artistry');
    console.log('  PASS: matched by phone number, correct fields returned');

    console.log('\n[3] Correct reference but WRONG email is rejected (generic message, not "wrong email")');
    await assertHttpsError(
        handlers.checkApplicationStatus.run({ data: { applicationNumber: 'FEWA-2026-status-check-uid', email: 'someone-else@example.com' } }),
        /could not find an application/
    );
    console.log('  PASS: rejected with the generic not-found message');

    console.log('\n[4] Correct email but WRONG reference is rejected with the SAME generic message');
    await assertHttpsError(
        handlers.checkApplicationStatus.run({ data: { applicationNumber: 'FEWA-2026-999999', email: 'amina.status@example.com' } }),
        /could not find an application/
    );
    console.log('  PASS: rejected identically -- cannot be used to tell whether the reference or the contact was wrong');

    console.log('\n[5] Missing reference is rejected');
    await assertHttpsError(
        handlers.checkApplicationStatus.run({ data: { email: 'amina.status@example.com' } }),
        /reference is required/
    );
    console.log('  PASS: rejected for missing reference');

    console.log('\n[6] Missing BOTH email and phone is rejected');
    await assertHttpsError(
        handlers.checkApplicationStatus.run({ data: { applicationNumber: 'FEWA-2026-status-check-uid' } }),
        /email address or phone number/
    );
    console.log('  PASS: rejected for missing contact detail');

    console.log('\n[7] Only a minimal, safe subset of fields is returned (no personalInformation, no documents)');
    const keys = Object.keys(byEmail).sort();
    assert.deepStrictEqual(keys, ['applicationNumber', 'intake', 'programme', 'status', 'submittedAt', 'updatedAt'].sort());
    console.log(`  PASS: returned fields are exactly [${keys.join(', ')}] -- no personalInformation, identityNumber, documents, or applicantUid leaked`);

    console.log('\n[8] A different applicant\'s data is never returned even with a partially-correct guess');
    const otherUid = 'status-check-other';
    await db.collection('applications').doc(otherUid).set(application(otherUid, {
        personalInformation: { firstName: 'Brian', lastName: 'Kamau', email: 'brian.other@example.com', phone: '0799999999' }
    }));
    await assertHttpsError(
        handlers.checkApplicationStatus.run({ data: { applicationNumber: `FEWA-2026-${otherUid}`, email: 'amina.status@example.com' } }),
        /could not find an application/
    );
    console.log('  PASS: a correct reference for applicant B with applicant A\'s email is still rejected');

    console.log('\ncheckApplicationStatus: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

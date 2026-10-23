// Coverage for the acceptance-email hook (functions/admission-service.js's
// promoteAcceptedApplication calling the injected sendAcceptanceEmail) and the
// email content itself (functions/email-service.js's sendAcceptanceNotification).
// Never makes a real network call to Zoho -- verifies wiring and content only,
// using either a mock sendAcceptanceEmail or a stub transporter object.
const assert = require('assert');
const admin = require('firebase-admin');
const { promoteAcceptedApplication } = require('../admission-service');
const { sendAcceptanceNotification, createAcceptanceEmailSender, ADMISSIONS_EMAIL } = require('../email-service');

const projectId = 'fewa-acceptance-email-test';
const app = admin.initializeApp({ projectId }, 'acceptance-email-test');
const db = app.firestore();

function draftApplication(uid, overrides = {}) {
    return {
        applicantUid: uid,
        applicationNumber: 'FEWA-2026-ACCEPT' + uid.slice(-3),
        status: 'Submitted',
        submittedAt: admin.firestore.Timestamp.now(),
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
    console.log('[1] sendAcceptanceEmail is called exactly once on a genuinely new acceptance, with the application and studentId');
    const uid1 = 'accept-test-new-001';
    await db.collection('applications').doc(uid1).set(draftApplication(uid1));
    let calls = [];
    const first = await promoteAcceptedApplication({
        db, applicationId: uid1, authToken: { roles: { admissions: true } },
        sendAcceptanceEmail: async (application, studentId) => { calls.push({ application, studentId }); }
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].application.personalInformation.firstName, 'Grace');
    assert.strictEqual(calls[0].application.programInformation.program, 'Professional Makeup Artistry');
    assert.strictEqual(calls[0].studentId, first.studentId);
    console.log('  PASS: called once with the correct application data and the allocated studentId');

    console.log('\n[2] A repeat (idempotent) acceptance call does NOT send a second acceptance email');
    calls = [];
    const second = await promoteAcceptedApplication({
        db, applicationId: uid1, authToken: { roles: { admissions: true } },
        sendAcceptanceEmail: async (application, studentId) => { calls.push({ application, studentId }); }
    });
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(calls.length, 0);
    console.log('  PASS: no acceptance email attempt on an already-accepted application');

    console.log('\n[3] A sendAcceptanceEmail failure does not break the acceptance (student record already created)');
    const uid2 = 'accept-test-fail-002';
    await db.collection('applications').doc(uid2).set(draftApplication(uid2));
    const result = await promoteAcceptedApplication({
        db, applicationId: uid2, authToken: { roles: { admissions: true } },
        sendAcceptanceEmail: async () => { throw new Error('simulated SMTP outage'); }
    });
    assert.strictEqual(result.status, 'Accepted');
    const student = (await db.collection('students').doc(uid2).get()).data();
    assert.strictEqual(student.admissionStatus, 'Accepted');
    console.log('  PASS: acceptance and student record still succeed even when the acceptance email throws');

    console.log('\n[4] No sendAcceptanceEmail provided at all (backward compatible with older callers/tests)');
    const uid3 = 'accept-test-none-003';
    await db.collection('applications').doc(uid3).set(draftApplication(uid3));
    const result2 = await promoteAcceptedApplication({ db, applicationId: uid3, authToken: { roles: { admissions: true } } });
    assert.strictEqual(result2.status, 'Accepted');
    console.log('  PASS: acceptance succeeds with no sendAcceptanceEmail argument at all');

    console.log('\n[5] createAcceptanceEmailSender fails FAST (no real network attempt) when credentials are missing');
    const sender = createAcceptanceEmailSender(undefined, undefined);
    const start = Date.now();
    await assert.rejects(sender(draftApplication('x'), '2026/099'), /not configured/);
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 2000, `expected a fast rejection, took ${elapsedMs}ms`);
    console.log(`  PASS: rejected in ${elapsedMs}ms with a clear "not configured" error, no SMTP connection attempted`);

    console.log('\n[6] The acceptance email contains applicant name, programme, intake, application number, and Student ID');
    let captured = null;
    const stubTransporter = { sendMail: async (mailOptions) => { captured = mailOptions; } };
    const testApplication = draftApplication('content-check');
    await sendAcceptanceNotification(stubTransporter, testApplication, '2026/042');
    assert.strictEqual(captured.from, `"FEWA Beauty & Fashion College" <${ADMISSIONS_EMAIL}>`);
    assert.strictEqual(captured.to, testApplication.personalInformation.email);
    assert.strictEqual(captured.subject, 'FEWA Application Accepted – Your Official Acceptance Letter');
    for (const expected of ['Grace Njeri', 'Professional Makeup Artistry', 'September 2026', testApplication.applicationNumber, '2026/042']) {
        assert.ok(captured.html.includes(expected), `expected HTML body to include "${expected}"`);
        assert.ok(captured.text.includes(expected), `expected plain-text body to include "${expected}"`);
    }
    assert.ok(captured.html.includes('Next Steps') || captured.html.includes('Next Steps'.toUpperCase()) || /next steps/i.test(captured.html), 'expected next-steps guidance');
    assert.ok(captured.html.includes(ADMISSIONS_EMAIL), 'expected FEWA contact details');
    assert.ok(captured.html.includes('portal.html'), 'expected a Student Portal link');
    assert.ok(captured.html.includes('FEWA Admissions Team'), 'expected the FEWA Admissions Team signature');
    console.log('  PASS: subject line, applicant name, programme, intake, application number, Student ID, next steps, contact details, portal link, and signature are all present');

    console.log('\nacceptance-email integration: PASS');
    await app.delete();
}

main().catch(async error => {
    console.error(error.message);
    await app.delete();
    process.exit(1);
});

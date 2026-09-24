const assert = require('assert');
const admin = require('firebase-admin');
const { promoteAcceptedApplication } = require('../admission-service');

const projectId = 'fewa-promotion-test';
const app = admin.initializeApp({ projectId }, 'promotion-tests');
const db = app.firestore();

function application(uid, status = 'Submitted') {
    return {
        applicantUid: uid,
        applicationNumber: 'FEWA-2026-000101',
        status,
        submittedAt: admin.firestore.Timestamp.now(),
        personalInformation: {
            firstName: 'Amina',
            lastName: 'Applicant',
            email: 'amina.qa@example.com',
            phone: '+254700000001',
            identityNumber: 'QA-001',
            emergencyName: 'QA Contact',
            emergencyPhone: '+254700000002',
            emergencyRelationship: 'Parent'
        },
        academicInformation: { educationLevel: 'KCSE', institution: 'QA School', yearCompleted: '2025' },
        programInformation: { program: 'Cosmetology & Advanced Beauty Therapy', intake: 'September 2026' },
        documents: [{ name: 'one' }, { name: 'two' }, { name: 'three' }],
        additionalInformation: { declaration: true },
        progress: { percentage: 100, completedSections: 5, currentStep: 6 },
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
    };
}

async function main() {
    const uid = 'qa-applicant-promotion';
    const applicationRef = db.collection('applications').doc(uid);
    const studentRef = db.collection('students').doc(uid);
    const notificationRef = applicationRef.collection('notifications').doc('accepted');

    // A pre-existing student admitted under the old "FEWA{year}-{seq}" format,
    // proving it (a) is never rewritten and (b) still counts toward the next
    // sequence number so a freshly-admitted student can never collide with it.
    await db.collection('students').doc('existing-seed').set({
        uid: 'existing-seed',
        studentId: 'FEWA2026-001',
        fullName: 'Existing Seed'
    });
    await applicationRef.set(application(uid));
    await assert.rejects(
        promoteAcceptedApplication({ db, applicationId: uid, authToken: {} }),
        /not authorized/
    );
    assert.strictEqual((await applicationRef.get()).data().status, 'Submitted');

    const first = await promoteAcceptedApplication({ db, applicationId: uid, authToken: { roles: { admissions: true } } });
    // Legacy seed above already occupies sequence 001 for 2026, so the first
    // student admitted under the new format must be 002, not 001.
    assert.strictEqual(first.studentId, '2026/002');
    assert.strictEqual((await applicationRef.get()).data().status, 'Accepted');
    const student = (await studentRef.get()).data();
    assert.deepStrictEqual({
        uid: student.uid,
        studentId: student.studentId,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        program: student.program,
        intake: student.intake,
        admissionStatus: student.admissionStatus,
        applicationNumber: student.applicationNumber,
        sourceApplicationId: student.sourceApplicationId
    }, {
        uid,
        studentId: first.studentId,
        fullName: 'Amina Applicant',
        email: 'amina.qa@example.com',
        phone: '+254700000001',
        program: 'Cosmetology & Advanced Beauty Therapy',
        intake: 'September 2026',
        admissionStatus: 'Accepted',
        applicationNumber: 'FEWA-2026-000101',
        sourceApplicationId: uid
    });
    await studentRef.set({ results: [{ grade: 'A' }], fees: { status: 'paid' } }, { merge: true });

    const second = await promoteAcceptedApplication({ db, applicationId: uid, authToken: { roles: ['admin'] } });
    assert.strictEqual(second.studentId, first.studentId);
    assert.deepStrictEqual((await studentRef.get()).data().results, [{ grade: 'A' }]);
    assert.deepStrictEqual((await studentRef.get()).data().fees, { status: 'paid' });
    assert.strictEqual((await notificationRef.get()).exists, true);

    const draftUid = 'qa-draft-promotion';
    await db.collection('applications').doc(draftUid).set(application(draftUid, 'Draft'));
    await assert.rejects(
        promoteAcceptedApplication({ db, applicationId: draftUid, authToken: { roles: { admin: true } } }),
        /submitted or under-review/
    );
    assert.strictEqual((await db.collection('students').doc(draftUid).get()).exists, false);

    const rejectedUid = 'qa-rejected-promotion';
    await db.collection('applications').doc(rejectedUid).set(application(rejectedUid, 'Rejected'));
    await assert.rejects(
        promoteAcceptedApplication({ db, applicationId: rejectedUid, authToken: { roles: { admin: true } } }),
        /submitted or under-review/
    );
    assert.strictEqual((await db.collection('students').doc(rejectedUid).get()).exists, false);

    const incompleteUid = 'qa-incomplete-promotion';
    const incomplete = application(incompleteUid);
    incomplete.personalInformation.phone = '';
    await db.collection('applications').doc(incompleteUid).set(incomplete);
    await assert.rejects(
        promoteAcceptedApplication({ db, applicationId: incompleteUid, authToken: { roles: { admin: true } } }),
        /Applicant phone is required/
    );
    assert.strictEqual((await db.collection('applications').doc(incompleteUid).get()).data().status, 'Submitted');

    const superadminUid = 'qa-superadmin-promotion';
    await db.collection('applications').doc(superadminUid).set(application(superadminUid));
    const superadminResult = await promoteAcceptedApplication({ db, applicationId: superadminUid, authToken: { roles: { superadmin: true } } });
    assert.strictEqual(superadminResult.status, 'Accepted');

    const conflictUid = 'qa-conflict-promotion';
    await db.collection('applications').doc(conflictUid).set(application(conflictUid));
    await db.collection('students').doc(conflictUid).set({ uid: conflictUid, email: 'different@example.com', studentId: 'FEWA2026-999' });
    await assert.rejects(
        promoteAcceptedApplication({ db, applicationId: conflictUid, authToken: { roles: { superadmin: true } } }),
        /conflicting email/
    );
    assert.strictEqual((await db.collection('applications').doc(conflictUid).get()).data().status, 'Submitted');

    console.log('admission promotion service: PASS');
    await app.delete();
}

main().catch(async error => {
    console.error(error.message);
    await app.delete();
    process.exit(1);
});

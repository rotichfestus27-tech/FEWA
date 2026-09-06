const fs = require('fs');
const assert = require('assert');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { serverTimestamp } = require('firebase/firestore');

const PROJECT_ID = 'fewa-rules-test';

async function main() {
    // Load rules from workspace
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules }
    });

    const tests = buildTests(testEnv);

    let failures = 0;

    for (const t of tests) {
        process.stdout.write(`Running: ${t.name} ... `);
        try {
            await t.run();
            console.log('PASS');
        } catch (err) {
            if (t.expect === 'DENY') {
                console.log('PASS');
            } else {
                console.log('FAIL (expected ALLOW)');
                console.error(err && err.message ? err.message : err);
                failures++;
            }
        }
    }

    await testEnv.clearFirestore();
    await testEnv.cleanup();

    if (failures > 0) {
        console.error(`\n${failures} test(s) failed.`);
        process.exit(1);
    } else {
        console.log('\nAll tests passed.');
        process.exit(0);
    }
}

function buildTests(env) {
    const now = new Date();

    // helpers to create contexts
    const unauth = () => env.unauthenticatedContext().firestore();
    const auth = (uid, token) => env.authenticatedContext({ uid, token: token || {} }).firestore();
    const adminDb = () => auth('admin', { roles: { superadmin: true } });

    return [
        // 1
        {
            name: '1 - Unauthenticated valid application',
            expect: 'ALLOW',
            run: async () => {
                const db = unauth();
                await assertSucceeds(db.collection('applications').doc('app1').set({
                    applicationNumber: 'FEWA-2026-00001',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    personalInformation: {
                        firstName: 'Amina',
                        lastName: 'Okoth',
                        email: 'amina@example.com',
                        phone: '+254712345678'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Cosmetology & Advanced Beauty Therapy',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test motivation'
                    }
                }));
            }
        },

        // 2
        {
            name: '2 - Unauthenticated application with isAdmin',
            expect: 'DENY',
            run: async () => {
                const db = unauth();
                await assertFails(db.collection('applications').doc('app2').set({
                    applicationNumber: 'FEWA-2026-00002',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    personalInformation: {
                        firstName: 'Malik',
                        lastName: 'Test',
                        email: 'malik@example.com',
                        phone: '+254700000000'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Fashion Design & Creative Garment Styling',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test'
                    },
                    isAdmin: true
                }));
            }
        },

        // 3
        {
            name: '3 - Unauthenticated application with admissionStatus',
            expect: 'DENY',
            run: async () => {
                const db = unauth();
                await assertFails(db.collection('applications').doc('app3').set({
                    applicationNumber: 'FEWA-2026-00003',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    personalInformation: {
                        firstName: 'Sara',
                        lastName: 'Test',
                        email: 'sara@example.com',
                        phone: '+254733333333'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Cosmetology & Advanced Beauty Therapy',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test'
                    },
                    admissionStatus: 'accepted'
                }));
            }
        },

        // 4
        {
            name: '4 - Unauthenticated application with studentId',
            expect: 'DENY',
            run: async () => {
                const db = unauth();
                await assertFails(db.collection('applications').doc('app4').set({
                    applicationNumber: 'FEWA-2026-00004',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    personalInformation: {
                        firstName: 'John',
                        lastName: 'Doe',
                        email: 'john@example.com',
                        phone: '+254711111111'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Professional Hairdressing & Trichology',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test'
                    },
                    studentId: 'FEWA2026-001'
                }));
            }
        },

        // 5
        {
            name: '5 - Authenticated applicant reading own application',
            expect: 'ALLOW',
            run: async () => {
                const ownerUid = 'uid-app-1';
                // create doc as admin (setup resource)
                const admin = adminDb();
                await admin.collection('applications').doc('appOwned').set({
                    applicationNumber: 'FEWA-2026-00005',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    applicantUid: ownerUid,
                    personalInformation: {
                        firstName: 'Owner',
                        lastName: 'Test',
                        email: 'owner@test.com',
                        phone: '+254700000000'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Cosmetology & Advanced Beauty Therapy',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test'
                    }
                });

                const db = auth(ownerUid);
                await assertSucceeds(db.collection('applications').doc('appOwned').get());
            }
        },

        // 6
        {
            name: "6 - Applicant reading another's application",
            expect: 'DENY',
            run: async () => {
                const db = auth('uid-app-2');
                await assertFails(db.collection('applications').doc('appOwned').get());
            }
        },

        // 7
        {
            name: '7 - Student reading own profile',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'student-123';
                const admin = adminDb();
                await admin.collection('students').doc(uid).set({ fullName: 'Me', phone: '0712000000' });

                const db = auth(uid);
                await assertSucceeds(db.collection('students').doc(uid).get());
            }
        },

        // 8
        {
            name: "8 - Student reading another student's profile",
            expect: 'DENY',
            run: async () => {
                const db = auth('student-123');
                await assertFails(db.collection('students').doc('student-456').get());
            }
        },

        // 9
        {
            name: '9 - Student changing their phone number',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'student-123';
                const db = auth(uid);
                // existing doc created earlier
                await assertSucceeds(db.collection('students').doc(uid).update({ phone: '0712111111' }));
            }
        },

        // 10
        {
            name: '10 - Student changing their programme',
            expect: 'DENY',
            run: async () => {
                const uid = 'student-123';
                const db = auth(uid);
                await assertFails(db.collection('students').doc(uid).update({ program: 'Fashion' }));
            }
        },

        // 11
        {
            name: '11 - Student changing their fees',
            expect: 'DENY',
            run: async () => {
                const uid = 'student-123';
                const db = auth(uid);
                await assertFails(db.collection('students').doc(uid).update({ fees: { balance: 100 } }));
            }
        },

        // 12
        {
            name: '12 - Student changing their results',
            expect: 'DENY',
            run: async () => {
                const uid = 'student-123';
                const db = auth(uid);
                await assertFails(db.collection('students').doc(uid).update({ results: { exam: 80 } }));
            }
        },

        // 13
        {
            name: '13 - Lecturer reading student results',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'student-123';
                // create a result doc as admin
                const admin = adminDb();
                await admin.collection('students').doc(uid).collection('results').doc('result1').set({ score: 75 });

                const db = auth('lect-1', { roles: { lecturer: true } });
                await assertSucceeds(db.collection('students').doc(uid).collection('results').doc('result1').get());
            }
        },

        // 14
        {
            name: '14 - Lecturer modifying results',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'student-123';
                const db = auth('lect-1', { roles: { lecturer: true } });
                await assertSucceeds(db.collection('students').doc(uid).collection('results').doc('result2').set({ score: 82, course: 'Anatomy', createdAt: now }));
            }
        },

        // 15
        {
            name: '15 - Finance staff modifying fees',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'student-123';
                const db = auth('fin-1', { roles: { finance: true } });
                await assertSucceeds(db.collection('students').doc(uid).collection('fees').doc('fee1').set({ amountDue: 5000, status: 'invoiced' }));
            }
        },

        // 16
        {
            name: '16 - Admissions staff managing applications',
            expect: 'ALLOW',
            run: async () => {
                const db = auth('adm-1', { roles: { admissions: true } });
                await assertSucceeds(db.collection('applications').doc('app1-admin').set({
                    applicationNumber: 'FEWA-2026-00016',
                    status: 'Submitted',
                    submittedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    personalInformation: {
                        firstName: 'Applicant',
                        lastName: 'Test',
                        email: 'applicant@test.com',
                        phone: '+254700000000'
                    },
                    academicInformation: {
                        educationLevel: 'KCSE'
                    },
                    programInformation: {
                        program: 'Cosmetology & Advanced Beauty Therapy',
                        intake: '2026 May'
                    },
                    documents: [],
                    additionalInformation: {
                        motivation: 'Test'
                    }
                }));
                await assertSucceeds(db.collection('applications').doc('app1-admin').update({ status: 'Under Review', updatedAt: serverTimestamp() }));
                await assertFails(db.collection('applications').doc('app1-admin').update({ status: 'Accepted', updatedAt: serverTimestamp() }));
            }
        },

        // 17
        {
            name: '17 - Ordinary student trying to manage applications',
            expect: 'DENY',
            run: async () => {
                const db = auth('student-123');
                await assertFails(db.collection('applications').doc('app1-admin').delete());
            }
        },

        // 18
        {
            name: '18 - Unauthenticated user reading private student data',
            expect: 'DENY',
            run: async () => {
                const db = unauth();
                await assertFails(db.collection('students').doc('student-123').get());
            }
        },

        // 19
        {
            name: '19 - Public reading programmes/news/events',
            expect: 'ALLOW',
            run: async () => {
                const admin = adminDb();
                await admin.collection('programmes').doc('prog1').set({ title: 'Cosmetology' });
                await admin.collection('news').doc('news1').set({ title: 'Open Day' });
                await admin.collection('events').doc('event1').set({ title: 'Workshop' });

                const db = unauth();
                await assertSucceeds(db.collection('programmes').doc('prog1').get());
                await assertSucceeds(db.collection('news').doc('news1').get());
                await assertSucceeds(db.collection('events').doc('event1').get());
            }
        },

        // 20
        {
            name: '20 - Unknown collection access',
            expect: 'DENY',
            run: async () => {
                const db = unauth();
                await assertFails(db.collection('some_unknown_collection').doc('doc1').get());
            }
        },
        {
            name: '21 - Student reads own assignment',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-123').collection('assignments').doc('assignment-1').set({ title: 'Portfolio' }));
                await assertSucceeds(auth('student-123').collection('students').doc('student-123').collection('assignments').doc('assignment-1').get());
            }
        },
        {
            name: '22 - Student cannot modify assignment',
            expect: 'DENY',
            run: async () => assertFails(auth('student-123').collection('students').doc('student-123').collection('assignments').doc('assignment-1').update({ title: 'Changed' }))
        },
        {
            name: '23 - Student cannot read another submission',
            expect: 'DENY',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-456').collection('submissions').doc('submission-1').set({ studentUid: 'student-456', assignmentId: 'assignment-1', status: 'Submitted' }));
                await assertFails(auth('student-123').collection('students').doc('student-456').collection('submissions').doc('submission-1').get());
            }
        },
        {
            name: '24 - Student cannot modify another submission',
            expect: 'DENY',
            run: async () => assertFails(auth('student-123').collection('students').doc('student-456').collection('submissions').doc('submission-1').update({ status: 'Submitted' }))
        },
        {
            name: '25 - Student reads own attendance only',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-123').collection('attendance').doc('attendance-1').set({ status: 'Present' }));
                await assertSucceeds(auth('student-123').collection('students').doc('student-123').collection('attendance').doc('attendance-1').get());
                await assertFails(auth('student-123').collection('students').doc('student-123').collection('attendance').doc('attendance-1').update({ status: 'Absent' }));
            }
        },
        {
            name: '26 - Student cannot read another attendance record',
            expect: 'DENY',
            run: async () => assertFails(auth('student-123').collection('students').doc('student-456').collection('attendance').doc('attendance-1').get())
        },
        {
            name: '27 - Student can mark own notification read',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-123').collection('notifications').doc('notification-1').set({ read: false }));
                await assertSucceeds(auth('student-123').collection('students').doc('student-123').collection('notifications').doc('notification-1').update({ read: true }));
            }
        },
        {
            name: '28 - Student cannot read another document',
            expect: 'DENY',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-456').collection('documents').doc('document-1').set({ name: 'Letter' }));
                await assertFails(auth('student-123').collection('students').doc('student-456').collection('documents').doc('document-1').get());
            }
        },
        {
            name: '29 - Student reads own message',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(adminDb().collection('students').doc('student-123').collection('messages').doc('message-1').set({ read: false }));
                await assertSucceeds(auth('student-123').collection('students').doc('student-123').collection('messages').doc('message-1').get());
            }
        },
        {
            name: '30 - Student cannot read another message',
            expect: 'DENY',
            run: async () => assertFails(auth('student-123').collection('students').doc('student-456').collection('messages').doc('message-1').get())
        },
        {
            name: '31 - Flat superadmin claim does not grant admin access',
            expect: 'DENY',
            run: async () => assertFails(auth('flat-claim-user', { superadmin: true }).collection('assignments').doc('flat-claim-assignment').set({ title: 'Unauthorized', status: 'Published' }))
        },
        {
            name: '32 - Array superadmin claim grants admin access',
            expect: 'ALLOW',
            run: async () => assertSucceeds(auth('array-admin', { roles: ['superadmin'] }).collection('assignments').doc('array-assignment').set({ title: 'Authorized', status: 'Published' }))
        },
        {
            name: '33 - Student cannot write users profile',
            expect: 'DENY',
            run: async () => assertFails(auth('student-123').collection('users').doc('student-123').set({ role: 'superadmin' }))
        }
    ];
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

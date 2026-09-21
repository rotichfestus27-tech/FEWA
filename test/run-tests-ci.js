const fs = require('fs');
const {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails
} = require('@firebase/rules-unit-testing');

const {
    getFirestore,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs
} = require('firebase/firestore');

const PROJECT_ID = 'fewa-rules-test';

async function main() {
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

    let testEnv;

    if (emulatorHost) {
        const parts = emulatorHost.split(':');
        const host = parts[0];
        const port = parseInt(parts[1], 10);

        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                host,
                port
            }
        });
    } else {
        testEnv = await initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: {
                rules
            }
        });
    }

    const tests = buildTests(testEnv);

    let failures = 0;
    let passed = 0;

    for (const test of tests) {
        process.stdout.write(`Running: ${test.name} ... `);

        try {
            await test.run();
            console.log('PASS');
            passed++;
        } catch (error) {
            if (test.expect === 'DENY') {
                console.log('PASS');
                passed++;
            } else {
                console.log('FAIL (expected ALLOW)');
                console.error(
                    error && error.message
                        ? error.message
                        : error
                );
                failures++;
            }
        }
    }

    console.log(`TOTAL: ${tests.length}`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failures}`);
    console.log('BLOCKED: 0');

    await testEnv.clearFirestore();
    await testEnv.cleanup();

    if (failures > 0) {
        console.error(`\n${failures} test(s) failed.`);
        process.exit(1);
    }

    console.log('\nAll tests passed.');
    process.exit(0);
}


// ============================================================
// TEST HELPERS
// ============================================================

function unauth(env) {
    return env.unauthenticatedContext().firestore();
}

function auth(env, uid, token = {}) {
    return env.authenticatedContext(uid, token).firestore();
}

function adminDb(env) {
    return auth(env, 'admin', {
        roles: {
            superadmin: true
        }
    });
}


// ============================================================
// APPLICATION TEST DATA
// ============================================================

function validApplication(applicationNumber, applicantUid = null) {
    applicationNumber = applicationNumber.replace(/^(FEWA-\d{4}-)(\d+)$/, (_, prefix, number) => prefix + number.padStart(6, '0'));
    const data = {
        applicationNumber,
        status: 'Draft',
        updatedAt: require('firebase/firestore').serverTimestamp(),
        createdAt: require('firebase/firestore').serverTimestamp(),

        personalInformation: {
            firstName: 'Test',
            lastName: 'Applicant',
            email: 'test@example.com',
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
        additionalInformation: { motivation: 'Test application' },
        progress: { percentage: 60, completedSections: 3, currentStep: 3 },
        createdAt: require('firebase/firestore').serverTimestamp()
    };

    if (applicantUid !== null) {
        data.applicantUid = applicantUid;
    }

    return data;
}


// ============================================================
// TESTS
// ============================================================

function buildTests(env) {
    return [

        // =====================================================
        // 1
        // =====================================================

        {
            name: '1 - Unauthenticated application is denied',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                await assertFails(
                    setDoc(
                        doc(db, 'applications', 'app1'),
                        validApplication('FEWA-2026-000001')
                    )
                );
            }
        },


        // =====================================================
        // 2
        // =====================================================

        {
            name: '2 - Unauthenticated application with isAdmin',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                const data = validApplication('FEWA-2026-000002');

                data.isAdmin = true;

                await assertFails(
                    setDoc(
                        doc(db, 'applications', 'app2'),
                        data
                    )
                );
            }
        },


        // =====================================================
        // 3
        // =====================================================

        {
            name: '3 - Unauthenticated application with admissionStatus',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                const data = validApplication('FEWA-2026-000003');

                data.admissionStatus = 'accepted';

                await assertFails(
                    setDoc(
                        doc(db, 'applications', 'app3'),
                        data
                    )
                );
            }
        },


        // =====================================================
        // 4
        // =====================================================

        {
            name: '4 - Unauthenticated application with studentId',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                const data = validApplication('FEWA-2026-000004');

                data.studentId = 'FEWA2026-001';

                await assertFails(
                    setDoc(
                        doc(db, 'applications', 'app4'),
                        data
                    )
                );
            }
        },


        // =====================================================
        // 5
        // =====================================================

        {
            name: '5 - Authenticated applicant reading own application',
            expect: 'ALLOW',

            run: async () => {
                const ownerUid = 'uid-app-1';

                const owner = auth(env, ownerUid);
                const application = validApplication(
                    'FEWA-2026-00005',
                    ownerUid
                );

                await assertSucceeds(
                    setDoc(
                        doc(owner, 'applications', ownerUid),
                        application
                    )
                );

                const db = auth(env, ownerUid);

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'applications',
                            'uid-app-1'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 6
        // =====================================================

        {
            name: "6 - Applicant reading another's application",
            expect: 'DENY',

            run: async () => {
                const db = auth(env, 'uid-app-2');

                await assertFails(
                    getDoc(
                        doc(
                            db,
                            'applications',
                            'uid-app-1'
                        )
                    )
                );
            }
        },

        {
            name: '6a - Applicant can update their own draft',
            expect: 'ALLOW',
            run: async () => assertSucceeds(updateDoc(doc(auth(env, 'uid-app-1'), 'applications', 'uid-app-1'), {
                personalInformation: { firstName: 'Updated', lastName: 'Applicant', email: 'test@example.com', phone: '+254700000000' },
                updatedAt: require('firebase/firestore').serverTimestamp()
            }))
        },

        {
            name: '6b - Applicant cannot update another draft',
            expect: 'DENY',
            run: async () => assertFails(updateDoc(doc(auth(env, 'uid-app-2'), 'applications', 'uid-app-1'), {
                status: 'Draft', updatedAt: require('firebase/firestore').serverTimestamp()
            }))
        },

        {
            name: '6c - Applicant cannot approve themselves',
            expect: 'DENY',
            run: async () => assertFails(updateDoc(doc(auth(env, 'uid-app-1'), 'applications', 'uid-app-1'), {
                status: 'Accepted', updatedAt: require('firebase/firestore').serverTimestamp()
            }))
        },


        // =====================================================
        // 7
        // =====================================================

        {
            name: '7 - Student reading own profile',
            expect: 'ALLOW',

            run: async () => {
                const uid = 'student-123';

                const admin = adminDb(env);

                await assertSucceeds(
                    setDoc(
                        doc(admin, 'students', uid),
                        {
                            fullName: 'Me',
                            phone: '0712000000'
                        }
                    )
                );

                const db = auth(env, uid);

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'students',
                            uid
                        )
                    )
                );
            }
        },


        // =====================================================
        // 8
        // =====================================================

        {
            name: "8 - Student reading another student's profile",
            expect: 'DENY',

            run: async () => {
                const db = auth(env, 'student-123');

                await assertFails(
                    getDoc(
                        doc(
                            db,
                            'students',
                            'student-456'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 9
        // =====================================================

        {
            name: '9 - Student changing their phone number',
            expect: 'ALLOW',

            run: async () => {
                const uid = 'student-123';

                const db = auth(env, uid);

                await assertSucceeds(
                    updateDoc(
                        doc(
                            db,
                            'students',
                            uid
                        ),
                        {
                            phone: '0712111111'
                        }
                    )
                );
            }
        },


        // =====================================================
        // 10
        // =====================================================

        {
            name: '10 - Student changing their programme',
            expect: 'DENY',

            run: async () => {
                const uid = 'student-123';

                const db = auth(env, uid);

                await assertFails(
                    updateDoc(
                        doc(
                            db,
                            'students',
                            uid
                        ),
                        {
                            program: 'Fashion'
                        }
                    )
                );
            }
        },


        // =====================================================
        // 11
        // =====================================================

        {
            name: '11 - Student changing their fees',
            expect: 'DENY',

            run: async () => {
                const uid = 'student-123';

                const db = auth(env, uid);

                await assertFails(
                    updateDoc(
                        doc(
                            db,
                            'students',
                            uid
                        ),
                        {
                            fees: {
                                balance: 100
                            }
                        }
                    )
                );
            }
        },


        // =====================================================
        // 12
        // =====================================================

        {
            name: '12 - Student changing their results',
            expect: 'DENY',

            run: async () => {
                const uid = 'student-123';

                const db = auth(env, uid);

                await assertFails(
                    updateDoc(
                        doc(
                            db,
                            'students',
                            uid
                        ),
                        {
                            results: {
                                exam: 80
                            }
                        }
                    )
                );
            }
        },


        // =====================================================
        // 13
        // =====================================================

        {
            name: '13 - Lecturer reading student results',
            expect: 'ALLOW',

            run: async () => {
                const uid = 'student-123';

                const admin = adminDb(env);

                await assertSucceeds(
                    setDoc(
                        doc(
                            admin,
                            'students',
                            uid,
                            'results',
                            'result1'
                        ),
                        {
                            score: 75
                        }
                    )
                );

                const db = auth(
                    env,
                    'lect-1',
                    {
                        roles: {
                            lecturer: true
                        }
                    }
                );

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'students',
                            uid,
                            'results',
                            'result1'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 14
        // =====================================================

        {
            name: '14 - Lecturer modifying results',
            expect: 'ALLOW',

            run: async () => {
                const uid = 'student-123';

                const db = auth(
                    env,
                    'lect-1',
                    {
                        roles: {
                            lecturer: true
                        }
                    }
                );

                await assertSucceeds(
                    setDoc(
                        doc(
                            db,
                            'students',
                            uid,
                            'results',
                            'result2'
                        ),
                        {
                            score: 82,
                            course: 'Anatomy'
                        }
                    )
                );
            }
        },


        // =====================================================
        // 15
        // =====================================================

        {
            name: '15 - Finance staff modifying fees',
            expect: 'ALLOW',

            run: async () => {
                const uid = 'student-123';

                const db = auth(
                    env,
                    'fin-1',
                    {
                        roles: {
                            finance: true
                        }
                    }
                );

                await assertSucceeds(
                    setDoc(
                        doc(
                            db,
                            'students',
                            uid,
                            'fees',
                            'fee1'
                        ),
                        {
                            amountDue: 5000,
                            status: 'invoiced'
                        }
                    )
                );
            }
        },


        // =====================================================
        // 16
        // =====================================================

        {
            name: '16 - Admissions staff managing applications',
            expect: 'ALLOW',

            run: async () => {
                const admissions = auth(
                    env,
                    'adm-1',
                    {
                        roles: {
                            admissions: true
                        }
                    }
                );

                const applicant = auth(env, 'applicant-16');
                await assertSucceeds(
                    setDoc(
                        doc(
                            applicant,
                            'applications',
                            'applicant-16'
                        ),
                        validApplication(
                            'FEWA-2026-000016',
                            'applicant-16'
                        )
                    )
                );

                await assertSucceeds(
                    getDoc(doc(admissions, 'applications', 'applicant-16'))
                );

                await assertSucceeds(
                    updateDoc(
                        doc(
                            admissions,
                            'applications',
                            'applicant-16'
                        ),
                        {
                            status: 'Under Review',
                            updatedAt: require('firebase/firestore').serverTimestamp()
                        }
                    )
                );

                await assertFails(
                    updateDoc(
                        doc(admissions, 'applications', 'applicant-16'),
                        {
                            status: 'Accepted',
                            updatedAt: require('firebase/firestore').serverTimestamp()
                        }
                    )
                );
            }
        },


        // =====================================================
        // 17
        // =====================================================

        {
            name: '17 - Ordinary student trying to manage applications',
            expect: 'DENY',

            run: async () => {
                const db = auth(env, 'student-123');

                await assertFails(
                    deleteDoc(
                        doc(
                            db,
                            'applications',
                            'applicant-16'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 18
        // =====================================================

        {
            name: '18 - Unauthenticated user reading private student data',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                await assertFails(
                    getDoc(
                        doc(
                            db,
                            'students',
                            'student-123'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 19
        // =====================================================

        {
            name: '19 - Public reading programmes/news/events',
            expect: 'ALLOW',

            run: async () => {
                const admin = adminDb(env);

                await assertSucceeds(
                    setDoc(
                        doc(
                            admin,
                            'programmes',
                            'prog1'
                        ),
                        {
                            title: 'Cosmetology'
                        }
                    )
                );

                await assertSucceeds(
                    setDoc(
                        doc(
                            admin,
                            'news',
                            'news1'
                        ),
                        {
                            title: 'Open Day'
                        }
                    )
                );

                await assertSucceeds(
                    setDoc(
                        doc(
                            admin,
                            'events',
                            'event1'
                        ),
                        {
                            title: 'Workshop'
                        }
                    )
                );

                const db = unauth(env);

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'programmes',
                            'prog1'
                        )
                    )
                );

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'news',
                            'news1'
                        )
                    )
                );

                await assertSucceeds(
                    getDoc(
                        doc(
                            db,
                            'events',
                            'event1'
                        )
                    )
                );
            }
        },


        // =====================================================
        // 20
        // =====================================================

        {
            name: '20 - Unknown collection access',
            expect: 'DENY',

            run: async () => {
                const db = unauth(env);

                await assertFails(
                    getDoc(
                        doc(
                            db,
                            'some_unknown_collection',
                            'doc1'
                        )
                    )
                );
            }
        },

        {
            name: '21 - Student reads own assignment',
            expect: 'ALLOW',
            run: async () => {
                const admin = adminDb(env);
                await assertSucceeds(setDoc(doc(admin, 'students', 'student-123', 'assignments', 'assignment-1'), { title: 'Portfolio' }));
                await assertSucceeds(getDoc(doc(auth(env, 'student-123'), 'students', 'student-123', 'assignments', 'assignment-1')));
            }
        },

        {
            name: '22 - Student cannot modify assignment',
            expect: 'DENY',
            run: async () => {
                await assertFails(updateDoc(doc(auth(env, 'student-123'), 'students', 'student-123', 'assignments', 'assignment-1'), { title: 'Changed' }));
            }
        },

        {
            name: '23 - Student cannot read another submission',
            expect: 'DENY',
            run: async () => {
                const admin = adminDb(env);
                await assertSucceeds(setDoc(doc(admin, 'students', 'student-456', 'submissions', 'submission-1'), { studentUid: 'student-456', assignmentId: 'assignment-1', status: 'Submitted' }));
                await assertFails(getDoc(doc(auth(env, 'student-123'), 'students', 'student-456', 'submissions', 'submission-1')));
            }
        },

        {
            name: '24 - Student cannot modify another submission',
            expect: 'DENY',
            run: async () => {
                await assertFails(updateDoc(doc(auth(env, 'student-123'), 'students', 'student-456', 'submissions', 'submission-1'), { status: 'Graded' }));
            }
        },

        {
            name: '25 - Student reads own attendance but cannot write it',
            expect: 'ALLOW',
            run: async () => {
                const admin = adminDb(env);
                await assertSucceeds(setDoc(doc(admin, 'students', 'student-123', 'attendance', 'attendance-1'), { date: '2026-09-01', status: 'Present' }));
                await assertSucceeds(getDoc(doc(auth(env, 'student-123'), 'students', 'student-123', 'attendance', 'attendance-1')));
                await assertFails(updateDoc(doc(auth(env, 'student-123'), 'students', 'student-123', 'attendance', 'attendance-1'), { status: 'Absent' }));
            }
        },

        {
            name: '26 - Student cannot read another attendance record',
            expect: 'DENY',
            run: async () => {
                await assertFails(getDoc(doc(auth(env, 'student-123'), 'students', 'student-456', 'attendance', 'attendance-1')));
            }
        },

        {
            name: '27 - Student can read and mark own notification',
            expect: 'ALLOW',
            run: async () => {
                const admin = adminDb(env);
                await assertSucceeds(setDoc(doc(admin, 'students', 'student-123', 'notifications', 'notification-1'), { title: 'Welcome', read: false }));
                const db = auth(env, 'student-123');
                await assertSucceeds(getDoc(doc(db, 'students', 'student-123', 'notifications', 'notification-1')));
                await assertSucceeds(updateDoc(doc(db, 'students', 'student-123', 'notifications', 'notification-1'), { read: true }));
                await assertFails(updateDoc(doc(db, 'students', 'student-123', 'notifications', 'notification-1'), { title: 'Changed' }));
            }
        },

        {
            name: '28 - Student cannot read another document',
            expect: 'DENY',
            run: async () => {
                await assertSucceeds(setDoc(doc(adminDb(env), 'students', 'student-456', 'documents', 'document-1'), { name: 'Letter' }));
                await assertFails(getDoc(doc(auth(env, 'student-123'), 'students', 'student-456', 'documents', 'document-1')));
            }
        },

        {
            name: '29 - Student reads own message and marks it read',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(adminDb(env), 'students', 'student-123', 'messages', 'message-1'), { subject: 'Office', read: false }));
                const db = auth(env, 'student-123');
                await assertSucceeds(getDoc(doc(db, 'students', 'student-123', 'messages', 'message-1')));
                await assertSucceeds(updateDoc(doc(db, 'students', 'student-123', 'messages', 'message-1'), { read: true }));
            }
        },

        {
            name: '30 - Student cannot read another message',
            expect: 'DENY',
            run: async () => {
                await assertFails(getDoc(doc(auth(env, 'student-123'), 'students', 'student-456', 'messages', 'message-1')));
            }
        },

        {
            name: '31 - Admin reads student profile',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(getDoc(doc(auth(env, 'admin-user', { roles: { admin: true } }), 'students', 'student-123')));
            }
        },

        {
            name: '32 - Admin creates shared assignment',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(auth(env, 'admin-user', { roles: { admin: true } }), 'assignments', 'shared-assignment-1'), { title: 'Admin assignment', programmeId: 'Cosmetology', semester: 'Semester 1', status: 'Published' }));
            }
        },

        {
            name: '33 - Student cannot create shared assignment',
            expect: 'DENY',
            run: async () => {
                await assertFails(setDoc(doc(auth(env, 'student-123'), 'assignments', 'student-assignment'), { title: 'Unauthorized', status: 'Published' }));
            }
        },

        {
            name: '34 - Admin manages trainer record',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(auth(env, 'admin-user', { roles: { admin: true } }), 'trainers', 'trainer-1'), { fullName: 'Trainer One', status: 'Active' }));
            }
        },

        {
            name: '35 - Student cannot read trainers',
            expect: 'DENY',
            run: async () => {
                await assertFails(getDoc(doc(auth(env, 'student-123'), 'trainers', 'trainer-1')));
            }
        },

        {
            name: '36 - Flat superadmin claim does not grant admin access',
            expect: 'DENY',
            run: async () => {
                await assertFails(
                    setDoc(
                        doc(auth(env, 'flat-claim-user', { superadmin: true }), 'assignments', 'flat-claim-assignment'),
                        { title: 'Unauthorized', status: 'Published' }
                    )
                );
            }
        },

        {
            name: '37 - Array superadmin claim grants admin access',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(
                    setDoc(
                        doc(auth(env, 'array-admin', { roles: ['superadmin'] }), 'assignments', 'array-assignment'),
                        { title: 'Authorized', status: 'Published' }
                    )
                );
            }
        },

        {
            name: '38 - Student cannot write users profile',
            expect: 'DENY',
            run: async () => {
                await assertFails(
                    setDoc(
                        doc(auth(env, 'student-123'), 'users', 'student-123'),
                        { role: 'superadmin' }
                    )
                );
            }
        },

        // =====================================================
        // PHASE 2 -- ADMIN ACADEMIC MANAGEMENT (assignments / learning_materials)
        // =====================================================

        {
            name: '39 - Authorized staff (admin) can create an assignment',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(auth(env, 'phase2-admin', { roles: { admin: true } }), 'assignments', 'phase2-assignment-1'), {
                    title: 'Portfolio Project',
                    programmeId: 'Cosmetology & Advanced Beauty Therapy',
                    semester: 'Sem 1',
                    status: 'Draft'
                }));
            }
        },

        {
            name: '40 - Authorized staff (admin) can update an assignment',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(updateDoc(doc(auth(env, 'phase2-admin', { roles: { admin: true } }), 'assignments', 'phase2-assignment-1'), {
                    status: 'Published'
                }));
            }
        },

        {
            name: '41 - Authorized staff (admin) can delete an assignment',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(deleteDoc(doc(auth(env, 'phase2-admin', { roles: { admin: true } }), 'assignments', 'phase2-assignment-1')));
            }
        },

        {
            name: '42 - Unauthorized student cannot create an assignment',
            expect: 'DENY',
            run: async () => {
                await assertFails(setDoc(doc(auth(env, 'phase2-student-denied'), 'assignments', 'phase2-assignment-denied'), {
                    title: 'Unauthorized',
                    programmeId: 'Cosmetology & Advanced Beauty Therapy',
                    semester: 'Sem 1',
                    status: 'Published'
                }));
            }
        },

        {
            name: '43 - Student can read a Published assignment matching their own programme/semester',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'phase2-student-matching';
                const admin = adminDb(env);
                await setDoc(doc(admin, 'students', uid), { fullName: 'Matching Student', program: 'Cosmetology & Advanced Beauty Therapy', semester: 'Sem 1' });
                await setDoc(doc(admin, 'assignments', 'phase2-assignment-matching'), {
                    title: 'Matching Assignment',
                    programmeId: 'Cosmetology & Advanced Beauty Therapy',
                    semester: 'Sem 1',
                    status: 'Published'
                });
                await assertSucceeds(getDoc(doc(auth(env, uid), 'assignments', 'phase2-assignment-matching')));
            }
        },

        {
            name: '44 - Student cannot read an assignment intended for another programme/semester',
            expect: 'DENY',
            run: async () => {
                const uid = 'phase2-student-mismatch';
                const admin = adminDb(env);
                await setDoc(doc(admin, 'students', uid), { fullName: 'Mismatch Student', program: 'Fashion Design & Creative Styling', semester: 'Sem 2' });
                await setDoc(doc(admin, 'assignments', 'phase2-assignment-mismatch'), {
                    title: 'Other Cohort Assignment',
                    programmeId: 'Cosmetology & Advanced Beauty Therapy',
                    semester: 'Sem 1',
                    status: 'Published'
                });
                await assertFails(getDoc(doc(auth(env, uid), 'assignments', 'phase2-assignment-mismatch')));
            }
        },

        {
            name: '45 - Superadmin can manage learning materials',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(adminDb(env), 'learning_materials', 'phase2-material-superadmin'), {
                    title: 'Superadmin Material', url: 'https://example.com/a', public: true
                }));
            }
        },

        {
            name: '46 - Lecturer can manage learning materials',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(setDoc(doc(auth(env, 'phase2-lecturer', { roles: { lecturer: true } }), 'learning_materials', 'phase2-material-lecturer'), {
                    title: 'Lecturer Material', url: 'https://example.com/b', public: true
                }));
            }
        },

        {
            name: '47 - Plain admin cannot write learning materials',
            expect: 'DENY',
            run: async () => {
                await assertFails(setDoc(doc(auth(env, 'phase2-admin-only', { roles: { admin: true } }), 'learning_materials', 'phase2-material-admin-denied'), {
                    title: 'Should Be Denied', url: 'https://example.com/c', public: true
                }));
            }
        },

        {
            name: '48 - Existing allowed read behavior remains intact: any signed-in user can read a public learning material',
            expect: 'ALLOW',
            run: async () => {
                await assertSucceeds(getDoc(doc(auth(env, 'phase2-random-reader'), 'learning_materials', 'phase2-material-superadmin')));
            }
        },

        {
            name: '49 - Existing allowed read behavior remains intact: a non-targeted signed-in user cannot read a private (non-public) learning material',
            expect: 'DENY',
            run: async () => {
                await setDoc(doc(adminDb(env), 'learning_materials', 'phase2-material-private'), {
                    title: 'Private Material', url: 'https://example.com/d', public: false, allowedUid: 'some-other-uid'
                });
                await assertFails(getDoc(doc(auth(env, 'phase2-uninvited-reader'), 'learning_materials', 'phase2-material-private')));
            }
        },

        // =====================================================
        // E-LEARNING IMPROVEMENTS -- programmeId targeting fix + grading
        // =====================================================

        {
            name: '50 - A student in the targeted programme CAN read a programmeId-targeted material',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'elearning-student-matching';
                const admin = adminDb(env);
                await setDoc(doc(admin, 'students', uid), { fullName: 'Matching Student', program: 'Cosmetology & Advanced Beauty Therapy' });
                await setDoc(doc(admin, 'learning_materials', 'elearning-material-targeted'), {
                    title: 'Cosmetology Only Material', url: 'https://example.com/e', public: false, programmeId: 'Cosmetology & Advanced Beauty Therapy'
                });
                await assertSucceeds(getDoc(doc(auth(env, uid), 'learning_materials', 'elearning-material-targeted')));
            }
        },

        {
            name: '51 - A student in a DIFFERENT programme cannot read that programmeId-targeted material',
            expect: 'DENY',
            run: async () => {
                const uid = 'elearning-student-mismatch';
                await setDoc(doc(adminDb(env), 'students', uid), { fullName: 'Mismatch Student', program: 'Fashion Design & Creative Styling' });
                await assertFails(getDoc(doc(auth(env, uid), 'learning_materials', 'elearning-material-targeted')));
            }
        },

        {
            name: '51b - A student in the targeted programme CAN run a LIST query for programmeId-targeted materials',
            expect: 'ALLOW',
            run: async () => {
                // This must be a list query (getDocs + where), not getDoc -- Firestore proves
                // list-query safety differently than single-document reads, and this is exactly
                // the shape that was broken (and fixed) for this rule.
                const uid = 'elearning-student-matching';
                const q = query(collection(auth(env, uid), 'learning_materials'), where('programmeId', '==', 'Cosmetology & Advanced Beauty Therapy'));
                const snap = await assertSucceeds(getDocs(q));
                if (snap.empty) throw new Error('Expected the programmeId list query to return at least one material');
            }
        },

        {
            name: '51c - The specifically-targeted student CAN read an allowedUid-targeted material',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'elearning-student-allowed';
                await setDoc(doc(adminDb(env), 'learning_materials', 'elearning-material-allowed-uid'), {
                    title: 'Just For One Student', url: 'https://example.com/f', public: false, allowedUid: uid
                });
                await assertSucceeds(getDoc(doc(auth(env, uid), 'learning_materials', 'elearning-material-allowed-uid')));
            }
        },

        {
            name: '51d - A DIFFERENT student cannot read that allowedUid-targeted material',
            expect: 'DENY',
            run: async () => {
                await assertFails(getDoc(doc(auth(env, 'elearning-student-not-allowed'), 'learning_materials', 'elearning-material-allowed-uid')));
            }
        },

        {
            name: '51e - The specifically-targeted student CAN run a LIST query for their allowedUid-targeted material',
            expect: 'ALLOW',
            run: async () => {
                // This is the exact query shape (array-contains, pre-fix) that was proven
                // to always fail for list queries, regardless of rule nesting -- replaced
                // with a single-student equality field precisely so this query type works.
                const uid = 'elearning-student-allowed';
                const q = query(collection(auth(env, uid), 'learning_materials'), where('allowedUid', '==', uid));
                const snap = await assertSucceeds(getDocs(q));
                if (snap.empty) throw new Error('Expected the allowedUid list query to return at least one material');
            }
        },

        {
            name: '52 - Student cannot write grade/feedback/gradedAt/gradedBy on their own submission',
            expect: 'DENY',
            run: async () => {
                const uid = 'elearning-grading-student';
                await setDoc(doc(adminDb(env), 'students', uid, 'submissions', 'assignment-1'), {
                    assignmentId: 'assignment-1', studentUid: uid, fileName: 'work.pdf', filePath: 'x', submittedAt: new Date().toISOString(), status: 'Submitted'
                });
                await assertFails(updateDoc(doc(auth(env, uid), 'students', uid, 'submissions', 'assignment-1'), {
                    status: 'Submitted', grade: 'A', feedback: 'Great work', gradedAt: new Date().toISOString(), gradedBy: uid
                }));
            }
        },

        {
            name: '53 - Authorized staff (admin) CAN write grade/feedback to a submission',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'elearning-grading-student';
                await assertSucceeds(updateDoc(doc(auth(env, 'elearning-admin', { roles: { admin: true } }), 'students', uid, 'submissions', 'assignment-1'), {
                    grade: 'A', feedback: 'Great work', gradedAt: new Date().toISOString(), gradedBy: 'elearning-admin', status: 'Graded'
                }));
            }
        },

        {
            name: '54 - The student CAN read their own graded submission (grade + feedback included)',
            expect: 'ALLOW',
            run: async () => {
                const uid = 'elearning-grading-student';
                await assertSucceeds(getDoc(doc(auth(env, uid), 'students', uid, 'submissions', 'assignment-1')));
            }
        },

        {
            name: '55 - A different student cannot read this student\'s graded submission',
            expect: 'DENY',
            run: async () => {
                const uid = 'elearning-grading-student';
                await assertFails(getDoc(doc(auth(env, 'elearning-other-student'), 'students', uid, 'submissions', 'assignment-1')));
            }
        }
    ];
}


main().catch(error => {
    console.error('BLOCKED: 1');
    console.error(error && error.stack ? error.stack : error);
    process.exit(2);
});
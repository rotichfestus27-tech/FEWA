// ------------------------------------------------------------------------
// STUDENT-ID LOGIN RESOLUTION (no account required to call)
// ------------------------------------------------------------------------
//
// The Student Portal login accepts either an email or a Student ID (e.g.
// "2026/001"). Firebase Authentication itself only signs in by email --
// there is no native "sign in by arbitrary Student ID" capability -- so when
// the caller enters a Student ID, the client resolves it to the matching
// account's email here first, then calls the exact same
// signInWithEmailAndPassword it always has. This function never sees or
// checks a password; Firebase Authentication verifies that entirely on the
// client, with its own built-in per-account attempt throttling untouched.
//
// Returns ONLY the email address, nothing else. A Student ID that doesn't
// match any student produces a generic "not found" error, matching the
// existing checkApplicationStatus pattern in status-check-service.js.
//
// Known trade-off (documented in the project's release report, not hidden
// here): Student IDs are sequential and therefore guessable, so this
// endpoint can confirm whether a given Student ID belongs to a real account
// and surface its email. This is the same trade-off essentially every
// institutional "log in with your ID number" system makes; the thing that
// actually protects the account -- the password check -- never happens here
// and is never weakened by this function.

async function resolveStudentLoginEmail({ db, studentId }) {
    const id = typeof studentId === 'string' ? studentId.trim() : '';
    if (!id) throw new Error('A Student ID is required.');

    const snapshot = await db.collection('students').where('studentId', '==', id).limit(1).get();
    if (snapshot.empty) throw new Error('No account was found for that Student ID.');

    const student = snapshot.docs[0].data();
    if (!student.email) throw new Error('No account was found for that Student ID.');

    return { email: student.email };
}

module.exports = { resolveStudentLoginEmail };

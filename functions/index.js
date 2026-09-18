const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { promoteAcceptedApplication, finalizeApplicationSubmission } = require('./admission-service');
const { isSuperadmin, setUserRole, listStaffAccounts } = require('./roles-service');

admin.initializeApp();

// Verifies the CALLER's own verified ID token carries superadmin -- never trusts
// anything the client claims about itself in the request payload.
function requireSuperadmin(request) {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    }
    if (!isSuperadmin(request.auth.token)) {
        throw new functions.https.HttpsError('permission-denied', 'Only a superadmin can manage staff roles.');
    }
}

exports.promoteAcceptedApplication = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
        return await promoteAcceptedApplication({
            db: admin.firestore(),
            applicationId: request.data?.applicationId,
            authToken: request.auth.token
        });
    } catch (error) {
        const code = error.message.includes('not authorized') ? 'permission-denied' : 'failed-precondition';
        throw new functions.https.HttpsError(code, error.message);
    }
});

// Called by application-portal.js at final submit. Operates only on the caller's own
// application (applications/{uid} is always keyed by the applicant's own uid), so no
// client-supplied application ID is trusted or accepted here.
exports.finalizeApplicationSubmission = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
        return await finalizeApplicationSubmission({
            db: admin.firestore(),
            auth: admin.auth(),
            applicationId: request.auth.uid
        });
    } catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error.message);
    }
});

// Grants or revokes a single role on an existing account. The person must already
// have signed in to FEWA at least once (Firebase Auth has no other way to look
// them up by email) -- this never creates accounts, only adjusts claims on one
// that already exists.
exports.setUserRole = functions.https.onCall(async (request) => {
    requireSuperadmin(request);
    try {
        return await setUserRole({
            auth: admin.auth(),
            callerUid: request.auth.uid,
            targetEmail: request.data?.email,
            role: request.data?.role,
            grant: request.data?.grant !== false
        });
    } catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error.message);
    }
});

exports.listStaffAccounts = functions.https.onCall(async (request) => {
    requireSuperadmin(request);
    try {
        return await listStaffAccounts({ auth: admin.auth() });
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

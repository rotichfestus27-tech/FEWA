const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { promoteAcceptedApplication } = require('./admission-service');

admin.initializeApp();

exports.promoteAcceptedApplication = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
        return await promoteAcceptedApplication({
            db: admin.firestore(),
            applicationId: data?.applicationId,
            authToken: context.auth.token
        });
    } catch (error) {
        const code = error.message.includes('not authorized') ? 'permission-denied' : 'failed-precondition';
        throw new functions.https.HttpsError(code, error.message);
    }
});

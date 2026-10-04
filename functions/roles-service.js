// ------------------------------------------------------------------------
// STAFF ROLE MANAGEMENT
// ------------------------------------------------------------------------
//
// Roles live only as Firebase Auth custom claims (roles: { admin: true, ... }),
// exactly as firestore.rules and every client already expect -- this module
// does not introduce a second, parallel source of truth in Firestore.
//
// Only a superadmin may call these (enforced by the caller in functions/index.js
// via the caller's own verified ID token, not by anything client-supplied).
// This is the same trust boundary server/create-superadmin.js already relies
// on -- this module just makes it usable for more than one hardcoded account.

const { Timestamp } = require('firebase-admin/firestore');

const VALID_ROLES = new Set(['admin', 'superadmin', 'admissions', 'finance', 'lecturer']);

function normalizeRoles(customClaims = {}) {
    const roles = customClaims?.roles;
    if (Array.isArray(roles)) {
        return Object.fromEntries(roles.filter(role => typeof role === 'string' && role).map(role => [role, true]));
    }
    if (roles && typeof roles === 'object') {
        return Object.fromEntries(Object.entries(roles).filter(([, value]) => value === true));
    }
    return {};
}

function hasRole(customClaims, role) {
    return normalizeRoles(customClaims)[role] === true;
}

function isSuperadmin(customClaims) {
    return hasRole(customClaims, 'superadmin');
}

async function setUserRole({ auth, callerUid, targetEmail, role, grant }) {
    if (typeof targetEmail !== 'string' || !targetEmail.trim()) throw new Error('An email address is required.');
    if (typeof role !== 'string' || !VALID_ROLES.has(role)) throw new Error(`"${role}" is not a recognized role.`);
    const email = targetEmail.trim();

    let targetUser;
    try {
        targetUser = await auth.getUserByEmail(email);
    } catch (error) {
        throw new Error('No account was found for that email address. The person must sign in to FEWA at least once before a role can be granted.');
    }

    if (!grant && role === 'superadmin') {
        if (targetUser.uid === callerUid) {
            throw new Error('You cannot remove your own superadmin role.');
        }
        const page = await auth.listUsers(1000);
        const remainingSuperadmins = page.users.filter(user => user.uid !== targetUser.uid && isSuperadmin(user.customClaims)).length;
        if (remainingSuperadmins === 0) {
            throw new Error('At least one superadmin account must remain. Grant superadmin to another account first.');
        }
    }

    const updatedRoles = normalizeRoles(targetUser.customClaims);
    if (grant) updatedRoles[role] = true;
    else delete updatedRoles[role];

    await auth.setCustomUserClaims(targetUser.uid, { ...(targetUser.customClaims || {}), roles: updatedRoles });

    return {
        uid: targetUser.uid,
        email: targetUser.email || email,
        roles: Object.keys(updatedRoles)
    };
}

// Creates a brand-new staff Firebase Auth account (no password set -- the
// invitee always chooses their own, via the same password-reset-link
// mechanism already used for student account activation) and assigns it
// exactly one role. Unlike setUserRole, this is for people who have never
// signed in to FEWA before -- it is the only place in the codebase that
// calls auth.createUser() for a staff account.
//
// sendInvitation is injected (same pattern as sendEmails/sendAcceptanceEmail
// in admission-service.js) so this module never needs to know about
// nodemailer/SMTP directly, and so tests can substitute a no-op.
const STAFF_SETUP_REDIRECT = { url: 'https://fewa.ac.ke/account-setup.html?portal=staff', handleCodeInApp: true };

async function inviteStaffAccount({ auth, db, callerUid, targetName, targetEmail, role, sendInvitation }) {
    const name = typeof targetName === 'string' ? targetName.trim() : '';
    if (!name) throw new Error('A full name is required.');
    if (typeof targetEmail !== 'string' || !targetEmail.trim()) throw new Error('An email address is required.');
    const email = targetEmail.trim().toLowerCase();
    if (typeof role !== 'string' || !VALID_ROLES.has(role)) throw new Error(`"${role}" is not a recognized role.`);

    // Duplicate check -- an account already existing is the normal, expected
    // case for someone who has signed in before; direct the caller to the
    // existing "grant role" action instead of silently doing something else.
    let existing = null;
    try {
        existing = await auth.getUserByEmail(email);
    } catch (error) {
        existing = null; // not found is the expected, good outcome here
    }
    if (existing) {
        throw new Error('An account already exists for that email address. Use "Grant role" to assign a role to an existing account instead.');
    }

    let newUser;
    try {
        newUser = await auth.createUser({ email, displayName: name, emailVerified: false });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            throw new Error('An account already exists for that email address. Use "Grant role" to assign a role to an existing account instead.');
        }
        throw new Error(`Could not create the account: ${error.message}`);
    }

    try {
        await auth.setCustomUserClaims(newUser.uid, { roles: { [role]: true } });
    } catch (error) {
        // Compensating cleanup: don't leave a role-less, unusable orphan account behind.
        await auth.deleteUser(newUser.uid).catch(() => {});
        throw new Error(`Could not assign the role, so the new account was removed. Please try again: ${error.message}`);
    }

    let resetLink;
    try {
        resetLink = await auth.generatePasswordResetLink(email, STAFF_SETUP_REDIRECT);
    } catch (error) {
        // The account and role are now real -- do not delete them, but do not
        // report success either. The superadmin can retry the invite, or the
        // person can use "Forgot password?" at /staff once told their account exists.
        throw new Error(`The account was created with the "${role}" role, but the invitation link could not be generated. Please try again or contact support: ${error.message}`);
    }

    try {
        await sendInvitation({ name, email, role, resetLink });
    } catch (error) {
        throw new Error(`The account was created with the "${role}" role, but the invitation email could not be sent. Please try again or contact support: ${error.message}`);
    }

    // Best-effort staff metadata, same users/{uid} shape server/create-superadmin.js
    // already writes. Non-fatal: the invitation itself already fully succeeded by
    // this point, so a metadata write failure must not turn this into an error.
    try {
        await db.collection('users').doc(newUser.uid).set({
            uid: newUser.uid,
            email,
            displayName: name,
            role,
            active: true,
            invitedBy: callerUid,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        }, { merge: true });
    } catch (error) {
        console.error('inviteStaffAccount: staff metadata write failed for', newUser.uid, '-', error.message);
    }

    return { uid: newUser.uid, email, name, role };
}

async function listStaffAccounts({ auth }) {
    const accounts = [];
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        for (const user of page.users) {
            const roles = Object.keys(normalizeRoles(user.customClaims));
            if (roles.length) {
                accounts.push({ uid: user.uid, email: user.email || '(no email on file)', roles, disabled: user.disabled === true });
            }
        }
        pageToken = page.pageToken;
    } while (pageToken && accounts.length < 500);

    accounts.sort((a, b) => a.email.localeCompare(b.email));
    return { accounts };
}

module.exports = {
    VALID_ROLES,
    normalizeRoles,
    hasRole,
    isSuperadmin,
    setUserRole,
    inviteStaffAccount,
    listStaffAccounts
};

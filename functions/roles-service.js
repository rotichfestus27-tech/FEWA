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
    listStaffAccounts
};

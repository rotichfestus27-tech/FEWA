const admin = require('firebase-admin');
const readline = require('readline');

const PROJECT_ID = 'fewa-beauty-fashion-coll-a2d4d';
const SUPERADMIN_UID = 'fE4hQQPdJeR3Iccx9NzeNLtA0rW2';
const SUPERADMIN_EMAIL = 'rotichfestus27@gmail.com';

function normalizeRoles(rawRoles) {
    const rolesValue = rawRoles && typeof rawRoles === 'object' && Object.prototype.hasOwnProperty.call(rawRoles, 'roles')
        ? rawRoles.roles
        : rawRoles;

    if (Array.isArray(rolesValue)) {
        return [...new Set(rolesValue.filter(role => typeof role === 'string' && role.length > 0))];
    }

    if (rolesValue && typeof rolesValue === 'object') {
        return Object.keys(rolesValue).filter(role => rolesValue[role] === true);
    }

    return [];
}

function claimIncludesRole(claims, role) {
    if (!claims) {
        return false;
    }

    const roles = normalizeRoles(claims);
    return roles.includes(role);
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help' || argument === '-h') {
            options.help = true;
            continue;
        }
        if (argument === '--email' || argument === '--uid') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${argument} requires a value.`);
            }
            options[argument.slice(2)] = value.trim();
            index += 1;
            continue;
        }
        throw new Error(`Unknown option: ${argument}`);
    }
    return options;
}

function printUsage() {
    console.log('Usage: npm run bootstrap:superadmin -- --email admin@example.com');
    console.log('   or: npm run bootstrap:superadmin -- --uid FIREBASE_USER_UID');
    console.log(`Initial FEWA account: ${SUPERADMIN_EMAIL} (${SUPERADMIN_UID})`);
    console.log('Requires GOOGLE_APPLICATION_CREDENTIALS to point to a local service-account JSON file.');
}

function ask(question) {
    const terminal = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => terminal.question(question, answer => {
        terminal.close();
        resolve(answer.trim());
    }));
}

function initializeAdmin() {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error(
            'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it to a local service-account JSON file; never commit that file.'
        );
    }

    return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || PROJECT_ID
    });
}

async function findUser(options) {
    if (options.uid) {
        return admin.auth().getUser(options.uid);
    }
    if (options.email) {
        return admin.auth().getUserByEmail(options.email);
    }

    const identifier = await ask('First superadmin email or Firebase UID: ');
    if (!identifier) {
        throw new Error('An email address or UID is required.');
    }

    if (identifier.includes('@')) {
        return admin.auth().getUserByEmail(identifier);
    }
    return admin.auth().getUser(identifier);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }
    if (options.email && options.uid) {
        throw new Error('Use either --email or --uid, not both.');
    }

    if (!options.email && !options.uid) {
        options.uid = SUPERADMIN_UID;
    }

    initializeAdmin();

    let user;
    try {
        user = await findUser(options);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            throw new Error(
                'No Firebase Authentication user was found. Create the account in Firebase Console, then run this command again. This script never creates passwords.'
            );
        }
        throw error;
    }

    if (user.uid !== SUPERADMIN_UID || user.email !== SUPERADMIN_EMAIL) {
        throw new Error('The selected user does not match the configured initial FEWA superadmin identity.');
    }

    const existingClaims = user.customClaims || {};
    const existingRoles = normalizeRoles(existingClaims.roles);
    const mergedRoleMap = Object.fromEntries(existingRoles.map(role => [role, true]));
    mergedRoleMap.superadmin = true;

    const claims = {
        ...existingClaims,
        roles: mergedRoleMap
    };

    await admin.auth().setCustomUserClaims(user.uid, claims);
    const verifiedUser = await admin.auth().getUser(user.uid);
    const verifiedClaims = verifiedUser.customClaims || {};

    if (!claimIncludesRole(verifiedClaims, 'superadmin')) {
        throw new Error('Claim verification failed: roles does not include superadmin.');
    }

    const profileRef = admin.firestore().collection('users').doc(user.uid);
    await profileRef.set({
        uid: user.uid,
        email: SUPERADMIN_EMAIL,
        displayName: 'FEWA Superadmin',
        role: 'superadmin',
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const profile = await profileRef.get();
    if (!profile.exists || profile.data().uid !== SUPERADMIN_UID || profile.data().role !== 'superadmin') {
        throw new Error('Firestore profile verification failed.');
    }

    console.log(`Superadmin claim assigned to ${user.email || user.uid} in ${PROJECT_ID}.`);
    console.log('Claims verified: roles includes superadmin.');
    console.log(`Firestore profile verified: users/${user.uid}.`);
    console.log('The user must sign out and sign in again, or force-refresh the ID token, before opening admin.html.');
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Superadmin setup failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    normalizeRoles,
    claimIncludesRole
};

FEWA — Roles & Custom Claims (recommended)

Overview

Use Firebase custom claims to grant role-based access. Custom claims are set server-side (Admin SDK) and propagate on the user's ID token. The security rules above expect `request.auth.token.roles` to be a map/object where each role key has boolean `true` (e.g. {"superadmin": true}).

Recommended roles

- superadmin — full administrative access
- admissions — manage applications and student profile creation
- finance — manage fees and payments
- lecturer — manage results, timetables, and learning materials
- staff — general staff privileges (optional)

Setting custom claims (example Node.js admin snippet)

```js
const admin = require('firebase-admin');

// uid is the Firebase Auth UID of the user to modify
const uid = 'USER_UID';

// Example: set admissions and lecturer roles
await admin.auth().setCustomUserClaims(uid, { roles: { admissions: true, lecturer: true } });

// After setting claims, client must refresh token (signOut/signIn) to get updated claims.
```

First superadmin setup

Use the trusted local bootstrap command for the first administrator:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\fewa-service-account.json'
cd server
npm run bootstrap:superadmin -- --email admin@example.com
```

Create the Auth user and password in Firebase Console first. The command only
finds that existing user, preserves existing claims, sets the exact nested
claim `roles: { superadmin: true }`, and verifies it. It never stores a password
or exposes a public provisioning endpoint.

Best practices

- Assign roles only from trusted server environments (Admin SDK). Never allow clients to set their own claims.
- Use the minimal role needed for a user.
- For temporary role elevation, consider a separate admin workflow where changes are logged and audited.
- Keep a separate 'admins' collection to manage metadata about staff accounts (name, email, roles, contact) — use it in conjunction with claims.

Token refresh note

Custom claims are contained in the ID token. After updating claims with the Admin SDK, the client must sign out and sign in again (or force token refresh) to obtain updated claims.

Auditing & logging

Log role changes and administrative actions in a secure server-side audit log (e.g., `admin_logs` collection) — these logs should be writeable only by server/admin processes and readable by superadmins.

FEWA Beauty & Fashion College — Firebase deployment

This file describes how to deploy Firestore security rules and indexes for the FEWA project using the Firebase CLI.

Prerequisites

- Node.js and npm installed
- A Firebase project created in the Firebase Console
- `firebase` CLI installed (instructions below)

Install Firebase CLI

Global install (recommended):

```bash
npm install -g firebase-tools
```

Or use npx (no global install required):

```bash
npx firebase-tools --version
```

Login to Firebase

```bash
firebase login
```

Select or add your Firebase project

You can either set the default project in `.firebaserc` by replacing `YOUR_FIREBASE_PROJECT_ID`, or run:

```bash
# add a project alias (interactive)
firebase use --add

# or set directly
firebase use YOUR_FIREBASE_PROJECT_ID
```

Deploy Firestore rules only

```bash
firebase deploy --only firestore:rules
```

Deploy Firestore indexes only

```bash
firebase deploy --only firestore:indexes
```

Deploy both rules and indexes (recommended)

```bash
firebase deploy --only firestore
```

Notes

- Do NOT add `server/serviceAccountKey.json` to source control. It is required for server-side Admin SDK operations only.
- Ensure your `firestore.rules` file (in project root) matches the security posture you want before deploying.
- After deploying rules, test them using the Firebase Console Rules Playground.

Student portal data model

Private student records are stored below the authenticated Firebase UID:

```text
students/{uid}/assignments/{assignmentId}
students/{uid}/submissions/{assignmentId}
students/{uid}/attendance/{attendanceId}
students/{uid}/notifications/{notificationId}
students/{uid}/documents/{documentId}
students/{uid}/messages/{messageId}
```

Students can read only their own subcollections. Students may submit their own
assignment files and mark their own notifications/messages as read. Official
assignments, attendance, documents, and staff messages are written by
authorized staff or server-side Admin SDK processes.

Private Storage paths are:

```text
students/{uid}/submissions/{assignmentId}/{fileName}
students/{uid}/documents/{documentId}/{fileName}
```

Submission uploads are limited to 10 MB. Document files are staff-managed and
are never public.

Admin portal

Open `admin.html` for the protected administration workspace. Access requires
Firebase Authentication custom claims with `roles.admin == true` or
`roles.superadmin == true`. The browser must never create Auth users or assign
claims; use a trusted Admin SDK service or Cloud Function for those operations.

Admin-managed shared assignments use `assignments/{assignmentId}` and are
filtered for students by programme and semester. Student-specific management
records remain below `students/{uid}`. No admin or trainer dashboard existed in
the original project, so the new page provides the client-side management
surface while role assignment and account provisioning remain trusted-backend
operations.

First superadmin account

Create the first account in Firebase Console under Authentication > Users,
using the email address you control for FEWA administration. Set its password
only in Firebase Console. Then download a service-account JSON key and keep it
outside the website root. The repository ignores `server/serviceAccountKey.json`
and local `.env` files.

Run the trusted local bootstrap from PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\fewa-service-account.json'
cd server
npm install
npm run bootstrap:superadmin -- --email admin@example.com
```

Replace `admin@example.com` with the exact Firebase Auth email. The command can
also use `--uid FIREBASE_USER_UID`. It finds an existing user, preserves other
claims, assigns `roles.superadmin=true`, and verifies the claim. It never creates
or prints a password and is not exposed as a web endpoint.

After success, sign out and sign back in so Firebase refreshes the ID token,
then open `admin.html`. Future administrator changes must use this trusted Admin
SDK workflow or a protected Cloud Function. Never place the service-account key
in `config.js`, HTML, browser JavaScript, or source control.

Troubleshooting

- If deployment complains about project not set, run `firebase use --add` and select your project.
- To list projects:

```bash
firebase projects:list
```

Contact

If you want, I can also add `firebase.json` hosting configuration and CI scripts for automated deploys; tell me if you'd like that next.

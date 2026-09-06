# FEWA Server (Express + Firebase Admin)

This Express server provides a minimal health endpoint. Authentication and student data are handled directly by the front-end using Firebase Authentication and Firestore.

Setup

1. Install dependencies:

```bash
cd server
npm install
```

2. Start the server (optional for development health checks):

```bash
npm start
```

Endpoints

- `GET /api/health` — health check.

Notes

- Do not store or process passwords on this server. All authentication flows use Firebase Authentication in the browser and Firestore for profile data.
- Configure your Firebase project and add the client web config to the front-end by copying `config.example.js` to `config.js` and filling the Firebase web config values. `config.js` is gitignored by default.

First superadmin bootstrap

Create the first user in Firebase Console under Authentication > Users first.
Set its password in the Console; this script never creates or prints passwords.
Download a Firebase service-account key and keep it outside the public web root.
The repository ignores `server/serviceAccountKey.json` if that location is used.

From PowerShell, set the key path for the current terminal only:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\fewa-service-account.json'
cd server
npm install
npm run bootstrap:superadmin -- --email admin@example.com
```

Use `--uid USER_UID` instead of `--email` when preferred. The script finds an
existing Auth user, merges existing claims, assigns `roles.superadmin=true`,
and verifies the result. It is a local Admin SDK command, not an HTTP endpoint.
Afterward, sign out and sign in again before opening `admin.html`.

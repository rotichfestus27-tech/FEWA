FEWA — Firestore seeding scripts

Purpose

This folder contains an example script and seed data to populate Firestore student profiles during initial setup. The example uses the Firebase Admin SDK and requires a service account JSON placed on a secure server (never commit the service account to source control).

Prerequisites

- Node.js (14+)
- The Firebase Admin service account JSON file
- Your Firebase project ID

Steps

1. Install dependencies

```bash
cd scripts
npm install firebase-admin
```

2. Place service account

Place your Firebase Admin service account JSON at `server/serviceAccountKey.json` (this path is referenced by the example script).

3. Edit `seed_students.json`

Update placeholder fields (uids, studentId, fullName, email, program) with real values or keep placeholders for testing.

4. Run the seeder

```bash
node scripts/seed_students.js
```

What the script does

- Reads `scripts/seed_students.json`
- Writes each entry to `students/{uid}` document in Firestore using the Admin SDK

Notes & security

- Never place service account JSON in the front-end.
- Run seeding operations from a secure environment (server or local machine), not in-browser.
- This script is an example; adapt it to your needs and add validation before writing production data.

Firestore Rules Emulator test instructions

Prerequisites
- Node.js (16+)
- Firebase CLI (for emulator): `npm install -g firebase-tools`

Install dependencies

```bash
npm install
```

Start Firestore emulator (in a separate terminal)

```bash
npm run emu:start
```

Run the rules tests (after emulator is running)

```bash
npm run test:rules
```

What this does
- Loads `firestore.rules` from the workspace into an in-memory test environment backed by the Firestore emulator.
- Runs 38 CI tests and 33 standalone tests (create/get/update/delete) covering unauthenticated users, students, lecturers, finance, admissions, admin, superadmin, custom-claim formats, user profiles, assignments, submissions, attendance, notifications, documents, and messages.
- Prints PASS/FAIL per test and exits with non-zero status if any test fails.

Notes
- These tests run against the emulator only; they will NOT deploy rules or touch production.
- Some tests create documents as a `superadmin` test context to set up required resources.
- If you need CI integration, run the emulator in CI or use the firebase emulator docker image.

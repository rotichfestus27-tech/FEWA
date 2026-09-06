// Example Node script to seed Firestore `students` documents from scripts/seed_students.json
// Usage: place your Firebase Admin service account at server/serviceAccountKey.json

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'server', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('Missing service account:', serviceAccountPath);
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

const seedFile = path.join(__dirname, 'seed_students.json');
if (!fs.existsSync(seedFile)) {
    console.error('Seed file missing:', seedFile);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

(async () => {
    for (const s of data) {
        if (!s.uid) {
            console.warn('Skipping entry without uid', s);
            continue;
        }
        const docRef = db.collection('students').doc(s.uid);
        const payload = Object.assign({}, s);
        // Remove uid field from payload (stored as doc id and as field)
        payload.uid = s.uid;
        await docRef.set(payload, { merge: true });
        console.log('Wrote student', s.studentId || s.uid);
    }
    console.log('Seeding complete.');
    process.exit(0);
})();

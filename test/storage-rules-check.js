const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

async function main() {
  const rules = fs.readFileSync('storage.rules', 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'fewa-storage-test',
    storage: { rules }
  });

  try {
    // RulesTestContext#storage() already returns a ready-to-use (compat-style)
    // Storage instance in @firebase/rules-unit-testing v5 -- passing it through
    // the modular getStorage()/ref()/uploadBytes() helpers (as this script
    // previously did) throws "Cannot read properties of undefined (reading
    // 'getProvider')" because those helpers expect a FirebaseApp, not an
    // already-constructed Storage instance. Using the compat .ref(path) chain
    // directly, matching what .storage() actually returns, fixes that.
    const unauthStorage = testEnv.unauthenticatedContext().storage();
    const ownerStorage = testEnv.authenticatedContext('owner-1').storage();
    const otherStorage = testEnv.authenticatedContext('owner-2').storage();
    const adminStorage = testEnv.authenticatedContext('admin-user', { roles: { admin: true } }).storage();
    // Role-only staff context with NO ownership relationship to owner-1 --
    // isolates the role check itself from the uid-ownership check.
    const admissionsStorage = testEnv.authenticatedContext('admissions-user', { roles: { admissions: true } }).storage();
    const financeStorage = testEnv.authenticatedContext('finance-user', { roles: { finance: true } }).storage();

    // Seed the fixture application doc with rules bypassed -- this is test
    // setup, not something under test, and the real firestore.rules correctly
    // reject an unauthenticated client creating an application document (the
    // previous version of this script wrote it as unauthenticatedContext(),
    // which the current rules reject; that's a test-fixture bug, not a reason
    // to weaken the rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('applications/app-123').set({ applicantUid: 'owner-1' });
    });

    const file = new Uint8Array([1, 2, 3, 4]);
    // storage.rules' ownsApplication() checks request.auth.uid against the
    // {applicationId} PATH SEGMENT directly (matching how the real app names
    // an applicant's draft doc after their own uid) -- not a Firestore field
    // lookup. The path previously used a literal 'app-123' placeholder that
    // didn't match either test uid, so every upload was correctly denied
    // regardless of who the "owner" was; that was a fixture bug, not a rules
    // bug. Using the owner's real uid here matches the real application flow.
    const path = 'applications/owner-1/documents/id-card/file.pdf';

    // storage.rules also requires request.resource.contentType to match
    // application/pdf|image/jpeg|image/png -- .put(file) with no metadata
    // defaults to application/octet-stream, which fails that check regardless
    // of who's uploading, so every assertSucceeds() below was failing on the
    // content-type condition rather than the ownership one.
    const metadata = { contentType: 'application/pdf' };
    await assertFails(unauthStorage.ref(path).put(file, metadata));
    await assertSucceeds(ownerStorage.ref(path).put(file, metadata));
    await assertFails(otherStorage.ref(path).put(file, metadata));
    await assertSucceeds(adminStorage.ref(path).put(file, metadata));
    await assertSucceeds(ownerStorage.ref(path).getDownloadURL());
    await assertFails(otherStorage.ref(path).getDownloadURL());

    // ------------------------------------------------------------------
    // students/{studentUid}/documents/{documentId}/{fileName} -- the path
    // the acceptance-letter PDF is stored at (see buildStoragePath in
    // functions/acceptance-delivery-service.js). allow write: if false means
    // ONLY the Admin SDK (a Cloud Function) can ever place a file here --
    // not even the owning student or an admin via the client SDK -- while
    // allow read is owner-or-staff. Admin-user context here reuses the same
    // adminStorage client created above.
    // ------------------------------------------------------------------
    const letterPath = 'students/owner-1/documents/acceptance-letter/FEWA-Acceptance-Letter-2026-001.pdf';
    await assertFails(unauthStorage.ref(letterPath).put(file, metadata));
    await assertFails(ownerStorage.ref(letterPath).put(file, metadata));
    await assertFails(otherStorage.ref(letterPath).put(file, metadata));
    await assertFails(adminStorage.ref(letterPath).put(file, metadata));

    // Seed the letter file directly via the Admin SDK equivalent (rules
    // bypassed), matching how the real Cloud Function writes it, so read
    // access can be tested independently of write access.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref(letterPath).put(file, metadata);
    });
    await assertSucceeds(ownerStorage.ref(letterPath).getDownloadURL());
    await assertFails(otherStorage.ref(letterPath).getDownloadURL());
    await assertFails(unauthStorage.ref(letterPath).getDownloadURL());
    await assertSucceeds(adminStorage.ref(letterPath).getDownloadURL());
    // Regression check for the P1 audit finding: 'admissions' role staff --
    // who are exactly who accepts applications and triggers acceptance-letter
    // delivery (see AUTHORIZED_ROLES in functions/admission-service.js) --
    // must be able to read a student's acceptance letter even though they are
    // not the owning student and have no admin/superadmin role. 'finance'
    // role staff must still be correctly denied (confirms the fix did not
    // over-grant access to unrelated roles).
    await assertSucceeds(admissionsStorage.ref(letterPath).getDownloadURL());
    await assertFails(financeStorage.ref(letterPath).getDownloadURL());

    console.log('Storage rules checks: PASS');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

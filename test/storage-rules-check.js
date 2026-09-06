const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { getStorage, ref, uploadBytes, getDownloadURL, listAll } = require('firebase/storage');

async function main() {
  const rules = fs.readFileSync('storage.rules', 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'fewa-storage-test',
    storage: { rules }
  });

  try {
    const unauthStorage = getStorage(testEnv.unauthenticatedContext().storage());
    const ownerStorage = getStorage(testEnv.authenticatedContext('owner-1').storage());
    const otherStorage = getStorage(testEnv.authenticatedContext('owner-2').storage());
    const adminStorage = getStorage(testEnv.authenticatedContext('admin-user', { roles: { admin: true } }).storage());

    const applicationDoc = testEnv.unauthenticatedContext().firestore().doc('applications/app-123');
    await assertSucceeds(applicationDoc.set({ applicantUid: 'owner-1' }));

    const file = new Uint8Array([1, 2, 3, 4]);
    const path = 'applications/app-123/documents/id-card/file.pdf';

    await assertFails(uploadBytes(ref(unauthStorage, path), file));
    await assertSucceeds(uploadBytes(ref(ownerStorage, path), file));
    await assertFails(uploadBytes(ref(otherStorage, path), file));
    await assertSucceeds(uploadBytes(ref(adminStorage, path), file));
    await assertSucceeds(getDownloadURL(ref(ownerStorage, path)));
    await assertFails(getDownloadURL(ref(otherStorage, path)));

    console.log('Storage rules checks: PASS');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

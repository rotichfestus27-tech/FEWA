(() => {
    window.FEWA_APPLICATION_PORTAL = true;

    const form = document.getElementById('application-form');
    const steps = [...document.querySelectorAll('.application-step')];
    const progress = [...document.querySelectorAll('.progress-step')];
    const entry = document.getElementById('application-entry');
    const dashboard = document.getElementById('application-dashboard');
    const shell = document.getElementById('application-shell');
    const intro = document.querySelector('.application-intro');
    const confirmationPanel = document.getElementById('confirmation');
    const authMessage = document.getElementById('applicant-auth-message');
    const formMessage = document.getElementById('form-message');
    const startButton = document.getElementById('start-application-button');
    const continueEntryButton = document.getElementById('continue-application-entry');
    const continueHint = document.getElementById('continue-application-hint');
    const continueOverlay = document.getElementById('continue-application-overlay');
    const continueCancelButton = document.getElementById('continue-application-cancel');
    const secureOverlay = document.getElementById('secure-application-overlay');
    const secureForm = document.getElementById('secure-application-form');
    const secureMessage = document.getElementById('secure-application-message');
    const secureEmailDisplay = document.getElementById('secure-application-email');
    const secureCancelButton = document.getElementById('secure-application-cancel');
    const shellSecurityText = document.getElementById('shell-security-text');
    const shellSecureLink = document.getElementById('shell-secure-link');
    const checkStatusLink = document.getElementById('check-status-link');
    const checkStatusOverlay = document.getElementById('check-status-overlay');
    const checkStatusForm = document.getElementById('check-status-form');
    const checkStatusMessage = document.getElementById('check-status-message');
    const checkStatusResult = document.getElementById('check-status-result');
    const checkStatusCancelButton = document.getElementById('check-status-cancel');
    const config = window.FEWA_CONFIG?.firebase;
    const validConfig = config && config.apiKey && config.projectId && config.appId
        && !String(config.apiKey).match(/^(YOUR_|REPLACE_)/)
        && !String(config.appId).match(/^(YOUR_|REPLACE_)/);
    let auth;
    let db;
    let storage;
    let currentUser;
    let currentApplication;
    let currentStep = 1;
    let submitting = false;

    const programDetails = {
        'Cosmetology & Advanced Beauty Therapy': 'Diploma | 2 Years. Skin therapies, aesthetics, spa treatments and salon management.',
        'Fashion Design & Creative Styling': 'Diploma | 2 Years. Pattern drafting, textiles, garment construction and styling.',
        'Professional Hairdressing & Trichology': 'Certificate | 1.5 Years. Cutting, colour systems, chemical work and scalp health.',
        'Professional Makeup Artistry': 'Certificate | 6 Months. Makeup techniques for beauty, bridal, editorial and special effects.',
        'Nail Technology & Art': 'Certificate | 6 Months. Manicure, pedicure, nail extensions, nail art and business skills.',
        "Barbering & Men's Grooming": "Certificate | 6 Months. Haircutting, shaving, beard design and men's grooming.",
        'Spa Therapy & Wellness': 'Certificate | 6 Months. Massage, body treatments, aromatherapy and holistic wellness.',
        'Skincare & Facial Therapy': 'Certificate | 6 Months. Facial treatments, skincare analysis and product knowledge.',
        'Beauty Business Management': 'Certificate | 3 Months. Salon management, marketing, customer care and finance.',
        'Short Courses & Workshops': 'Various | Flexible. Short practical courses to upgrade your skills and boost your career.'
    };

    const showMessage = (element, text, type = '') => {
        if (!element) return;
        element.textContent = text || '';
        element.className = `form-message ${type}`;
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));

    const values = () => {
        const data = {};
        new FormData(form).forEach((value, key) => {
            if (!(value instanceof File)) data[key] = value;
        });
        return data;
    };

    const fieldLabel = (field) => field.closest('label')?.firstChild?.textContent?.replace(' *', '').trim() || field.name;

    function showEntry() {
        entry.hidden = false;
        dashboard.hidden = true;
        shell.hidden = true;
        intro.hidden = true;
        if (confirmationPanel) confirmationPanel.hidden = true;
        closeContinuePanel();
        document.title = 'Apply Online | FEWA Beauty & Fashion College';
    }

    function openContinuePanel() {
        showMessage(authMessage, '');
        if (continueOverlay) continueOverlay.hidden = false;
        document.getElementById('applicant-signin-email')?.focus();
    }

    function closeContinuePanel() {
        if (continueOverlay) continueOverlay.hidden = true;
    }

    function updateEntryContinueState() {
        if (!continueHint) return;
        if (currentUser && currentApplication) {
            const step = currentApplication.progress?.currentStep || 1;
            continueHint.hidden = false;
            continueHint.textContent = currentApplication.status === 'Draft'
                ? `You have an application in progress — step ${step} of ${steps.length}.`
                : `Your application status: ${currentApplication.status}.`;
        } else {
            continueHint.hidden = true;
            continueHint.textContent = '';
        }
    }

    function updateSecurityBadge() {
        if (!shellSecurityText || !shellSecureLink) return;
        if (currentUser?.isAnonymous) {
            shellSecurityText.textContent = 'Applying securely as a guest — your progress is private to this device.';
            shellSecureLink.hidden = false;
        } else if (currentUser) {
            shellSecurityText.textContent = `Signed in securely as ${currentUser.email || 'your account'}.`;
            shellSecureLink.hidden = true;
        }
    }

    function showAuthenticatedExperience(user, application) {
        currentUser = user;
        currentApplication = application;
        entry.hidden = true;
        dashboard.hidden = false;
        shell.hidden = true;
        intro.hidden = true;
        closeContinuePanel();
        document.title = 'Application Dashboard | FEWA Beauty & Fashion College';
        document.getElementById('applicant-dashboard-name').textContent = application?.personalInformation?.firstName || user.displayName?.split(' ')[0] || (user.email ? user.email.split('@')[0] : 'Applicant');
        renderDashboard(application);
    }

    function showApplicationForm(step = currentApplication?.progress?.currentStep || 1) {
        currentStep = Math.min(Math.max(Number(step) || 1, 1), steps.length);
        entry.hidden = true;
        dashboard.hidden = true;
        shell.hidden = false;
        intro.hidden = false;
        closeContinuePanel();
        const data = currentApplication || {};
        const flattened = { ...(data.personalInformation || {}), ...(data.academicInformation || {}), ...(data.programInformation || {}), ...(data.additionalInformation || {}) };
        Object.entries(flattened).forEach(([key, value]) => { const field = form.elements[key]; if (field && field.type !== 'file') field.value = value || ''; });
        const program = form.elements.program?.value;
        if (program) document.getElementById('program-summary').innerHTML = `<strong>${escapeHtml(program)}</strong><br><span>${escapeHtml(programDetails[program] || '')}</span>`;
        updateSecurityBadge();
        renderStep();
    }

    function renderDashboard(application) {
        const progressValue = Number(application?.progress?.percentage || 0);
        const program = application?.programInformation?.program || 'Not selected';
        const timestamp = application?.updatedAt?.toDate ? application.updatedAt.toDate() : application?.updatedAt ? new Date(application.updatedAt) : null;
        document.getElementById('application-progress-percent').textContent = `${progressValue}%`;
        document.getElementById('application-progress-bar').style.width = `${progressValue}%`;
        document.getElementById('application-progress-label').textContent = progressValue ? `${application.progress.completedSections || 0} of 5 sections completed.` : 'Start your application to track progress.';
        document.getElementById('application-status-badge').textContent = application?.status || 'Draft';
        document.getElementById('dashboard-application-number').textContent = application?.applicationNumber || 'Not started';
        document.getElementById('dashboard-programme').textContent = program;
        document.getElementById('dashboard-intake').textContent = application?.programInformation?.intake || 'Not selected';
        document.getElementById('dashboard-updated').textContent = timestamp ? timestamp.toLocaleDateString() : 'Not updated';
        document.getElementById('view-application').hidden = !application;
        document.getElementById('continue-application').textContent = application?.status === 'Draft' ? 'Continue Application' : 'View Application';
        const statuses = ['Draft', 'Submitted', 'Under Review', 'More Information Required', 'Accepted', 'Rejected'];
        const statusIndex = statuses.indexOf(application?.status || 'Draft');
        document.querySelectorAll('#application-status-timeline li').forEach((item, index) => item.classList.toggle('complete', index <= Math.min(statusIndex, 3)));
        renderNotifications(application?.notifications || []);
    }

    function renderNotifications(notifications) {
        const target = document.getElementById('applicant-notifications-preview');
        if (!notifications.length) {
            target.textContent = 'No new notifications.';
            return;
        }
        target.innerHTML = notifications.slice(0, 3).map((notification) => `<div class="dashboard-notification ${notification.read ? '' : 'unread'}"><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.message)}</span></div>`).join('');
    }

    function applicationPayload(data, status = currentApplication?.status || 'Draft') {
        const completed = [
            ['Personal Details', ['firstName', 'lastName', 'dateOfBirth', 'gender', 'nationality', 'email', 'phone', 'county', 'town', 'address']],
            ['Programme Selection', ['program', 'intake', 'studyMode']],
            ['Academic Background', ['educationLevel', 'institution', 'yearCompleted']],
            ['Supporting Documents', []],
            ['Review & Submit', ['declaration']]
        ];
        const done = completed.filter(([, fields]) => fields.every((field) => data[field])).length;
        const stableApplicationNumber = () => {
            const year = new Date().getFullYear();
            const uidHashSource = currentUser?.uid || 'anonymous';
            let hash = 0;
            for (const character of uidHashSource) {
                hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
            }

            const normalized = Math.abs(hash) % 900000 + 100000;
            const randomSuffix = (() => {
                if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                    const bytes = new Uint32Array(1);
                    window.crypto.getRandomValues(bytes);
                    return bytes[0] % 900000 + 100000;
                }
                return normalized;
            })();

            return `FEWA-${year}-${String(randomSuffix).padStart(6, '0')}`;
        };
        return {
            applicantUid: currentUser.uid,
            applicationNumber: currentApplication?.applicationNumber || stableApplicationNumber(),
            status,
            personalInformation: {
                firstName: data.firstName || '', middleName: data.middleName || '', lastName: data.lastName || '', dateOfBirth: data.dateOfBirth || '', gender: data.gender || '', nationality: data.nationality || '', identityNumber: data.identityNumber || '', email: data.email || currentUser.email || '', phone: data.phone || '', alternativePhone: data.alternativePhone || '', county: data.county || '', town: data.town || '', address: data.address || '', emergencyName: data.emergencyName || '', emergencyPhone: data.emergencyPhone || '', emergencyRelationship: data.emergencyRelationship || ''
            },
            academicInformation: {
                educationLevel: data.educationLevel || '', institution: data.institution || '', yearCompleted: data.yearCompleted || '', grade: data.grade || '', previousInstitution: data.previousInstitution || '', previousQualification: data.previousQualification || '', otherQualifications: data.otherQualifications || ''
            },
            programInformation: { program: data.program || '', intake: data.intake || '', studyMode: data.studyMode || '', campus: data.campus || '' },
            additionalInformation: { motivation: data.motivation || '', referralSource: data.referralSource || '', experience: data.experience || '', careerGoal: data.careerGoal || '', declaration: data.declaration === 'on' || data.declaration === true },
            documents: currentApplication?.documents || [],
            progress: { percentage: Math.round((done / 5) * 100), completedSections: done, currentStep },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    async function loadApplication(user) {
        let direct;
        try {
            direct = await db.collection('applications').doc(user.uid).get();
        } catch (error) {
            // firestore.rules evaluates resource.data on a non-existent document, which
            // throws (not "not found") for a brand-new applicant with no draft yet. This
            // read always targets the caller's OWN uid, so a permission-denied here can
            // only mean "no application exists yet" -- treat it as such rather than
            // surfacing a confusing error. (Not a security workaround: no other outcome
            // is possible for this exact query.)
            if (error?.code === 'permission-denied') return null;
            throw error;
        }
        const application = direct.exists ? { id: direct.id, ...direct.data() } : null;
        if (application) {
            const notificationSnapshot = await db.collection('applications').doc(application.id).collection('notifications').orderBy('createdAt', 'desc').limit(5).get().catch(() => ({ docs: [] }));
            application.notifications = notificationSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }
        return application;
    }

    async function ensureDraft() {
        if (currentApplication?.id) return currentApplication;
        const data = values();
        const draft = applicationPayload(data, 'Draft');
        const reference = db.collection('applications').doc(currentUser.uid);
        await reference.set({ ...draft, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        currentApplication = { id: reference.id, ...draft };
        return currentApplication;
    }

    async function saveDraft(showStatus = true) {
        const draft = await ensureDraft();
        const payload = applicationPayload(values(), draft.status === 'Submitted' ? draft.status : 'Draft');
        await db.collection('applications').doc(draft.id).set(payload, { merge: true });
        currentApplication = { ...currentApplication, ...payload };
        if (showStatus) showMessage(formMessage, 'Your application draft has been saved securely.', 'success');
        renderDashboard(currentApplication);
    }

    async function uploadDocuments(application) {
        const fields = [...form.querySelectorAll('input[type="file"]')];
        const uploaded = [...(application.documents || [])];
        for (const field of fields) {
            const file = field.files[0];
            if (!file) continue;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `applications/${application.id}/documents/${field.name}/${safeName}`;
            const task = storage.ref(path).put(file);
            await new Promise((resolve, reject) => task.on('state_changed', (snapshot) => {
                const status = field.closest('.upload-card')?.querySelector('.upload-status');
                if (status) status.textContent = `${Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)}% uploaded`;
            }, reject, resolve));
            const documentRecord = { name: field.name, fileName: file.name, filePath: path, size: file.size, type: file.type };
            const existingIndex = uploaded.findIndex((document) => document.name === field.name);
            if (existingIndex >= 0) uploaded[existingIndex] = documentRecord;
            else uploaded.push(documentRecord);
            const uploadStatus = field.closest('.upload-card')?.querySelector('.upload-status');
            if (uploadStatus) uploadStatus.textContent = 'Uploaded securely';
        }
        if (uploaded.length) {
            await db.collection('applications').doc(application.id).set({ documents: uploaded, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            currentApplication.documents = uploaded;
        }
    }

    // Same character set the server (Firestore rules / finalizeApplicationSubmission)
    // already validates phone numbers against. Checked here in plain JS rather than an
    // HTML `pattern` attribute -- three fields sharing an identical pattern attribute
    // was found to trip a real Chromium bug during native full-form submit validation
    // (throws an uncaught SyntaxError from inside the browser's own constraint
    // validation, independent of whether the pattern text itself is valid regex).
    const PHONE_PATTERN = /^[-0-9+ ()]{7,32}$/;

    function validateStep(number) {
        for (const field of [...steps[number - 1].querySelectorAll('input, select, textarea')]) {
            if (field.type === 'file') {
                if (field.required && !field.files.length && !(currentApplication?.documents || []).some((doc) => doc.name === field.name)) {
                    showMessage(formMessage, `${fieldLabel(field)} is required.`, 'error'); field.focus(); return false;
                }
                if (field.files[0] && (field.files[0].size > 5 * 1024 * 1024 || !/^image\/(jpeg|png)$|^application\/pdf$/.test(field.files[0].type))) {
                    showMessage(formMessage, `Please upload a PDF, JPG or PNG file up to 5 MB for ${fieldLabel(field)}.`, 'error'); field.focus(); return false;
                }
            } else if (!field.checkValidity()) {
                showMessage(formMessage, `${fieldLabel(field)} is required or invalid.`, 'error'); field.focus(); return false;
            } else if (field.type === 'tel' && field.value && !PHONE_PATTERN.test(field.value)) {
                showMessage(formMessage, `${fieldLabel(field)} must be a valid phone number.`, 'error'); field.focus(); return false;
            }
        }
        return true;
    }

    function renderStep() {
        steps.forEach((step, index) => step.classList.toggle('active', index + 1 === currentStep));
        progress.forEach((item, index) => { item.classList.toggle('active', index + 1 === currentStep); item.classList.toggle('complete', index + 1 < currentStep); });
        document.getElementById('previous-button').disabled = currentStep === 1;
        document.getElementById('next-button').hidden = currentStep === steps.length;
        document.getElementById('submit-button').hidden = currentStep !== steps.length || currentApplication?.status !== 'Draft';
        if (currentStep === steps.length) renderReview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderReview() {
        const data = values();
        const groups = [['Personal Information', ['firstName', 'middleName', 'lastName', 'dateOfBirth', 'gender', 'nationality', 'identityNumber', 'email', 'phone', 'county', 'town', 'address', 'emergencyName', 'emergencyPhone', 'emergencyRelationship'], 1], ['Programme Selection', ['program', 'intake', 'studyMode', 'campus'], 2], ['Academic Background', ['educationLevel', 'institution', 'yearCompleted', 'grade'], 3], ['Additional Information', ['motivation', 'referralSource', 'careerGoal'], 5]];
        document.getElementById('review-content').innerHTML = groups.map(([title, fields, step]) => `<section class="review-section"><div><h4>${title}</h4><button type="button" class="review-edit" data-edit="${step}">Edit</button></div>${fields.map((key) => data[key] ? `<p><b>${key.replace(/[A-Z]/g, (m) => ` ${m}`).replace(/^./, (m) => m.toUpperCase())}:</b> ${escapeHtml(data[key])}</p>` : '').join('')}</section>`).join('') + `<section class="review-section"><h4>Supporting Documents</h4>${(currentApplication?.documents || []).map((doc) => `<p><b>${escapeHtml(doc.name)}:</b> ${escapeHtml(doc.fileName)}</p>`).join('') || '<p>No documents uploaded yet.</p>'}</section>`;
        document.querySelectorAll('.review-edit').forEach((button) => button.addEventListener('click', () => { currentStep = Number(button.dataset.edit); renderStep(); }));
    }

    async function submitApplication() {
        if (submitting) return;
        if (!validateStep(6)) return;
        submitting = true;
        const button = document.getElementById('submit-button'); button.disabled = true; showMessage(formMessage, 'Submitting your application securely...', 'loading');
        try {
            const draft = await ensureDraft();
            if (!storage) throw new Error('Secure document storage is unavailable. Please try again later.');
            await uploadDocuments(draft);
            // Persist the latest field values as a Draft first -- anonymous sessions are always
            // permitted to save a Draft. The actual Draft -> Submitted transition (including
            // validation and generating the applicant's backend account) is then performed
            // server-side by the finalizeApplicationSubmission Cloud Function, using the Admin
            // SDK, so applicants never need to create a password before submitting.
            const draftPayload = applicationPayload(values(), 'Draft');
            await db.collection('applications').doc(draft.id).set(draftPayload, { merge: true });
            currentApplication = { ...currentApplication, ...draftPayload };

            if (typeof firebase.functions !== 'function') throw new Error('Secure submission service is unavailable. Please try again later.');
            const finalize = firebase.functions().httpsCallable('finalizeApplicationSubmission');
            await finalize();

            document.getElementById('application-shell').hidden = true;
            document.getElementById('application-dashboard').hidden = true;
            document.getElementById('confirmation').hidden = false;
            document.getElementById('application-number').textContent = currentApplication.applicationNumber;
        } catch (error) {
            showMessage(formMessage, error.message || 'We could not submit your application. Please try again.', 'error');
            button.disabled = false; submitting = false;
        }
    }

    function openSecurePanel() {
        const email = values().email || currentApplication?.personalInformation?.email || '';
        if (secureEmailDisplay) secureEmailDisplay.textContent = email || 'your email address';
        showMessage(secureMessage, '');
        if (secureForm) secureForm.reset();
        if (secureOverlay) secureOverlay.hidden = false;
        document.getElementById('secure-application-password')?.focus();
    }

    function closeSecurePanel() {
        if (secureOverlay) secureOverlay.hidden = true;
        if (secureForm) secureForm.reset();
        showMessage(secureMessage, '');
    }

    function openCheckStatusPanel() {
        if (checkStatusForm) checkStatusForm.reset();
        if (checkStatusResult) checkStatusResult.hidden = true;
        showMessage(checkStatusMessage, '');
        if (checkStatusOverlay) checkStatusOverlay.hidden = false;
        document.getElementById('check-status-reference')?.focus();
    }

    function closeCheckStatusPanel() {
        if (checkStatusOverlay) checkStatusOverlay.hidden = true;
    }

    const forceWizardOnLoad = new URLSearchParams(window.location.search).get('start') === '1';
    if (forceWizardOnLoad) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }

    async function authenticate() {
        if (!validConfig || !window.firebase) { showMessage(authMessage, 'Firebase Authentication is not configured. Add valid Firebase web settings to config.js.', 'error'); return; }
        if (!firebase.apps.length) firebase.initializeApp(config);
        auth = firebase.auth(); db = firebase.firestore(); storage = firebase.storage();
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                currentUser = undefined;
                currentApplication = undefined;
                showEntry();
                return;
            }
            currentUser = user;
            currentApplication = await loadApplication(user);
            updateSecurityBadge();
            if (forceWizardOnLoad) {
                showApplicationForm();
            } else if (currentApplication) {
                showAuthenticatedExperience(user, currentApplication);
            } else if (user.isAnonymous) {
                showApplicationForm(1);
            } else {
                updateEntryContinueState();
                showEntry();
            }
        });
    }

    startButton?.addEventListener('click', async () => {
        if (!validConfig || !window.firebase) { showMessage(authMessage, 'Firebase Authentication is not configured. Add valid Firebase web settings to config.js.', 'error'); return; }
        startButton.disabled = true;
        // Real sign-in + Firestore round trip can take a few seconds -- without this,
        // the button just goes quietly disabled and a user on a slower connection has
        // no way to tell the click registered at all.
        showMessage(authMessage, 'Starting your application...', 'loading');
        try {
            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }
            // Show the wizard directly in this same page load rather than reloading with
            // ?start=1 -- a full-page reload was found to sometimes lose the just-created
            // anonymous session (auth state isn't guaranteed to finish persisting before
            // the browser tears down the page for navigation), leaving the user back on
            // the entry screen with the click appearing to do nothing.
            currentUser = auth.currentUser;
            currentApplication = await loadApplication(currentUser);
            updateSecurityBadge();
            showMessage(authMessage, '');
            showApplicationForm(1);
        } catch (error) {
            showMessage(authMessage, (error?.code === 'auth/operation-not-allowed' || error?.code === 'auth/admin-restricted-operation')
                ? 'Guest applications are not enabled yet. Please contact FEWA admissions.'
                : (error.message || 'We could not start your application. Please try again in a moment.'), 'error');
            startButton.disabled = false;
        }
    });

    continueEntryButton?.addEventListener('click', async () => {
        if (auth?.currentUser) {
            continueEntryButton.disabled = true;
            try {
                currentUser = auth.currentUser;
                currentApplication = await loadApplication(currentUser);
                updateSecurityBadge();
                if (currentApplication) showAuthenticatedExperience(currentUser, currentApplication);
                else showApplicationForm(1);
            } finally {
                continueEntryButton.disabled = false;
            }
        } else {
            openContinuePanel();
        }
    });
    continueCancelButton?.addEventListener('click', closeContinuePanel);

    document.getElementById('applicant-signin-form').addEventListener('submit', async (event) => { event.preventDefault(); const button = document.getElementById('applicant-signin-button'); button.disabled = true; showMessage(authMessage, 'Signing you in...', 'loading'); try { await auth.signInWithEmailAndPassword(document.getElementById('applicant-signin-email').value.trim(), document.getElementById('applicant-signin-password').value); } catch (error) { showMessage(authMessage, error.message || 'Sign in failed.', 'error'); button.disabled = false; } });
    document.getElementById('applicant-reset-button').addEventListener('click', async () => { const email = document.getElementById('applicant-signin-email').value.trim(); if (!email) return showMessage(authMessage, 'Enter your email address first.', 'error'); try { await auth.sendPasswordResetEmail(email); } catch (error) { } showMessage(authMessage, 'If an account exists for that email, a password reset link has been sent.', 'success'); });
    document.getElementById('applicant-logout').addEventListener('click', () => {
        if (currentUser?.isAnonymous && !window.confirm('You have not secured your application with a password yet. If you sign out now on this device, you will not be able to access it again unless you sign back in. Sign out anyway?')) return;
        auth.signOut();
    });
    document.getElementById('continue-application').addEventListener('click', () => showApplicationForm());
    document.getElementById('view-application').addEventListener('click', () => showApplicationForm(6));
    document.getElementById('next-button').addEventListener('click', async () => { if (!validateStep(currentStep)) return; try { await saveDraft(false); currentStep++; await saveDraft(false); renderStep(); } catch (error) { showMessage(formMessage, error.message || 'Draft could not be saved.', 'error'); } });
    document.getElementById('previous-button').addEventListener('click', () => { if (currentStep > 1) { currentStep--; renderStep(); } });
    document.getElementById('save-button').addEventListener('click', () => saveDraft(true).catch((error) => showMessage(formMessage, error.message || 'Draft could not be saved.', 'error')));
    form.addEventListener('input', (event) => { if (event.target.name === 'program') document.getElementById('program-summary').innerHTML = event.target.value ? `<strong>${escapeHtml(event.target.value)}</strong><br><span>${escapeHtml(programDetails[event.target.value] || '')}</span>` : '<strong>Select a program to see its summary.</strong>'; if (event.target.type === 'file' && event.target.files[0]) event.target.closest('.upload-card').querySelector('.upload-status').textContent = event.target.files[0].name; });
    form.addEventListener('submit', (event) => { event.preventDefault(); submitApplication(); });
    progress.forEach((button, index) => button.addEventListener('click', () => { if (index + 1 < currentStep) { currentStep = index + 1; renderStep(); } }));

    secureForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.getElementById('secure-application-password').value;
        const confirmPassword = document.getElementById('secure-application-confirm').value;
        if (password !== confirmPassword) return showMessage(secureMessage, 'Passwords do not match.', 'error');
        const email = secureEmailDisplay?.textContent?.trim();
        if (!email || email === 'your email address') return showMessage(secureMessage, 'We could not find your email address. Please go back and complete Step 1 first.', 'error');
        const button = document.getElementById('secure-application-button');
        if (button) button.disabled = true;
        showMessage(secureMessage, 'Securing your application...', 'loading');
        try {
            if (auth.currentUser && auth.currentUser.isAnonymous) {
                const credential = firebase.auth.EmailAuthProvider.credential(email, password);
                const result = await auth.currentUser.linkWithCredential(credential);
                currentUser = result.user;
            } else if (!auth.currentUser) {
                const result = await auth.createUserWithEmailAndPassword(email, password);
                currentUser = result.user;
            }
            await currentUser.getIdToken(true);
            updateSecurityBadge();
            closeSecurePanel();
            showMessage(formMessage, 'Your application is now secured with a password.', 'success');
        } catch (error) {
            const inUse = error?.code === 'auth/email-already-in-use' || error?.code === 'auth/credential-already-in-use';
            showMessage(secureMessage, inUse
                ? 'An application already exists for this email. Sign out and sign in with that email to continue it instead.'
                : (error.message || 'We could not secure your application. Please try again.'), 'error');
        } finally {
            if (button) button.disabled = false;
        }
    });
    secureCancelButton?.addEventListener('click', closeSecurePanel);
    shellSecureLink?.addEventListener('click', () => openSecurePanel());

    checkStatusLink?.addEventListener('click', openCheckStatusPanel);
    checkStatusCancelButton?.addEventListener('click', closeCheckStatusPanel);
    checkStatusForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validConfig || !window.firebase || typeof firebase.functions !== 'function') {
            showMessage(checkStatusMessage, 'Status lookup is unavailable right now. Please try again later.', 'error');
            return;
        }
        const reference = document.getElementById('check-status-reference').value.trim();
        const contact = document.getElementById('check-status-contact').value.trim();
        const button = document.getElementById('check-status-button');
        if (button) button.disabled = true;
        if (checkStatusResult) checkStatusResult.hidden = true;
        showMessage(checkStatusMessage, 'Checking your application status...', 'loading');
        try {
            const isEmail = contact.includes('@');
            const check = firebase.functions().httpsCallable('checkApplicationStatus');
            const result = await check({
                applicationNumber: reference,
                email: isEmail ? contact : '',
                phone: isEmail ? '' : contact
            });
            const data = result.data;
            document.getElementById('check-status-result-number').textContent = data.applicationNumber || reference;
            const badge = document.getElementById('check-status-result-badge');
            if (badge) badge.textContent = data.status || 'Draft';
            document.getElementById('check-status-result-programme').textContent = data.programme || 'Not selected';
            document.getElementById('check-status-result-intake').textContent = data.intake || 'Not selected';
            document.getElementById('check-status-result-updated').textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : 'Not available';
            if (checkStatusResult) checkStatusResult.hidden = false;
            showMessage(checkStatusMessage, '');
        } catch (error) {
            showMessage(checkStatusMessage, error.message || 'We could not find an application matching those details. Please check your reference and contact details and try again.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    });

    authenticate();
})();

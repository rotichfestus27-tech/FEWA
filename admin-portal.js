(() => {
    const config = window.FEWA_CONFIG?.firebase;
    const validConfig = config?.apiKey && config?.projectId && config?.appId
        && !/^(YOUR_|REPLACE_)/.test(String(config.apiKey))
        && !/^(YOUR_|REPLACE_)/.test(String(config.appId));

    const state = { user: null, roles: [], applications: [], students: [], programmes: [], trainers: [], staff: [], selected: null };
    const $ = (selector) => document.querySelector(selector);

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));

    const message = (text, type = '') => {
        const target = $('#admin-message');
        if (target) { target.textContent = text; target.className = `admin-message ${type}`; }
    };

    const hasRole = (role) => state.roles.includes(role);
    const staff = () => hasRole('admin') || hasRole('superadmin') || hasRole('admissions');
    const superadmin = () => hasRole('superadmin');
    const timestamp = (value) => value?.toDate ? value.toDate().toLocaleString() : value ? new Date(value).toLocaleString() : 'Not available';

    function show(view) {
        document.querySelectorAll('[data-admin-view]').forEach(section => { section.hidden = section.dataset.adminView !== view; });
        document.querySelectorAll('[data-admin-nav]').forEach(button => button.classList.toggle('active', button.dataset.adminNav === view));
        const title = $('#admin-title');
        if (title) title.textContent = view.charAt(0).toUpperCase() + view.slice(1);
        $('#admin-app')?.classList.remove('menu-open');
    }

    function applicationName(application) {
        const person = application.personalInformation || {};
        return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed applicant';
    }

    function renderStats() {
        const counts = state.applications.reduce((result, application) => { result[application.status || 'Draft'] = (result[application.status || 'Draft'] || 0) + 1; return result; }, {});
        const totalEl = $('#stat-total'); if (totalEl) totalEl.textContent = state.applications.length;
        const subEl = $('#stat-submitted'); if (subEl) subEl.textContent = counts.Submitted || 0;
        const revEl = $('#stat-review'); if (revEl) revEl.textContent = (counts['Under Review'] || 0) + (counts['More Information Required'] || 0);
        const accEl = $('#stat-accepted'); if (accEl) accEl.textContent = counts.Accepted || 0;
    }

    function filteredApplications() {
        const queryEl = $('#application-search');
        const filterEl = $('#application-filter');
        const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        const status = filterEl ? filterEl.value : '';
        return state.applications.filter(application => {
            const haystack = `${applicationName(application)} ${application.applicationNumber || ''} ${application.personalInformation?.email || ''} ${application.programInformation?.program || ''}`.toLowerCase();
            return (!query || haystack.includes(query)) && (!status || application.status === status);
        });
    }

    function renderApplications() {
        const applications = filteredApplications();
        const bodyEl = $('#applications-body');
        if (!bodyEl) return;

        bodyEl.innerHTML = applications.length ? applications.map(application => `
            <tr>
                <td>${escapeHtml(application.applicationNumber || application.id)}</td>
                <td>${escapeHtml(applicationName(application))}<br><small>${escapeHtml(application.personalInformation?.email || '')}</small></td>
                <td>${escapeHtml(application.programInformation?.program || 'Not selected')}</td>
                <td><span class="status-badge status-${escapeHtml((application.status || 'Draft').toLowerCase().replace(/[^a-z]+/g, '-'))}">${escapeHtml(application.status || 'Draft')}</span></td>
                <td>${escapeHtml(timestamp(application.updatedAt))}</td>
                <td><button type="button" class="admin-action" data-application="${escapeHtml(application.id)}">View</button></td>
            </tr>`).join('') : '<tr><td colspan="6">No applications match the current filters.</td></tr>';

        document.querySelectorAll('[data-application]').forEach(button => button.addEventListener('click', () => openApplication(button.dataset.application)));
    }

    function openApplication(id) {
        const application = state.applications.find(item => item.id === id);
        if (!application) return;
        state.selected = application;
        const person = application.personalInformation || {};
        const academic = application.academicInformation || {};
        const programme = application.programInformation || {};

        const detailEl = $('#application-detail'); if (detailEl) detailEl.hidden = false;
        const contentEl = $('#application-detail-content');

        if (contentEl) {
            contentEl.innerHTML = `
                <h3>${escapeHtml(applicationName(application))}</h3>
                <dl class="detail-grid">
                    <dt>Application number</dt><dd>${escapeHtml(application.applicationNumber || application.id)}</dd>
                    <dt>Email</dt><dd>${escapeHtml(person.email)}</dd>
                    <dt>Phone</dt><dd>${escapeHtml(person.phone)}</dd>
                    <dt>Identity number</dt><dd>${escapeHtml(person.identityNumber)}</dd>
                    <dt>Emergency contact</dt><dd>${escapeHtml(person.emergencyName)} (${escapeHtml(person.emergencyPhone)})</dd>
                    <dt>Education</dt><dd>${escapeHtml(academic.educationLevel)} - ${escapeHtml(academic.institution)} (${escapeHtml(academic.yearCompleted)})</dd>
                    <dt>Programme</dt><dd>${escapeHtml(programme.program)}</dd>
                    <dt>Intake</dt><dd>${escapeHtml(programme.intake)}</dd>
                    <dt>Submitted</dt><dd>${escapeHtml(timestamp(application.submittedAt))}</dd>
                    <dt>Documents</dt><dd>${(application.documents || []).map(d => escapeHtml(d.fileName || d.name)).join(', ') || 'None recorded'}</dd>
                </dl>`;
        }

        const statusEl = $('#application-status');
        if (statusEl) {
            statusEl.value = application.status || 'Draft';
            statusEl.disabled = !staff() || application.status === 'Accepted';
        }

        const promoteButton = $('#accept-create-student');
        if (promoteButton) {
            const canPromote = staff() && ['Submitted', 'Under Review', 'Accepted'].includes(application.status);
            promoteButton.hidden = !canPromote;
            promoteButton.textContent = application.status === 'Accepted' ? 'Ensure student record' : 'Accept and create student';
        }
    }

    async function updateApplicationStatus() {
        if (!state.selected || !staff()) return;
        const button = $('#save-application-status'); if (button) button.disabled = true;
        try {
            const statusEl = $('#application-status');
            const statusValue = statusEl ? statusEl.value : state.selected.status;
            await firebase.firestore().collection('applications').doc(state.selected.id).update({
                status: statusValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            state.selected.status = statusValue;
            renderApplications(); renderStats(); message('Application status updated.', 'success');
        } catch (error) {
            message('The application status could not be updated.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function promoteSelectedApplication() {
        if (!state.selected || !staff()) return;
        const button = $('#accept-create-student');
        if (button) button.disabled = true;
        message('Creating the student record securely...', '');
        try {
            const promote = firebase.functions().httpsCallable('promoteAcceptedApplication');
            const result = await promote({ applicationId: state.selected.id });
            await loadData();
            openApplication(state.selected.id);
            message(`Student ${result.data.studentId} is ready.`, 'success');
        } catch (error) {
            message(error?.message || 'The applicant could not be admitted.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function renderSimpleRows(target, records, columns, empty) {
        const el = $(target);
        if (!el) return;
        el.innerHTML = records.length ? records.map(record => `<tr>${columns.map(column => `<td>${escapeHtml(column(record))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${empty}</td></tr>`;
    }

    async function loadData() {
        if (typeof firebase === 'undefined' || !firebase.apps.length) return;
        const db = firebase.firestore();
        try {
            const snapshot = await db.collection('applications').orderBy('updatedAt', 'desc').limit(200).get();
            state.applications = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderApplications(); renderStats();
        } catch (error) {
            message('Applications could not be loaded.', 'error');
        }
    }

    async function loadStudents() {
        if (!hasRole('admin') && !superadmin() && !hasRole('admissions')) { message('Your role cannot view student records.', 'error'); return; }
        try {
            const snapshot = await firebase.firestore().collection('students').limit(200).get();
            state.students = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderSimpleRows('#students-body', state.students, [student => student.studentId || student.id, student => student.fullName || 'Unnamed', student => student.email || '', student => student.program || '', student => student.admissionStatus || ''], 'No student records found.');
            show('students');
        } catch (error) {
            message('Student records could not be loaded.', 'error');
        }
    }

    async function loadProgrammes() {
        try {
            const snapshot = await firebase.firestore().collection('programmes').limit(200).get();
            state.programmes = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderSimpleRows('#programmes-body', state.programmes, [programme => programme.title || programme.name || 'Untitled', programme => programme.category || '', programme => programme.qualification || '', programme => programme.duration || ''], 'No programme records found.');
            show('programmes');
        } catch (error) {
            message('Programme records could not be loaded.', 'error');
        }
    }

    async function loadTrainers() {
        if (!hasRole('admin') && !superadmin()) { message('Your role cannot view trainer records.', 'error'); return; }
        try {
            const snapshot = await firebase.firestore().collection('trainers').limit(200).get();
            state.trainers = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderSimpleRows('#trainers-body', state.trainers, [trainer => trainer.name || 'Unnamed', trainer => trainer.email || '', trainer => trainer.speciality || trainer.specialty || '', trainer => trainer.active === false ? 'Inactive' : 'Active'], 'No trainer records found.');
            show('trainers');
        } catch (error) {
            message('Trainer records could not be loaded.', 'error');
        }
    }

    async function createProgramme(event) {
        event.preventDefault();
        const button = event.target.querySelector('button');
        if (button) button.disabled = true;
        try {
            await firebase.firestore().collection('programmes').add({
                title: $('#programme-title')?.value.trim() || '',
                category: $('#programme-category')?.value.trim() || '',
                qualification: $('#programme-qualification')?.value.trim() || '',
                duration: $('#programme-duration')?.value.trim() || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            event.target.reset();
            await loadProgrammes();
            message('Programme created.', 'success');
        } catch (error) {
            message('Programme could not be created.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function loadStaff() {
        if (!superadmin()) { message('Only a superadmin can manage staff roles.', 'error'); return; }
        try {
            const list = firebase.functions().httpsCallable('listStaffAccounts');
            const result = await list();
            state.staff = result.data?.accounts || [];
            renderStaff();
        } catch (error) {
            message(error?.message || 'Staff accounts could not be loaded.', 'error');
        }
    }

    function renderStaff() {
        const bodyEl = $('#staff-body');
        if (!bodyEl) return;
        bodyEl.innerHTML = state.staff.length ? state.staff.map(account => `
            <tr>
                <td>${escapeHtml(account.email)}${account.disabled ? ' <small>(disabled)</small>' : ''}</td>
                <td>${account.roles.map(role => `<span class="status-badge">${escapeHtml(role)}</span>`).join(' ')}</td>
                <td><button type="button" class="admin-action" data-staff-email="${escapeHtml(account.email)}">Edit</button></td>
            </tr>`).join('') : '<tr><td colspan="3">No staff accounts have roles yet.</td></tr>';
        document.querySelectorAll('[data-staff-email]').forEach(button => button.addEventListener('click', () => {
            const emailEl = $('#role-email'); if (emailEl) emailEl.value = button.dataset.staffEmail;
        }));
    }

    async function submitRoleChange(grant) {
        const email = $('#role-email')?.value.trim();
        const role = $('#role-select')?.value;
        if (!email || !role) return;
        const grantButton = $('#role-grant-button');
        const revokeButton = $('#role-revoke-button');
        if (grantButton) grantButton.disabled = true;
        if (revokeButton) revokeButton.disabled = true;
        message(grant ? 'Granting role...' : 'Revoking role...', '');
        try {
            const setRole = firebase.functions().httpsCallable('setUserRole');
            const result = await setRole({ email, role, grant });
            message(`${result.data.email} now has: ${result.data.roles.join(', ') || 'no roles'}.`, 'success');
            await loadStaff();
        } catch (error) {
            message(error?.message || 'The role could not be updated.', 'error');
        } finally {
            if (grantButton) grantButton.disabled = false;
            if (revokeButton) revokeButton.disabled = false;
        }
    }

    async function signOut() { await firebase.auth().signOut(); }

    function renderRoleState() {
        const roleEl = $('#admin-role'); if (roleEl) roleEl.textContent = state.roles.join(', ');
        const panelEl = $('#superadmin-panel'); if (panelEl) panelEl.hidden = !superadmin();
    }

    function initialize() {
        const loadingEl = $('#admin-loading');
        const loginEl = $('#admin-login');
        const appEl = $('#admin-app');
        const loginMessageEl = $('#login-message');

        if (!validConfig || !window.firebase) {
            if (loadingEl) loadingEl.hidden = true;
            if (loginEl) loginEl.hidden = false;
            if (loginMessageEl) loginMessageEl.textContent = 'Firebase Authentication is not configured.';
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(config);
        const auth = firebase.auth();

        auth.onAuthStateChanged(async user => {
            if (loadingEl) loadingEl.hidden = true;
            if (!user) {
                if (loginEl) loginEl.hidden = false;
                if (appEl) appEl.hidden = true;
                return;
            }
            try {
                const token = await user.getIdTokenResult(true);
                const roles = token.claims.roles;
                state.roles = Array.isArray(roles) ? roles : Object.keys(roles || {}).filter(role => roles[role] === true);
                if (!staff()) {
                    if (loginEl) loginEl.hidden = false;
                    if (appEl) appEl.hidden = true;
                    if (loginMessageEl) loginMessageEl.textContent = 'This account is not authorized for administration.';
                    await auth.signOut();
                    return;
                }
                state.user = user;
                if (loginEl) loginEl.hidden = true;
                if (appEl) appEl.hidden = false;
                const userEl = $('#admin-user'); if (userEl) userEl.textContent = user.email || user.uid;
                renderRoleState();
                await loadData();
                show('dashboard');
            } catch (error) {
                if (loginEl) loginEl.hidden = false;
                if (loginMessageEl) loginMessageEl.textContent = 'Administration access could not be verified.';
            }
        });

        $('#login-form')?.addEventListener('submit', async event => {
            event.preventDefault();
            const button = $('#login-button');
            if (button) button.disabled = true;
            if (loginMessageEl) loginMessageEl.textContent = 'Signing in...';
            try {
                await auth.signInWithEmailAndPassword($('#login-email').value.trim(), $('#login-password').value);
            } catch (error) {
                if (loginMessageEl) loginMessageEl.textContent = 'Sign-in failed. Check your email and password.';
                if (button) button.disabled = false;
            }
        });

        $('#reset-button')?.addEventListener('click', async () => {
            const email = $('#login-email')?.value.trim();
            if (!email) { if (loginMessageEl) loginMessageEl.textContent = 'Enter your email address first.'; return; }
            try { await auth.sendPasswordResetEmail(email); } catch (error) { /* Do not reveal whether the account exists. */ }
            if (loginMessageEl) { loginMessageEl.textContent = 'If an account exists for that email, a password reset link has been sent.'; loginMessageEl.className = 'admin-message success'; }
        });

        $('#logout-button')?.addEventListener('click', signOut);
        $('#admin-menu-button')?.addEventListener('click', () => { $('#admin-app')?.classList.toggle('menu-open'); });
        $('#application-search')?.addEventListener('input', renderApplications);
        $('#application-filter')?.addEventListener('change', renderApplications);
        $('#save-application-status')?.addEventListener('click', updateApplicationStatus);
        $('#accept-create-student')?.addEventListener('click', promoteSelectedApplication);
        $('#programme-form')?.addEventListener('submit', createProgramme);
        $('#detail-close')?.addEventListener('click', () => { const el = $('#application-detail'); if (el) el.hidden = true; });
        $('#role-form')?.addEventListener('submit', event => { event.preventDefault(); submitRoleChange(true); });
        $('#role-revoke-button')?.addEventListener('click', () => submitRoleChange(false));

        document.querySelectorAll('[data-admin-nav]').forEach(button => button.addEventListener('click', async () => {
            const view = button.dataset.adminNav;
            if (view === 'applications') { await loadData(); show(view); }
            else if (view === 'students') await loadStudents();
            else if (view === 'programmes') await loadProgrammes();
            else if (view === 'trainers') await loadTrainers();
            else if (view === 'superadmin') { await loadStaff(); show(view); }
            else show(view);
        }));
    }

    initialize();
})();

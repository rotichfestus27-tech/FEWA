(() => {
    const config = window.FEWA_CONFIG?.firebase;
    const validConfig = config?.apiKey && config?.projectId && config?.appId
        && !/^(YOUR_|REPLACE_)/.test(String(config.apiKey))
        && !/^(YOUR_|REPLACE_)/.test(String(config.appId));
    const state = { user: null, roles: [], applications: [], students: [], programmes: [], trainers: [], selected: null };
    const $ = (selector) => document.querySelector(selector);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const message = (text, type = '') => { const target = $('#admin-message'); target.textContent = text; target.className = `admin-message ${type}`; };
    const hasRole = (role) => state.roles.includes(role);
    const staff = () => hasRole('admin') || hasRole('superadmin') || hasRole('admissions');
    const superadmin = () => hasRole('superadmin');
    const timestamp = (value) => value?.toDate ? value.toDate().toLocaleString() : value ? new Date(value).toLocaleString() : 'Not available';

    function show(view) {
        document.querySelectorAll('[data-admin-view]').forEach(section => { section.hidden = section.dataset.adminView !== view; });
        document.querySelectorAll('[data-admin-nav]').forEach(button => button.classList.toggle('active', button.dataset.adminNav === view));
        $('#admin-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);
    }

    function applicationName(application) {
        const person = application.personalInformation || {};
        return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed applicant';
    }

    function renderStats() {
        const counts = state.applications.reduce((result, application) => { result[application.status || 'Draft'] = (result[application.status || 'Draft'] || 0) + 1; return result; }, {});
        $('#stat-total').textContent = state.applications.length;
        $('#stat-submitted').textContent = counts.Submitted || 0;
        $('#stat-review').textContent = (counts['Under Review'] || 0) + (counts['More Information Required'] || 0);
        $('#stat-accepted').textContent = counts.Accepted || 0;
    }

    function filteredApplications() {
        const query = $('#application-search').value.trim().toLowerCase();
        const status = $('#application-filter').value;
        return state.applications.filter(application => {
            const haystack = `${applicationName(application)} ${application.applicationNumber || ''} ${application.personalInformation?.email || ''} ${application.programInformation?.program || ''}`.toLowerCase();
            return (!query || haystack.includes(query)) && (!status || application.status === status);
        });
    }

    function renderApplications() {
        const applications = filteredApplications();
        $('#applications-body').innerHTML = applications.length ? applications.map(application => `<tr><td>${escapeHtml(application.applicationNumber || application.id)}</td><td>${escapeHtml(applicationName(application))}<br><small>${escapeHtml(application.personalInformation?.email || '')}</small></td><td>${escapeHtml(application.programInformation?.program || 'Not selected')}</td><td><span class="status-badge status-${escapeHtml((application.status || 'Draft').toLowerCase().replace(/[^a-z]+/g, '-'))}">${escapeHtml(application.status || 'Draft')}</span></td><td>${escapeHtml(timestamp(application.updatedAt))}</td><td><button type="button" class="admin-action" data-application="${escapeHtml(application.id)}">View</button></td></tr>`).join('') : '<tr><td colspan="6">No applications match the current filters.</td></tr>';
        document.querySelectorAll('[data-application]').forEach(button => button.addEventListener('click', () => openApplication(button.dataset.application)));
    }

    function openApplication(id) {
        const application = state.applications.find(item => item.id === id);
        if (!application) return;
        state.selected = application;
        const person = application.personalInformation || {};
        const academic = application.academicInformation || {};
        const programme = application.programInformation || {};
        $('#application-detail').hidden = false;
        $('#application-detail-content').innerHTML = `<h3>${escapeHtml(applicationName(application))}</h3><dl class="detail-grid"><dt>Application number</dt><dd>${escapeHtml(application.applicationNumber || application.id)}</dd><dt>Email</dt><dd>${escapeHtml(person.email)}</dd><dt>Phone</dt><dd>${escapeHtml(person.phone)}</dd><dt>Identity number</dt><dd>${escapeHtml(person.identityNumber)}</dd><dt>Emergency contact</dt><dd>${escapeHtml(person.emergencyName)} (${escapeHtml(person.emergencyPhone)})</dd><dt>Education</dt><dd>${escapeHtml(academic.educationLevel)} - ${escapeHtml(academic.institution)} (${escapeHtml(academic.yearCompleted)})</dd><dt>Programme</dt><dd>${escapeHtml(programme.program)}</dd><dt>Intake</dt><dd>${escapeHtml(programme.intake)}</dd><dt>Submitted</dt><dd>${escapeHtml(timestamp(application.submittedAt))}</dd><dt>Documents</dt><dd>${(application.documents || []).map(document => escapeHtml(document.fileName || document.name)).join(', ') || 'None recorded'}</dd></dl>`;
        $('#application-status').value = application.status || 'Draft';
        $('#application-status').disabled = !staff() || application.status === 'Accepted';
        const promoteButton = $('#accept-create-student');
        const canPromote = staff() && ['Submitted', 'Under Review', 'Accepted'].includes(application.status);
        promoteButton.hidden = !canPromote;
        promoteButton.textContent = application.status === 'Accepted' ? 'Ensure student record' : 'Accept and create student';
    }

    async function updateApplicationStatus() {
        if (!state.selected || !staff()) return;
        const button = $('#save-application-status'); button.disabled = true;
        try {
            await firebase.firestore().collection('applications').doc(state.selected.id).update({ status: $('#application-status').value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            state.selected.status = $('#application-status').value;
            renderApplications(); renderStats(); message('Application status updated.', 'success');
        } catch (error) { message('The application status could not be updated.', 'error'); }
        finally { button.disabled = false; }
    }

    async function promoteSelectedApplication() {
        if (!state.selected || !staff()) return;
        const button = $('#accept-create-student');
        button.disabled = true;
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
            button.disabled = false;
        }
    }

    function renderSimpleRows(target, records, columns, empty) {
        $(target).innerHTML = records.length ? records.map(record => `<tr>${columns.map(column => `<td>${escapeHtml(column(record))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${empty}</td></tr>`;
    }

    async function loadData() {
        const db = firebase.firestore();
        const snapshot = await db.collection('applications').orderBy('updatedAt', 'desc').limit(200).get().catch(() => db.collection('applications').limit(200).get());
        state.applications = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        renderApplications(); renderStats();
    }

    async function loadStudents() {
        if (!hasRole('admin') && !superadmin() && !hasRole('admissions')) { message('Your role cannot view student records.', 'error'); return; }
        try { const snapshot = await firebase.firestore().collection('students').limit(200).get(); state.students = snapshot.docs.map(document => ({ id: document.id, ...document.data() })); renderSimpleRows('#students-body', state.students, [student => student.studentId || student.id, student => student.fullName || 'Unnamed', student => student.email || '', student => student.program || '', student => student.admissionStatus || ''], 'No student records found.'); show('students'); } catch (error) { message('Student records could not be loaded.', 'error'); }
    }

    async function loadProgrammes() {
        try { const snapshot = await firebase.firestore().collection('programmes').limit(200).get(); state.programmes = snapshot.docs.map(document => ({ id: document.id, ...document.data() })); renderSimpleRows('#programmes-body', state.programmes, [programme => programme.title || programme.name || 'Untitled', programme => programme.category || '', programme => programme.qualification || '', programme => programme.duration || ''], 'No programme records found.'); show('programmes'); } catch (error) { message('Programme records could not be loaded.', 'error'); }
    }

    async function loadTrainers() {
        if (!hasRole('admin') && !superadmin()) { message('Your role cannot view trainer records.', 'error'); return; }
        try { const snapshot = await firebase.firestore().collection('trainers').limit(200).get(); state.trainers = snapshot.docs.map(document => ({ id: document.id, ...document.data() })); renderSimpleRows('#trainers-body', state.trainers, [trainer => trainer.name || 'Unnamed', trainer => trainer.email || '', trainer => trainer.speciality || trainer.specialty || '', trainer => trainer.active === false ? 'Inactive' : 'Active'], 'No trainer records found.'); show('trainers'); } catch (error) { message('Trainer records could not be loaded.', 'error'); }
    }

    async function createProgramme(event) {
        event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
        try { await firebase.firestore().collection('programmes').add({ title: $('#programme-title').value.trim(), category: $('#programme-category').value.trim(), qualification: $('#programme-qualification').value.trim(), duration: $('#programme-duration').value.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); event.target.reset(); await loadProgrammes(); message('Programme created.', 'success'); } catch (error) { message('Programme could not be created.', 'error'); } finally { button.disabled = false; }
    }

    async function signOut() { await firebase.auth().signOut(); }

    function renderRoleState() {
        $('#admin-role').textContent = state.roles.join(', ');
        $('#superadmin-panel').hidden = !superadmin();
    }

    function initialize() {
        if (!validConfig || !window.firebase) { $('#admin-loading').hidden = true; $('#admin-login').hidden = false; $('#login-message').textContent = 'Firebase Authentication is not configured.'; return; }
        if (!firebase.apps.length) firebase.initializeApp(config);
        const auth = firebase.auth();
        auth.onAuthStateChanged(async user => {
            $('#admin-loading').hidden = true;
            if (!user) { $('#admin-login').hidden = false; $('#admin-app').hidden = true; return; }
            try {
                const token = await user.getIdTokenResult(true);
                const roles = token.claims.roles;
                state.roles = Array.isArray(roles) ? roles : Object.keys(roles || {}).filter(role => roles[role] === true);
                if (!staff()) { $('#admin-login').hidden = false; $('#admin-app').hidden = true; $('#login-message').textContent = 'This account is not authorized for administration.'; await auth.signOut(); return; }
                state.user = user; $('#admin-login').hidden = true; $('#admin-app').hidden = false; $('#admin-user').textContent = user.email || user.uid; renderRoleState(); await loadData(); show('dashboard');
            } catch (error) { $('#admin-login').hidden = false; $('#login-message').textContent = 'Administration access could not be verified.'; }
        });
        $('#login-form').addEventListener('submit', async event => { event.preventDefault(); const button = $('#login-button'); button.disabled = true; $('#login-message').textContent = 'Signing in...'; try { await auth.signInWithEmailAndPassword($('#login-email').value.trim(), $('#login-password').value); } catch (error) { $('#login-message').textContent = 'Sign-in failed. Check your email and password.'; button.disabled = false; } });
        $('#logout-button').addEventListener('click', signOut); $('#application-search').addEventListener('input', renderApplications); $('#application-filter').addEventListener('change', renderApplications); $('#save-application-status').addEventListener('click', updateApplicationStatus); $('#accept-create-student').addEventListener('click', promoteSelectedApplication); $('#programme-form').addEventListener('submit', createProgramme); $('#detail-close').addEventListener('click', () => { $('#application-detail').hidden = true; });
        document.querySelectorAll('[data-admin-nav]').forEach(button => button.addEventListener('click', async () => { const view = button.dataset.adminNav; if (view === 'applications') { await loadData(); show(view); } else if (view === 'students') await loadStudents(); else if (view === 'programmes') await loadProgrammes(); else if (view === 'trainers') await loadTrainers(); else show(view); }));
    }
    initialize();
})();

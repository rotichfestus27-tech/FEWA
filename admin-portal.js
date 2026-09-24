(() => {
    const config = window.FEWA_CONFIG?.firebase;
    const validConfig = config?.apiKey && config?.projectId && config?.appId
        && !/^(YOUR_|REPLACE_)/.test(String(config.apiKey))
        && !/^(YOUR_|REPLACE_)/.test(String(config.appId));

    const state = {
        user: null, roles: [], applications: [], students: [], programmes: [], trainers: [], staff: [], selected: null, selectedStudent: null, studentSubData: {}, applicationBackground: undefined,
        assignments: [], assignmentEditingId: null,
        materials: [], materialEditingId: null, materialSelectedUid: '', materialStudentOptions: null, materialStudentPickerError: null
    };
    const $ = (selector) => document.querySelector(selector);

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));

    const message = (text, type = '') => {
        const target = $('#admin-message');
        if (target) { target.textContent = text; target.className = `admin-message ${type}`; }
    };

    // #application-detail and #student-detail are full-screen overlays (z-index: 100)
    // that visually cover #admin-message, which sits in the normal page flow behind
    // them. Actions taken from inside either overlay must report through its own
    // in-panel element instead, or the result is invisible to the admin.
    const detailMessage = (text, type = '') => {
        const target = $('#application-detail-message');
        if (target) { target.textContent = text; target.className = `admin-message ${type}`; }
    };
    const studentMessage = (text, type = '') => {
        const target = $('#student-detail-message');
        if (target) { target.textContent = text; target.className = `admin-message ${type}`; }
    };

    const hasRole = (role) => state.roles.includes(role);
    const staff = () => hasRole('admin') || hasRole('superadmin') || hasRole('admissions');
    const superadmin = () => hasRole('superadmin');
    const timestamp = (value) => value?.toDate ? value.toDate().toLocaleString() : value ? new Date(value).toLocaleString() : 'Not available';

    // ------------------------------------------------------------------
    // STUDENT MANAGEMENT -- role predicates
    // ------------------------------------------------------------------
    // These mirror firestore.rules exactly (see isAdmin()/hasRole() there) so the UI
    // never offers an action a role cannot actually perform. Do not loosen these
    // without changing firestore.rules first -- they are read-outs of that file,
    // not an independent permission system.
    const isAdminRole = () => hasRole('admin') || hasRole('superadmin');
    // results/timetable/attendance/submissions: firestore.rules grants read+write to
    // isAdmin() (admin/superadmin) and hasRole('lecturer') identically for staff.
    const canManageAcademic = () => isAdminRole() || hasRole('lecturer');
    // storage.rules for students/{uid}/submissions/**/{fileName} only allows admin/superadmin
    // to read the file itself -- narrower than the Firestore submissions read rule, which also
    // allows 'lecturer'. A lecturer can see the submission row but not download the file.
    const canDownloadSubmissionFile = () => isAdminRole();
    const canManageFees = () => isAdminRole() || hasRole('finance');
    const canReadDocuments = () => isAdminRole() || hasRole('finance') || hasRole('admissions');
    // students/{uid} update rule grants unrestricted field writes to superadmin/admissions
    // only -- plain 'admin' is NOT included, so it must stay read-only here.
    const canUpdateStudentProfile = () => hasRole('superadmin') || hasRole('admissions');

    // ------------------------------------------------------------------
    // PHASE 2 -- role predicates (assignments / learning materials)
    // ------------------------------------------------------------------
    // firestore.rules `assignments` collection: the staff branch is exactly
    // isAdmin() || hasRole('lecturer') for both read and write -- 'admissions'
    // is NOT included, so it must not see this section as if it could.
    const canReadAssignments = () => isAdminRole() || hasRole('lecturer');
    const canWriteAssignments = () => isAdminRole() || hasRole('lecturer');
    // firestore.rules `learning_materials` write rule is hasRole('lecturer') ||
    // hasRole('superadmin') ONLY -- unlike assignments, plain 'admin' is excluded here.
    const canManageMaterials = () => hasRole('superadmin') || hasRole('lecturer');

    // ------------------------------------------------------------------
    // STUDENT PROFILE -- role predicates (Academic background / Communication)
    // ------------------------------------------------------------------
    // firestore.rules `applications/{appId}` read rule (isApplicationStaff()) is
    // isAdmin() || hasRole('admissions') -- notably NOT 'finance' or 'lecturer', so
    // the application cross-reference must stay narrower than canReadDocuments().
    const canReadApplicationReference = () => isAdminRole() || hasRole('admissions');
    // notifications/messages read rule is isAdmin() || lecturer || admissions.
    const canReadCommunication = () => isAdminRole() || hasRole('lecturer') || hasRole('admissions');

    const OVERVIEW_FIELDS = [
        { key: 'fullName', label: 'Full name' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        { key: 'emergencyContact', label: 'Emergency contact' },
        { key: 'program', label: 'Programme' },
        { key: 'semester', label: 'Semester' },
        { key: 'admissionStatus', label: 'Admission status' }
    ];

    // Field names match what portal.html already reads/renders for each subcollection --
    // see the architecture audit. Nothing here invents a new schema.
    const STUDENT_SUBCOLLECTIONS = {
        results: {
            label: 'Results', singular: 'result', collection: 'results', actionType: 'crud',
            fields: [
                { key: 'course', label: 'Course/Unit', required: true },
                { key: 'grade', label: 'Grade' },
                { key: 'score', label: 'Score' }
            ],
            canRead: () => canManageAcademic(), canWrite: () => canManageAcademic()
        },
        timetable: {
            label: 'Timetable', singular: 'timetable entry', collection: 'timetable', actionType: 'crud',
            fields: [
                { key: 'day', label: 'Day', required: true },
                { key: 'activity', label: 'Activity', required: true }
            ],
            canRead: () => canManageAcademic(), canWrite: () => canManageAcademic()
        },
        attendance: {
            label: 'Attendance', singular: 'attendance record', collection: 'attendance', actionType: 'crud',
            fields: [
                { key: 'date', label: 'Date', required: true },
                { key: 'unit', label: 'Unit/Module' },
                { key: 'status', label: 'Status', required: true },
                { key: 'semester', label: 'Semester' },
                { key: 'trainer', label: 'Trainer' }
            ],
            canRead: () => canManageAcademic(), canWrite: () => canManageAcademic()
        },
        fees: {
            label: 'Fees', singular: 'fee record', collection: 'fees', actionType: 'crud',
            fields: [
                { key: 'term', label: 'Term/Period', required: true },
                { key: 'amount', label: 'Amount' },
                { key: 'status', label: 'Status' },
                { key: 'balance', label: 'Balance' }
            ],
            canRead: () => canManageFees(), canWrite: () => canManageFees()
        },
        documents: {
            label: 'Documents', collection: 'documents', actionType: 'view', viewLabel: 'View',
            fields: [
                { key: 'name', label: 'Name' },
                { key: 'category', label: 'Category' }
            ],
            canRead: () => canReadDocuments(), canWrite: () => false,
            readOnlyReason: 'Uploading documents is not part of this phase -- storage.rules currently blocks staff writes to student documents (allow write: if false), so this view is read-only.'
        },
        submissions: {
            label: 'Submissions', collection: 'submissions', actionType: 'view', viewLabel: 'View file', gradable: true,
            fields: [
                { key: 'assignmentId', label: 'Assignment' },
                { key: 'fileName', label: 'File' },
                { key: 'status', label: 'Status' },
                { key: 'grade', label: 'Grade' }
            ],
            // Grading (grade/feedback/gradedAt/gradedBy) is handled by a dedicated form
            // (see submitGradeForm/openGradeForm below), not the generic CRUD engine --
            // submissions are created by students, not admin, so "add a record" doesn't
            // apply here the way it does for results/timetable/attendance/fees.
            canRead: () => canManageAcademic(), canWrite: () => false
        }
    };

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
        detailMessage('');
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

        // firestore.rules: allow delete: if isApplicationStaff() -- exactly matches staff() here.
        const deleteButton = $('#delete-application');
        if (deleteButton) deleteButton.hidden = !staff();
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
            renderApplications(); renderStats(); detailMessage('Application status updated.', 'success');
        } catch (error) {
            detailMessage('The application status could not be updated.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    // Same redirect target used by the manual "Send password reset email" button
    // in the student detail panel -- both lead to account-setup.html's branded
    // "create your password" page instead of Firebase's generic default one.
    const ACTIVATION_REDIRECT = { url: `${window.location.origin}/account-setup.html`, handleCodeInApp: false };

    async function promoteSelectedApplication() {
        if (!state.selected || !staff()) return;
        const button = $('#accept-create-student');
        if (button) button.disabled = true;
        detailMessage('Creating the student record securely...', '');
        try {
            const promote = firebase.functions().httpsCallable('promoteAcceptedApplication');
            const result = await promote({ applicationId: state.selected.id });
            const studentEmail = state.selected.personalInformation?.email;
            let activationNote = '';
            // Only send on a genuinely new acceptance (not idempotent) -- re-clicking
            // "Ensure student record" on an already-accepted, already-set-up student
            // must not repeatedly re-send them activation emails.
            if (!result.data.idempotent && studentEmail) {
                try {
                    await firebase.auth().sendPasswordResetEmail(studentEmail, ACTIVATION_REDIRECT);
                    activationNote = ` An activation email has been sent to ${studentEmail}.`;
                } catch (emailError) {
                    activationNote = ' The student record was created, but the activation email could not be sent automatically -- use "Send password reset email" in the student\'s profile to resend it.';
                }
            }
            await loadData();
            openApplication(state.selected.id);
            detailMessage(`Student ${result.data.studentId} is ready.${activationNote}`, 'success');
        } catch (error) {
            detailMessage(error?.message || 'The applicant could not be admitted.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function deleteSelectedApplication() {
        if (!state.selected || !staff()) return;
        const name = applicationName(state.selected);
        if (!window.confirm(`Delete the application for ${name}? This cannot be undone.`)) return;
        const button = $('#delete-application');
        if (button) button.disabled = true;
        try {
            await firebase.firestore().collection('applications').doc(state.selected.id).delete();
            const detailEl = $('#application-detail'); if (detailEl) detailEl.hidden = true;
            state.selected = null;
            await loadData();
            message('Application deleted.', 'success');
        } catch (error) {
            detailMessage(error?.message || 'The application could not be deleted.', 'error');
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
        const bodyEl = $('#students-body');
        if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6">Loading students...</td></tr>';
        try {
            const snapshot = await firebase.firestore().collection('students').limit(200).get();
            state.students = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            populateStudentFilters();
            renderStudents();
            show('students');
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6">Student records could not be loaded.</td></tr>';
            message('Student records could not be loaded.', 'error');
        }
    }

    function filteredStudents() {
        const queryEl = $('#student-search');
        const programmeEl = $('#student-programme-filter');
        const statusEl = $('#student-status-filter');
        const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        const programme = programmeEl ? programmeEl.value : '';
        const status = statusEl ? statusEl.value : '';
        return state.students.filter(student => {
            const haystack = `${student.fullName || ''} ${student.studentId || ''} ${student.email || ''}`.toLowerCase();
            return (!query || haystack.includes(query))
                && (!programme || student.program === programme)
                && (!status || student.admissionStatus === status);
        });
    }

    function populateStudentFilters() {
        const programmeEl = $('#student-programme-filter');
        const statusEl = $('#student-status-filter');
        if (programmeEl) {
            const current = programmeEl.value;
            const programmes = [...new Set(state.students.map(student => student.program).filter(Boolean))].sort();
            programmeEl.innerHTML = '<option value="">All programmes</option>' + programmes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
            programmeEl.value = current;
        }
        if (statusEl) {
            const current = statusEl.value;
            const statuses = [...new Set(state.students.map(student => student.admissionStatus).filter(Boolean))].sort();
            statusEl.innerHTML = '<option value="">All statuses</option>' + statuses.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
            statusEl.value = current;
        }
    }

    function renderStudents() {
        const bodyEl = $('#students-body');
        if (!bodyEl) return;
        if (!state.students.length) {
            bodyEl.innerHTML = '<tr><td colspan="6">No student records found.</td></tr>';
            return;
        }
        const students = filteredStudents();
        bodyEl.innerHTML = students.length ? students.map(student => `
            <tr>
                <td>${escapeHtml(student.studentId || student.id)}</td>
                <td>${escapeHtml(student.fullName || 'Unnamed')}</td>
                <td>${escapeHtml(student.email || '')}</td>
                <td>${escapeHtml(student.program || '')}</td>
                <td>${escapeHtml(student.admissionStatus || '')}</td>
                <td><button type="button" class="admin-action" data-student="${escapeHtml(student.id)}">View</button></td>
            </tr>`).join('') : '<tr><td colspan="6">No students match the current filters.</td></tr>';
        document.querySelectorAll('[data-student]').forEach(button => button.addEventListener('click', () => openStudent(button.dataset.student)));
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL VIEW
    // ------------------------------------------------------------------

    function openStudent(uid) {
        const student = state.students.find(item => item.id === uid);
        if (!student) return;
        state.selectedStudent = student;
        state.studentSubData = {};
        state.applicationBackground = undefined; // undefined = not fetched yet this open; null = fetched, none found
        closeGradeForm();
        const titleEl = $('#student-detail-title'); if (titleEl) titleEl.textContent = student.fullName || student.studentId || 'Student';
        const messageEl = $('#student-detail-message'); if (messageEl) { messageEl.textContent = ''; messageEl.className = 'admin-message'; }
        const detailEl = $('#student-detail'); if (detailEl) detailEl.hidden = false;
        renderStudentHeader();
        switchStudentTab('overview');
    }

    function closeStudent() {
        const detailEl = $('#student-detail'); if (detailEl) detailEl.hidden = true;
        state.selectedStudent = null;
        state.studentSubData = {};
        state.applicationBackground = undefined;
    }

    function renderStudentHeader() {
        const student = state.selectedStudent;
        if (!student) return;
        const avatarEl = $('#student-header-avatar');
        if (avatarEl) {
            avatarEl.innerHTML = student.profilePicture
                ? `<img src="${escapeHtml(student.profilePicture)}" alt="">`
                : escapeHtml((student.fullName || student.studentId || '?').charAt(0).toUpperCase());
        }
        const nameEl = $('#student-header-name'); if (nameEl) nameEl.textContent = student.fullName || 'Unnamed student';
        const metaEl = $('#student-header-meta');
        if (metaEl) {
            const parts = [
                student.studentId || 'No student ID',
                student.program || 'No programme',
                student.intake ? `Intake: ${student.intake}` : null,
                student.createdAt ? `Enrolled: ${timestamp(student.createdAt)}` : null
            ].filter(Boolean);
            metaEl.innerHTML = parts.map(part => `<span>${escapeHtml(part)}</span>`).join('');
        }
        const statusEl = $('#student-header-status');
        if (statusEl) statusEl.textContent = student.admissionStatus || 'Status unknown';
    }

    function switchStudentTab(tab) {
        document.querySelectorAll('[data-student-tab]').forEach(button => button.classList.toggle('active', button.dataset.studentTab === tab));
        document.querySelectorAll('[data-student-panel]').forEach(panel => { panel.hidden = panel.dataset.studentPanel !== tab; });
        if (tab === 'overview') renderStudentOverview();
        else if (tab === 'academic') {
            const activeSub = document.querySelector('[data-academic-subtab].active')?.dataset.academicSubtab || 'results';
            switchAcademicSubtab(activeSub);
        } else if (tab === 'communication') loadCommunication();
        else if (tab === 'account') loadAccountTab();
        else if (STUDENT_SUBCOLLECTIONS[tab]) loadStudentSubcollection(tab);
    }

    function switchAcademicSubtab(subtab) {
        document.querySelectorAll('[data-academic-subtab]').forEach(button => button.classList.toggle('active', button.dataset.academicSubtab === subtab));
        document.querySelectorAll('[data-academic-subpanel]').forEach(panel => { panel.hidden = panel.dataset.academicSubpanel !== subtab; });
        closeGradeForm();
        loadStudentSubcollection(subtab);
    }

    function renderStudentOverview() {
        const student = state.selectedStudent;
        const gridEl = $('#student-overview-grid');
        if (gridEl && student) {
            gridEl.innerHTML = `
                <dt>Student ID</dt><dd>${escapeHtml(student.studentId || 'Not available')}</dd>
                <dt>Email</dt><dd>${escapeHtml(student.email || 'Not available')}</dd>
                <dt>Full name</dt><dd>${escapeHtml(student.fullName || 'Not available')}</dd>
                <dt>Phone</dt><dd>${escapeHtml(student.phone || 'Not available')}</dd>
                <dt>Address</dt><dd>${escapeHtml(student.address || 'Not available')}</dd>
                <dt>Emergency contact</dt><dd>${escapeHtml(student.emergencyContact || 'Not available')}</dd>
                <dt>Programme</dt><dd>${escapeHtml(student.program || 'Not available')}</dd>
                <dt>Semester</dt><dd>${escapeHtml(student.semester || 'Not available')}</dd>
                <dt>Admission status</dt><dd>${escapeHtml(student.admissionStatus || 'Not available')}</dd>
                <dt>Profile picture</dt><dd>${student.profilePicture ? `<img class="student-overview-picture" src="${escapeHtml(student.profilePicture)}" alt="">` : 'Not available'}</dd>
            `;
        }
        const formEl = $('#student-overview-form');
        const noteEl = $('#student-overview-permission-note');
        if (formEl) {
            if (student && canUpdateStudentProfile()) {
                formEl.hidden = false;
                OVERVIEW_FIELDS.forEach(field => {
                    const input = document.getElementById(`student-edit-${field.key}`);
                    if (!input) return;
                    const value = student[field.key] || '';
                    // admissionStatus is a <select> with a fixed option set -- if the stored value
                    // doesn't match any of them (e.g. an older free-text value), add it as an extra
                    // option rather than silently discarding it on next save.
                    if (input.tagName === 'SELECT' && value && ![...input.options].some(option => option.value === value)) {
                        input.add(new Option(value, value));
                    }
                    input.value = value;
                });
                if (noteEl) noteEl.textContent = '';
            } else {
                formEl.hidden = true;
                if (noteEl) noteEl.textContent = 'Your role can view this profile but cannot edit it. Editing student profiles is limited to Superadmin and Admissions staff (see firestore.rules).';
            }
        }
        loadApplicationBackground();
    }

    async function saveStudentOverview(event) {
        event.preventDefault();
        if (!state.selectedStudent || !canUpdateStudentProfile()) return;
        const button = event.target.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const updates = {};
            OVERVIEW_FIELDS.forEach(field => { const input = document.getElementById(`student-edit-${field.key}`); if (input) updates[field.key] = input.value.trim(); });
            await firebase.firestore().collection('students').doc(state.selectedStudent.id).update({ ...updates, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            Object.assign(state.selectedStudent, updates);
            const index = state.students.findIndex(student => student.id === state.selectedStudent.id);
            if (index !== -1) Object.assign(state.students[index], updates);
            renderStudentOverview();
            renderStudentHeader();
            renderStudents();
            studentMessage('Student profile updated.', 'success');
        } catch (error) {
            studentMessage(error?.message || 'The student profile could not be updated.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL -- subcollection tabs (results/timetable/attendance/fees/documents/submissions)
    // ------------------------------------------------------------------

    function subcollectionPanel(kind) {
        // results/timetable/submissions now live nested inside the Academic tab
        // (data-academic-subpanel) instead of being their own top-level tab panel
        // (data-student-panel) -- attendance/fees/documents are unaffected.
        return document.querySelector(`[data-student-panel="${kind}"], [data-academic-subpanel="${kind}"]`);
    }

    async function loadStudentSubcollection(kind) {
        const config = STUDENT_SUBCOLLECTIONS[kind];
        const panel = subcollectionPanel(kind);
        if (!config || !panel || !state.selectedStudent) return;
        const permissionEl = panel.querySelector('[data-panel-permission]');
        const bodyEl = panel.querySelector('[data-panel-body]');
        const theadEl = panel.querySelector('[data-panel-thead]');
        const formEl = panel.querySelector('[data-panel-form]');

        if (!config.canRead()) {
            if (permissionEl) { permissionEl.textContent = `Your role does not have access to ${config.label.toLowerCase()} (see firestore.rules).`; permissionEl.className = 'admin-message error'; }
            if (bodyEl) bodyEl.innerHTML = '';
            if (theadEl) theadEl.innerHTML = '';
            if (formEl) { formEl.hidden = true; formEl.innerHTML = ''; }
            return;
        }

        if (permissionEl) { permissionEl.textContent = config.readOnlyReason || ''; permissionEl.className = 'admin-muted'; }

        const showActionColumn = config.actionType === 'view' || config.canWrite();
        if (theadEl) theadEl.innerHTML = `<tr>${config.fields.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}${showActionColumn ? '<th></th>' : ''}</tr>`;

        if (formEl) {
            // The form element itself persists across reloads (only its children are
            // rebuilt below), so any in-progress edit state must be cleared here too --
            // otherwise a stale editingId can survive a tab-away-and-back cycle and
            // silently turn a new "Add" submission into an update of the old record.
            delete formEl.dataset.editingId;
            if (config.actionType === 'crud' && config.canWrite()) {
                formEl.hidden = false;
                formEl.innerHTML = `${config.fields.map(field => `<label>${escapeHtml(field.label)}<input data-field="${field.key}" ${field.required ? 'required' : ''}></label>`).join('')}<button type="submit" class="btn btn-primary">Add ${escapeHtml(config.singular || config.label.toLowerCase())}</button><button type="button" class="admin-action" data-cancel-edit hidden>Cancel edit</button>`;
                // Assigning .onsubmit (not addEventListener) so reloading this tab never
                // accumulates a second handler on the same persistent form element --
                // each assignment replaces the previous one instead of stacking.
                formEl.onsubmit = event => submitSubcollectionForm(kind, event);
                formEl.querySelector('[data-cancel-edit]')?.addEventListener('click', () => resetSubcollectionForm(kind));
            } else {
                formEl.hidden = true;
                formEl.innerHTML = '';
            }
        }

        if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="${config.fields.length + 1}">Loading...</td></tr>`;

        try {
            const collectionRef = firebase.firestore().collection('students').doc(state.selectedStudent.id).collection(config.collection);
            // orderBy('createdAt') silently EXCLUDES any document missing that field
            // (Firestore does not error, it just omits it) -- it never throws, so the
            // old catch()-only fallback never ran. Submissions are written by students
            // via a schema that doesn't include createdAt at all, so this always
            // returned zero rows for submissions specifically. Fall back whenever the
            // ordered query comes back empty, not only when it throws.
            let snapshot = await collectionRef.orderBy('createdAt', 'desc').limit(200).get().catch(() => null);
            if (!snapshot || snapshot.empty) snapshot = await collectionRef.limit(200).get();
            state.studentSubData[kind] = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderSubcollectionRows(kind);
            if (kind === 'fees') renderFeesSummary();
            if (kind === 'documents') loadApplicationDocuments();
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="${config.fields.length + 1}">${escapeHtml(config.label)} could not be loaded.</td></tr>`;
        }
    }

    // Pure arithmetic over the fee records already loaded above -- no new data, no
    // invented calculation, just totals of what's already displayed in the table.
    function renderFeesSummary() {
        const summaryEl = $('#student-fees-summary');
        const records = state.studentSubData.fees || [];
        if (!summaryEl) return;
        if (!records.length || !canManageFees()) { summaryEl.hidden = true; return; }
        const toNumber = value => { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
        const totalInvoiced = records.reduce((sum, record) => sum + toNumber(record.amount), 0);
        const totalOutstanding = records.reduce((sum, record) => sum + toNumber(record.balance), 0);
        const totalPaid = totalInvoiced - totalOutstanding;
        const fmt = n => n.toLocaleString();
        summaryEl.hidden = false;
        const totalEl = $('#student-fees-total'); if (totalEl) totalEl.textContent = fmt(totalInvoiced);
        const paidEl = $('#student-fees-paid'); if (paidEl) paidEl.textContent = fmt(totalPaid);
        const outstandingEl = $('#student-fees-outstanding'); if (outstandingEl) outstandingEl.textContent = fmt(totalOutstanding);
    }

    function renderSubcollectionRows(kind) {
        const config = STUDENT_SUBCOLLECTIONS[kind];
        const panel = subcollectionPanel(kind);
        const bodyEl = panel?.querySelector('[data-panel-body]');
        if (!bodyEl) return;
        const records = state.studentSubData[kind] || [];
        const showActionColumn = config.actionType === 'view' || config.canWrite();
        if (!records.length) {
            bodyEl.innerHTML = `<tr><td colspan="${config.fields.length + (showActionColumn ? 1 : 0)}">No ${config.label.toLowerCase()} recorded yet.</td></tr>`;
            return;
        }
        bodyEl.innerHTML = records.map(record => {
            // data-label mirrors each column's header text -- used by the narrow-viewport
            // card layout (see [data-academic-subpanel="submissions"] .admin-table CSS) to
            // label each value when the table collapses to stacked cards. Harmless no-op
            // for every other subcollection table, which stays a normal table at all widths.
            const cells = config.fields.map(field => `<td data-label="${escapeHtml(field.label)}">${escapeHtml(record[field.key] ?? 'Not available')}</td>`).join('');
            let actionCell = '';
            if (config.actionType === 'view') {
                const viewButton = `<button type="button" class="admin-action" data-sub-view="${escapeHtml(record.id)}">${escapeHtml(config.viewLabel || 'View')}</button>`;
                const gradeButton = config.gradable && canManageAcademic()
                    ? ` <button type="button" class="admin-action" data-sub-grade="${escapeHtml(record.id)}">${record.grade ? 'Edit grade' : 'Grade'}</button>`
                    : '';
                actionCell = `<td data-label="Actions">${viewButton}${gradeButton}</td>`;
            } else if (config.canWrite()) {
                actionCell = `<td data-label="Actions"><button type="button" class="admin-action" data-sub-edit="${escapeHtml(record.id)}">Edit</button> <button type="button" class="admin-action" data-sub-delete="${escapeHtml(record.id)}">Delete</button></td>`;
            }
            return `<tr>${cells}${actionCell}</tr>`;
        }).join('');

        bodyEl.querySelectorAll('[data-sub-edit]').forEach(button => button.addEventListener('click', () => editSubcollectionRecord(kind, button.dataset.subEdit)));
        bodyEl.querySelectorAll('[data-sub-delete]').forEach(button => button.addEventListener('click', () => deleteSubcollectionRecord(kind, button.dataset.subDelete)));
        bodyEl.querySelectorAll('[data-sub-view]').forEach(button => button.addEventListener('click', () => viewSubcollectionFile(kind, button.dataset.subView)));
        bodyEl.querySelectorAll('[data-sub-grade]').forEach(button => button.addEventListener('click', () => openGradeForm(button.dataset.subGrade)));
    }

    async function submitSubcollectionForm(kind, event) {
        event.preventDefault();
        const config = STUDENT_SUBCOLLECTIONS[kind];
        if (!state.selectedStudent || !config.canWrite()) return;
        const formEl = event.target;
        const editingId = formEl.dataset.editingId;
        const values = {};
        config.fields.forEach(field => { const input = formEl.querySelector(`[data-field="${field.key}"]`); if (input) values[field.key] = input.value.trim(); });
        const button = formEl.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const ref = firebase.firestore().collection('students').doc(state.selectedStudent.id).collection(config.collection);
            if (editingId) {
                await ref.doc(editingId).update({ ...values, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                await ref.add({ ...values, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            resetSubcollectionForm(kind);
            await loadStudentSubcollection(kind);
            studentMessage(`${config.label} saved.`, 'success');
        } catch (error) {
            studentMessage(error?.message || `The ${config.singular || config.label.toLowerCase()} could not be saved.`, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function editSubcollectionRecord(kind, id) {
        const config = STUDENT_SUBCOLLECTIONS[kind];
        const record = (state.studentSubData[kind] || []).find(item => item.id === id);
        const panel = subcollectionPanel(kind);
        const formEl = panel?.querySelector('[data-panel-form]');
        if (!record || !formEl) return;
        formEl.dataset.editingId = id;
        config.fields.forEach(field => { const input = formEl.querySelector(`[data-field="${field.key}"]`); if (input) input.value = record[field.key] ?? ''; });
        const submitButton = formEl.querySelector('button[type="submit"]');
        if (submitButton) submitButton.textContent = `Save ${config.singular || config.label.toLowerCase()}`;
        const cancelButton = formEl.querySelector('[data-cancel-edit]');
        if (cancelButton) cancelButton.hidden = false;
    }

    function resetSubcollectionForm(kind) {
        const config = STUDENT_SUBCOLLECTIONS[kind];
        const panel = subcollectionPanel(kind);
        const formEl = panel?.querySelector('[data-panel-form]');
        if (!formEl) return;
        formEl.reset();
        delete formEl.dataset.editingId;
        const submitButton = formEl.querySelector('button[type="submit"]');
        if (submitButton) submitButton.textContent = `Add ${config.singular || config.label.toLowerCase()}`;
        const cancelButton = formEl.querySelector('[data-cancel-edit]');
        if (cancelButton) cancelButton.hidden = true;
    }

    async function deleteSubcollectionRecord(kind, id) {
        const config = STUDENT_SUBCOLLECTIONS[kind];
        if (!state.selectedStudent || !config.canWrite()) return;
        if (!window.confirm(`Delete this ${config.singular || config.label.toLowerCase()}?`)) return;
        try {
            await firebase.firestore().collection('students').doc(state.selectedStudent.id).collection(config.collection).doc(id).delete();
            await loadStudentSubcollection(kind);
            studentMessage(`${config.label} record deleted.`, 'success');
        } catch (error) {
            studentMessage(error?.message || 'The record could not be deleted.', 'error');
        }
    }

    async function viewSubcollectionFile(kind, id) {
        const record = (state.studentSubData[kind] || []).find(item => item.id === id);
        if (!record) return;
        if (kind === 'submissions' && !canDownloadSubmissionFile()) {
            studentMessage('Your role can see this submission but cannot download the file -- storage.rules restricts file downloads to admin/superadmin.', 'error');
            return;
        }
        if (!record.filePath) { studentMessage('No file is attached to this record.', 'error'); return; }
        try {
            const url = await firebase.storage().ref(record.filePath).getDownloadURL();
            window.open(url, '_blank', 'noopener');
        } catch (error) {
            studentMessage('The file could not be opened.', 'error');
        }
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL -- Submission grading
    // Writes grade/feedback/gradedAt/gradedBy onto the EXISTING
    // students/{uid}/submissions/{assignmentId} document -- no new collection.
    // firestore.rules already permits this: the isAdmin()/lecturer branch of the
    // submissions update rule has no field restriction, while the student's own
    // branch is hard-restricted to fileName/filePath/submittedAt/status, so
    // students can never write these fields regardless of client code.
    // ------------------------------------------------------------------

    // Assignment titles aren't on the submission record itself (only assignmentId is) --
    // resolved on demand and cached, checking the already-loaded assignments list first
    // (populated whenever the top-level Assignments tab has been visited this session)
    // before falling back to a single-document fetch.
    async function resolveAssignmentTitle(assignmentId) {
        if (!state.assignmentTitleCache) state.assignmentTitleCache = {};
        if (state.assignmentTitleCache[assignmentId]) return state.assignmentTitleCache[assignmentId];
        const loaded = (state.assignments || []).find(item => item.id === assignmentId);
        if (loaded?.title) { state.assignmentTitleCache[assignmentId] = loaded.title; return loaded.title; }
        try {
            const doc = await firebase.firestore().collection('assignments').doc(assignmentId).get();
            const title = doc.exists ? (doc.data().title || '') : '';
            if (title) state.assignmentTitleCache[assignmentId] = title;
            return title;
        } catch (error) {
            return '';
        }
    }

    async function openGradeForm(id) {
        if (!canManageAcademic()) return;
        const record = (state.studentSubData.submissions || []).find(item => item.id === id);
        const formEl = $('#submission-grade-form');
        if (!record || !formEl) return;
        formEl.dataset.gradingId = id;
        const headingEl = $('#submission-grade-heading'); if (headingEl) headingEl.textContent = `Grade: ${record.assignmentId || 'Submission'}`;
        const idEl = $('#submission-grade-id'); if (idEl) idEl.textContent = '';
        const gradeInput = $('#submission-grade-value'); if (gradeInput) gradeInput.value = record.grade ?? '';
        const feedbackInput = $('#submission-grade-feedback'); if (feedbackInput) feedbackInput.value = record.feedback ?? '';
        formEl.hidden = false;
        gradeInput?.focus();
        if (record.assignmentId) {
            const title = await resolveAssignmentTitle(record.assignmentId);
            // The grade form may have been closed, or reopened for a different
            // submission, while this lookup was in flight -- don't overwrite in that case.
            if (formEl.dataset.gradingId !== id) return;
            if (title && headingEl) headingEl.textContent = `Grade: ${title}`;
            if (idEl) idEl.textContent = `Assignment ID: ${record.assignmentId}`;
        }
    }

    function closeGradeForm() {
        const formEl = $('#submission-grade-form');
        if (!formEl) return;
        formEl.hidden = true;
        delete formEl.dataset.gradingId;
        formEl.reset();
    }

    async function submitGradeForm(event) {
        event.preventDefault();
        if (!state.selectedStudent || !canManageAcademic()) return;
        const formEl = event.target;
        const id = formEl.dataset.gradingId;
        if (!id) return;
        const button = formEl.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const grade = $('#submission-grade-value')?.value.trim() || '';
            const feedback = $('#submission-grade-feedback')?.value.trim() || '';
            await firebase.firestore().collection('students').doc(state.selectedStudent.id).collection('submissions').doc(id).update({
                grade, feedback,
                gradedAt: firebase.firestore.FieldValue.serverTimestamp(),
                gradedBy: state.user?.email || state.user?.uid || 'staff',
                status: 'Graded'
            });
            closeGradeForm();
            await loadStudentSubcollection('submissions');
            studentMessage('Grade saved.', 'success');
        } catch (error) {
            studentMessage(error?.message || 'The grade could not be saved.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL -- Academic background & application documents
    // (read-only cross-reference to the original applications/{sourceApplicationId}
    // document -- nothing here is copied into the student record; it's the same
    // application data the Applications tab already shows, just surfaced here too.)
    // ------------------------------------------------------------------

    async function loadApplicationBackground() {
        const blockEl = $('#student-application-background');
        const gridEl = $('#student-application-background-grid');
        const student = state.selectedStudent;
        if (!blockEl || !gridEl || !student) return;
        if (!canReadApplicationReference() || !student.sourceApplicationId) { blockEl.hidden = true; return; }
        try {
            if (state.applicationBackground === undefined) {
                const snapshot = await firebase.firestore().collection('applications').doc(student.sourceApplicationId).get();
                state.applicationBackground = snapshot.exists ? snapshot.data() : null;
            }
            const application = state.applicationBackground;
            if (!application) { blockEl.hidden = true; return; }
            const person = application.personalInformation || {};
            const academic = application.academicInformation || {};
            const programme = application.programInformation || {};
            const rows = [
                ['Date of birth', person.dateOfBirth],
                ['Gender', person.gender],
                ['Nationality', person.nationality],
                ['County / Town', [person.county, person.town].filter(Boolean).join(' / ')],
                ['Alternative phone', person.alternativePhone],
                ['Education level', academic.educationLevel],
                ['Institution', academic.institution],
                ['Year completed', academic.yearCompleted],
                ['Grade', academic.grade],
                ['Study mode', programme.studyMode],
                ['Campus', programme.campus]
            ].filter(([, value]) => value);
            if (!rows.length) { blockEl.hidden = true; return; }
            gridEl.innerHTML = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
            blockEl.hidden = false;
        } catch (error) {
            blockEl.hidden = true;
        }
    }

    async function loadApplicationDocuments() {
        const blockEl = $('#student-application-documents-block');
        const listEl = $('#student-application-documents-list');
        const student = state.selectedStudent;
        if (!blockEl || !listEl || !student) return;
        if (!canReadApplicationReference() || !student.sourceApplicationId) { blockEl.hidden = true; return; }
        try {
            if (state.applicationBackground === undefined) {
                const snapshot = await firebase.firestore().collection('applications').doc(student.sourceApplicationId).get();
                state.applicationBackground = snapshot.exists ? snapshot.data() : null;
            }
            const documents = state.applicationBackground?.documents || [];
            if (!documents.length) { blockEl.hidden = true; return; }
            listEl.innerHTML = `<ul>${documents.map(document => `<li>${escapeHtml(document.fileName || document.name || 'Document')}</li>`).join('')}</ul>`;
            blockEl.hidden = false;
        } catch (error) {
            blockEl.hidden = true;
        }
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL -- Communication (read-only: notifications + messages)
    // Display only -- deliberately no compose/send UI in this phase.
    // ------------------------------------------------------------------

    async function loadCommunication() {
        const permissionEl = $('#student-communication-permission');
        const notificationsEl = $('#student-notifications-list');
        const messagesEl = $('#student-messages-list');
        if (!state.selectedStudent) return;
        if (!canReadCommunication()) {
            if (permissionEl) { permissionEl.textContent = 'Your role does not have access to notifications/messages (see firestore.rules).'; permissionEl.className = 'admin-message error'; }
            if (notificationsEl) notificationsEl.innerHTML = '';
            if (messagesEl) messagesEl.innerHTML = '';
            return;
        }
        if (permissionEl) { permissionEl.textContent = ''; permissionEl.className = 'admin-message'; }
        const renderList = (el, records, fields) => {
            if (!el) return;
            el.innerHTML = records.length
                ? records.map(record => `<div class="student-comm-item"><strong>${escapeHtml(record[fields.title] || 'Untitled')}</strong>${escapeHtml(record[fields.body] || '')}<div class="admin-muted">${escapeHtml(timestamp(record.createdAt))}${record.read ? '' : ' &middot; Unread'}</div></div>`).join('')
                : '<p class="admin-muted">None recorded.</p>';
        };
        try {
            const studentRef = firebase.firestore().collection('students').doc(state.selectedStudent.id);
            const [notificationsSnap, messagesSnap] = await Promise.all([
                studentRef.collection('notifications').orderBy('createdAt', 'desc').limit(50).get().catch(() => ({ docs: [] })),
                studentRef.collection('messages').orderBy('createdAt', 'desc').limit(50).get().catch(() => ({ docs: [] }))
            ]);
            renderList(notificationsEl, notificationsSnap.docs.map(document => document.data()), { title: 'title', body: 'message' });
            renderList(messagesEl, messagesSnap.docs.map(document => document.data()), { title: 'subject', body: 'body' });
        } catch (error) {
            if (notificationsEl) notificationsEl.innerHTML = '<p class="admin-muted">Could not be loaded.</p>';
            if (messagesEl) messagesEl.innerHTML = '<p class="admin-muted">Could not be loaded.</p>';
        }
    }

    // ------------------------------------------------------------------
    // STUDENT DETAIL -- Account
    // Only what's genuinely available client-side: email (from Firestore) and a
    // working password-reset action. Last-login / account-enabled status require
    // Firebase Auth admin access this portal doesn't have, so they are not shown
    // rather than guessed -- see the note already in the markup.
    // ------------------------------------------------------------------

    function loadAccountTab() {
        const student = state.selectedStudent;
        const gridEl = $('#student-account-grid');
        const resetButton = $('#student-reset-password');
        const messageEl = $('#student-account-message');
        if (messageEl) { messageEl.textContent = ''; messageEl.className = 'admin-message'; }
        if (gridEl && student) {
            gridEl.innerHTML = `
                <dt>Email</dt><dd>${escapeHtml(student.email || 'Not available')}</dd>
                <dt>Account type</dt><dd>Student</dd>
                <dt>Student record created</dt><dd>${escapeHtml(timestamp(student.createdAt))}</dd>
            `;
        }
        if (resetButton) resetButton.hidden = !canUpdateStudentProfile();
    }

    async function sendStudentPasswordReset() {
        const student = state.selectedStudent;
        if (!student || !student.email || !canUpdateStudentProfile()) return;
        const button = $('#student-reset-password');
        const messageEl = $('#student-account-message');
        if (button) button.disabled = true;
        try { await firebase.auth().sendPasswordResetEmail(student.email, ACTIVATION_REDIRECT); } catch (error) { /* do not reveal whether the account exists */ }
        if (messageEl) { messageEl.textContent = `If an account exists for ${student.email}, a password reset link has been sent.`; messageEl.className = 'admin-message success'; }
        if (button) button.disabled = false;
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

    // Mirrors createProgramme's minimal create-only pattern -- firestore.rules already
    // restricts trainers writes to isAdmin(), enforced server-side exactly as Programmes
    // relies on its own write rule rather than an extra client-side role gate.
    async function createTrainer(event) {
        event.preventDefault();
        const button = event.target.querySelector('button');
        if (button) button.disabled = true;
        try {
            await firebase.firestore().collection('trainers').add({
                name: $('#trainer-name')?.value.trim() || '',
                email: $('#trainer-email')?.value.trim() || '',
                speciality: $('#trainer-speciality')?.value.trim() || '',
                active: !!$('#trainer-active')?.checked,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            event.target.reset();
            const activeInput = $('#trainer-active'); if (activeInput) activeInput.checked = true;
            await loadTrainers();
            message('Trainer added.', 'success');
        } catch (error) {
            message('Trainer could not be added.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    // ------------------------------------------------------------------
    // PHASE 2 -- ASSIGNMENTS (top-level `assignments` collection)
    // ------------------------------------------------------------------

    async function ensureProgrammesLoaded() {
        if (state.programmes.length) return;
        try {
            const snapshot = await firebase.firestore().collection('programmes').limit(200).get();
            state.programmes = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        } catch (error) {
            // programmes are publicly readable; a failure here just leaves the dropdown empty
        }
    }

    function populateAssignmentProgrammeOptions() {
        const titles = [...new Set(state.programmes.map(programme => programme.title || programme.name).filter(Boolean))].sort();
        const filterEl = $('#assignment-programme-filter');
        if (filterEl) {
            const current = filterEl.value;
            filterEl.innerHTML = '<option value="">All programmes</option>' + titles.map(title => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`).join('');
            filterEl.value = current;
        }
        const formEl = $('#assignment-programme');
        if (formEl) {
            const current = formEl.value;
            formEl.innerHTML = '<option value="">Select programme</option>' + titles.map(title => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`).join('');
            formEl.value = current;
        }
        const materialEl = $('#material-programme');
        if (materialEl) {
            const current = materialEl.value;
            materialEl.innerHTML = '<option value="">Not programme-targeted</option>' + titles.map(title => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`).join('');
            materialEl.value = current;
        }
    }

    async function loadAssignments() {
        const permissionEl = $('#assignment-permission-message');
        const formCardEl = $('#assignment-form-card');
        // Mirrors firestore.rules exactly: the staff read branch for `assignments` is
        // isAdmin() || hasRole('lecturer') -- 'admissions' is not included, so it must
        // see a clear denial instead of an attempted (and rejected) query.
        if (!canReadAssignments()) {
            if (permissionEl) { permissionEl.textContent = 'Your role does not have access to assignments (see firestore.rules).'; permissionEl.className = 'admin-message error'; }
            if (formCardEl) formCardEl.hidden = true;
            state.assignments = [];
            renderAssignments();
            show('assignments');
            return;
        }
        if (permissionEl) { permissionEl.textContent = ''; permissionEl.className = 'admin-message'; }
        if (formCardEl) formCardEl.hidden = !canWriteAssignments();

        const bodyEl = $('#assignments-body');
        if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6">Loading assignments...</td></tr>';
        try {
            await ensureProgrammesLoaded();
            populateAssignmentProgrammeOptions();
            const collectionRef = firebase.firestore().collection('assignments');
            const snapshot = await collectionRef.orderBy('createdAt', 'desc').limit(200).get().catch(() => collectionRef.limit(200).get());
            state.assignments = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderAssignments();
            show('assignments');
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6">Assignments could not be loaded.</td></tr>';
            message('Assignments could not be loaded.', 'error');
        }
    }

    function filteredAssignments() {
        const queryEl = $('#assignment-search');
        const programmeEl = $('#assignment-programme-filter');
        const statusEl = $('#assignment-status-filter');
        const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        const programme = programmeEl ? programmeEl.value : '';
        const status = statusEl ? statusEl.value : '';
        return state.assignments.filter(assignment => {
            const haystack = `${assignment.title || ''} ${assignment.unit || assignment.module || ''} ${assignment.trainer || ''}`.toLowerCase();
            return (!query || haystack.includes(query))
                && (!programme || assignment.programmeId === programme)
                && (!status || assignment.status === status);
        });
    }

    function renderAssignments() {
        const bodyEl = $('#assignments-body');
        if (!bodyEl) return;
        if (!canReadAssignments()) { bodyEl.innerHTML = ''; return; }
        if (!state.assignments.length) {
            bodyEl.innerHTML = '<tr><td colspan="6">No assignments have been created yet.</td></tr>';
            return;
        }
        const assignments = filteredAssignments();
        const canWrite = canWriteAssignments();
        bodyEl.innerHTML = assignments.length ? assignments.map(assignment => `
            <tr>
                <td>${escapeHtml(assignment.title || 'Untitled')}</td>
                <td>${escapeHtml(assignment.programmeId || '')}</td>
                <td>${escapeHtml(assignment.semester || '')}</td>
                <td><span class="status-badge">${escapeHtml(assignment.status || 'Draft')}</span></td>
                <td>${escapeHtml(assignment.dueDate || 'Not set')}</td>
                <td>${canWrite ? `<button type="button" class="admin-action" data-assignment-edit="${escapeHtml(assignment.id)}">Edit</button> <button type="button" class="admin-action" data-assignment-delete="${escapeHtml(assignment.id)}">Delete</button>` : ''}</td>
            </tr>`).join('') : '<tr><td colspan="6">No assignments match the current filters.</td></tr>';
        bodyEl.querySelectorAll('[data-assignment-edit]').forEach(button => button.addEventListener('click', () => editAssignment(button.dataset.assignmentEdit)));
        bodyEl.querySelectorAll('[data-assignment-delete]').forEach(button => button.addEventListener('click', () => deleteAssignment(button.dataset.assignmentDelete)));
    }

    function assignmentFormValues() {
        return {
            title: $('#assignment-title')?.value.trim() || '',
            programmeId: $('#assignment-programme')?.value || '',
            semester: $('#assignment-semester')?.value.trim() || '',
            unit: $('#assignment-unit')?.value.trim() || '',
            dueDate: $('#assignment-due-date')?.value || '',
            assignedDate: $('#assignment-assigned-date')?.value || '',
            trainer: $('#assignment-trainer')?.value.trim() || '',
            status: $('#assignment-status')?.value || 'Draft',
            description: $('#assignment-description')?.value.trim() || ''
        };
    }

    async function submitAssignmentForm(event) {
        event.preventDefault();
        if (!canWriteAssignments()) return;
        const button = $('#assignment-submit-button');
        if (button) button.disabled = true;
        try {
            const values = assignmentFormValues();
            if (state.assignmentEditingId) {
                await firebase.firestore().collection('assignments').doc(state.assignmentEditingId).update({ ...values, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                await firebase.firestore().collection('assignments').add({ ...values, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            resetAssignmentForm();
            await loadAssignments();
            message('Assignment saved.', 'success');
        } catch (error) {
            message(error?.message || 'The assignment could not be saved.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function editAssignment(id) {
        const assignment = state.assignments.find(item => item.id === id);
        if (!assignment) return;
        state.assignmentEditingId = id;
        const setValue = (selector, value) => { const el = $(selector); if (el) el.value = value || ''; };
        setValue('#assignment-title', assignment.title);
        setValue('#assignment-programme', assignment.programmeId);
        setValue('#assignment-semester', assignment.semester);
        setValue('#assignment-unit', assignment.unit || assignment.module);
        setValue('#assignment-due-date', assignment.dueDate);
        setValue('#assignment-assigned-date', assignment.assignedDate);
        setValue('#assignment-trainer', assignment.trainer);
        setValue('#assignment-status', assignment.status || 'Draft');
        setValue('#assignment-description', assignment.description);
        const heading = $('#assignment-form-heading'); if (heading) heading.textContent = 'Edit assignment';
        const submitButton = $('#assignment-submit-button'); if (submitButton) submitButton.textContent = 'Save assignment';
        const cancelButton = $('#assignment-cancel-edit'); if (cancelButton) cancelButton.hidden = false;
        $('#assignment-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function resetAssignmentForm() {
        state.assignmentEditingId = null;
        const formEl = $('#assignment-form');
        if (formEl) formEl.reset();
        const heading = $('#assignment-form-heading'); if (heading) heading.textContent = 'Create assignment';
        const submitButton = $('#assignment-submit-button'); if (submitButton) submitButton.textContent = 'Create assignment';
        const cancelButton = $('#assignment-cancel-edit'); if (cancelButton) cancelButton.hidden = true;
    }

    async function deleteAssignment(id) {
        if (!canWriteAssignments()) return;
        if (!window.confirm('Delete this assignment? Students will no longer see it.')) return;
        try {
            await firebase.firestore().collection('assignments').doc(id).delete();
            if (state.assignmentEditingId === id) resetAssignmentForm();
            await loadAssignments();
            message('Assignment deleted.', 'success');
        } catch (error) {
            message(error?.message || 'The assignment could not be deleted.', 'error');
        }
    }

    // ------------------------------------------------------------------
    // PHASE 2 -- LEARNING MATERIALS (top-level `learning_materials` collection)
    // ------------------------------------------------------------------
    // Deliberately URL/link-based only (no Storage writes). Supports public,
    // single-student (allowedUid), and programme (programmeId) targeting.

    async function loadMaterials() {
        const permissionEl = $('#material-permission-message');
        const formCardEl = $('#material-form-card');
        const canManage = canManageMaterials();
        if (formCardEl) formCardEl.hidden = !canManage;
        if (canManage) {
            // Preload the student picker as soon as the section opens -- otherwise the
            // "Add new" form's picker stays empty until something else happens to trigger
            // ensureMaterialStudentOptionsLoaded() (e.g. toggling the Public checkbox).
            updateMaterialPickerVisibility();
            ensureMaterialStudentOptionsLoaded();
            await ensureProgrammesLoaded();
            populateAssignmentProgrammeOptions();
        }
        if (permissionEl) {
            permissionEl.textContent = canManage ? '' : 'Your role can view publicly visible materials only. Managing learning materials requires Superadmin or Lecturer (see firestore.rules).';
            permissionEl.className = canManage ? 'admin-message' : 'admin-muted';
        }
        const bodyEl = $('#materials-body');
        if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="5">Loading learning materials...</td></tr>';
        try {
            const collectionRef = firebase.firestore().collection('learning_materials');
            // Non-managing staff (e.g. plain admin) are not in the learning_materials read
            // rule's unconditional branch, so only the public==true subset is fetched --
            // exactly what a signed-in student's own query already relies on.
            const snapshot = canManage
                ? await collectionRef.limit(200).get()
                : await collectionRef.where('public', '==', true).limit(200).get();
            state.materials = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            renderMaterials();
            show('materials');
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="5">Learning materials could not be loaded.</td></tr>';
            message('Learning materials could not be loaded.', 'error');
        }
    }

    function filteredMaterials() {
        const queryEl = $('#material-search');
        const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        return state.materials.filter(material => {
            const haystack = `${material.title || material.name || ''} ${material.type || material.category || ''} ${material.trainer || ''}`.toLowerCase();
            return !query || haystack.includes(query);
        });
    }

    function materialVisibilityLabel(material) {
        if (material.public) return 'Public';
        const parts = [];
        if (material.programmeId) parts.push(`Programme: ${material.programmeId}`);
        if (material.allowedUid) parts.push('1 student');
        return parts.length ? parts.join(' + ') : 'Not visible to students';
    }

    function renderMaterials() {
        const bodyEl = $('#materials-body');
        if (!bodyEl) return;
        if (!state.materials.length) {
            bodyEl.innerHTML = '<tr><td colspan="5">No learning materials have been added yet.</td></tr>';
            return;
        }
        const materials = filteredMaterials();
        const canManage = canManageMaterials();
        bodyEl.innerHTML = materials.length ? materials.map(material => `
            <tr>
                <td>${escapeHtml(material.title || material.name || 'Untitled')}</td>
                <td>${escapeHtml(material.type || material.category || '')}</td>
                <td>${escapeHtml(materialVisibilityLabel(material))}</td>
                <td>${escapeHtml(material.trainer || '')}</td>
                <td>${canManage ? `<button type="button" class="admin-action" data-material-edit="${escapeHtml(material.id)}">Edit</button> <button type="button" class="admin-action" data-material-delete="${escapeHtml(material.id)}">Delete</button>` : ''}</td>
            </tr>`).join('') : '<tr><td colspan="5">No learning materials match the current search.</td></tr>';
        bodyEl.querySelectorAll('[data-material-edit]').forEach(button => button.addEventListener('click', () => editMaterial(button.dataset.materialEdit)));
        bodyEl.querySelectorAll('[data-material-delete]').forEach(button => button.addEventListener('click', () => deleteMaterial(button.dataset.materialDelete)));
    }

    function updateMaterialPickerVisibility() {
        const pickerEl = $('#material-student-picker');
        const publicEl = $('#material-public');
        if (pickerEl) pickerEl.hidden = !!publicEl?.checked;
    }

    async function ensureMaterialStudentOptionsLoaded() {
        if (state.materialStudentOptions !== null || state.materialStudentPickerError) { renderMaterialStudentPicker(); return; }
        const messageEl = $('#material-student-picker-message');
        if (messageEl) { messageEl.textContent = 'Loading students...'; messageEl.className = 'admin-muted'; }
        try {
            // students `list` requires isAdmin()||admissions -- a lecturer managing
            // materials does NOT have this, so this can legitimately fail for them.
            const snapshot = await firebase.firestore().collection('students').limit(200).get();
            state.materialStudentOptions = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        } catch (error) {
            state.materialStudentOptions = [];
            state.materialStudentPickerError = 'Student search is unavailable for your role (listing students requires Superadmin or Admissions access). Public visibility is still available, and any student targeting already saved on this material is preserved.';
        }
        renderMaterialStudentPicker();
    }

    function renderMaterialStudentPicker() {
        const listEl = $('#material-student-list');
        const messageEl = $('#material-student-picker-message');
        if (!listEl) return;
        if (state.materialStudentPickerError) {
            listEl.innerHTML = '';
            if (messageEl) { messageEl.textContent = state.materialStudentPickerError; messageEl.className = 'admin-muted'; }
            return;
        }
        const students = state.materialStudentOptions || [];
        const queryEl = $('#material-student-search');
        const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        const filtered = students.filter(student => {
            const haystack = `${student.fullName || ''} ${student.studentId || ''} ${student.email || ''}`.toLowerCase();
            return !query || haystack.includes(query);
        });
        if (messageEl) { messageEl.textContent = students.length ? '' : 'No student records are available to select.'; messageEl.className = 'admin-muted'; }
        const noneOption = `<label class="admin-form-inline"><input type="radio" name="material-target-student" data-student-uid="" ${!state.materialSelectedUid ? 'checked' : ''}> No student targeting</label>`;
        listEl.innerHTML = noneOption + (filtered.length ? filtered.map(student => `
            <label class="admin-form-inline"><input type="radio" name="material-target-student" data-student-uid="${escapeHtml(student.id)}" ${state.materialSelectedUid === student.id ? 'checked' : ''}> ${escapeHtml(student.fullName || student.studentId || student.id)}${student.studentId ? ` (${escapeHtml(student.studentId)})` : ''}</label>
        `).join('') : (students.length ? '<p class="admin-muted">No students match this search.</p>' : ''));
        listEl.querySelectorAll('[data-student-uid]').forEach(radio => radio.addEventListener('change', () => {
            state.materialSelectedUid = radio.checked ? radio.dataset.studentUid : state.materialSelectedUid;
        }));
    }

    async function submitMaterialForm(event) {
        event.preventDefault();
        if (!canManageMaterials()) return;
        const button = $('#material-submit-button');
        if (button) button.disabled = true;
        try {
            const isPublic = !!$('#material-public')?.checked;
            const values = {
                title: $('#material-title')?.value.trim() || '',
                type: $('#material-type')?.value.trim() || '',
                trainer: $('#material-trainer')?.value.trim() || '',
                url: $('#material-url')?.value.trim() || '',
                public: isPublic,
                allowedUid: isPublic ? '' : (state.materialSelectedUid || ''),
                programmeId: $('#material-programme')?.value || ''
            };
            if (state.materialEditingId) {
                await firebase.firestore().collection('learning_materials').doc(state.materialEditingId).update({ ...values, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                await firebase.firestore().collection('learning_materials').add({ ...values, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            resetMaterialForm();
            await loadMaterials();
            message('Learning material saved.', 'success');
        } catch (error) {
            message(error?.message || 'The learning material could not be saved.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function editMaterial(id) {
        const material = state.materials.find(item => item.id === id);
        if (!material || !canManageMaterials()) return;
        state.materialEditingId = id;
        state.materialSelectedUid = material.allowedUid || '';
        const setValue = (selector, value) => { const el = $(selector); if (el) el.value = value || ''; };
        setValue('#material-title', material.title || material.name);
        setValue('#material-type', material.type || material.category);
        setValue('#material-trainer', material.trainer);
        setValue('#material-url', material.url || material.link);
        setValue('#material-programme', material.programmeId);
        const publicEl = $('#material-public'); if (publicEl) publicEl.checked = !!material.public;
        updateMaterialPickerVisibility();
        ensureMaterialStudentOptionsLoaded();
        const heading = $('#material-form-heading'); if (heading) heading.textContent = 'Edit learning material';
        const submitButton = $('#material-submit-button'); if (submitButton) submitButton.textContent = 'Save material';
        const cancelButton = $('#material-cancel-edit'); if (cancelButton) cancelButton.hidden = false;
        $('#material-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function resetMaterialForm() {
        state.materialEditingId = null;
        state.materialSelectedUid = '';
        const formEl = $('#material-form');
        if (formEl) formEl.reset();
        updateMaterialPickerVisibility();
        renderMaterialStudentPicker();
        const heading = $('#material-form-heading'); if (heading) heading.textContent = 'Add learning material';
        const submitButton = $('#material-submit-button'); if (submitButton) submitButton.textContent = 'Add material';
        const cancelButton = $('#material-cancel-edit'); if (cancelButton) cancelButton.hidden = true;
    }

    async function deleteMaterial(id) {
        if (!canManageMaterials()) return;
        if (!window.confirm('Delete this learning material?')) return;
        try {
            await firebase.firestore().collection('learning_materials').doc(id).delete();
            if (state.materialEditingId === id) resetMaterialForm();
            await loadMaterials();
            message('Learning material deleted.', 'success');
        } catch (error) {
            message(error?.message || 'The learning material could not be deleted.', 'error');
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
        const googleMessage = $('#google-signin-message');
        let pendingGoogleCredential = null;

        if (!validConfig || !window.firebase) {
            if (loadingEl) loadingEl.hidden = true;
            if (loginEl) loginEl.hidden = false;
            if (loginMessageEl) loginMessageEl.textContent = 'Firebase Authentication is not configured.';
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(config);
        const auth = firebase.auth();

        // Standard Firebase "link accounts with the same email" flow (same pattern already
        // used in portal.html) -- when Google sign-in reports
        // auth/account-exists-with-different-credential, hold the Google credential and ask
        // the admin to prove ownership with their existing password; linkWithCredential()
        // then attaches Google to the SAME uid so existing roles/claims are preserved.
        async function startAccountLinking(error) {
            const email = error.email;
            pendingGoogleCredential = error.credential;
            let methods = [];
            try { methods = await auth.fetchSignInMethodsForEmail(email); } catch (lookupError) { methods = []; }

            if (methods.length && !methods.includes('password')) {
                pendingGoogleCredential = null;
                if (googleMessage) { googleMessage.textContent = 'This email is already registered with a different sign-in method. Please use your original sign-in method.'; googleMessage.className = 'admin-message error'; }
                return;
            }

            const emailEl = $('#login-email'); if (emailEl) emailEl.value = email;
            const passwordEl = $('#login-password'); if (passwordEl) passwordEl.value = '';
            if (googleMessage) { googleMessage.textContent = `An account already exists for ${email}. Enter your password below to securely link Google sign-in to it.`; googleMessage.className = 'admin-message'; }
            passwordEl?.focus();
        }

        auth.getRedirectResult().catch(error => {
            if (error.code === 'auth/account-exists-with-different-credential') {
                startAccountLinking(error);
            } else if (error.code) {
                if (googleMessage) { googleMessage.textContent = 'Google sign-in failed. Please try again.'; googleMessage.className = 'admin-message error'; }
            }
        });

        $('#google-signin-button')?.addEventListener('click', async () => {
            const button = $('#google-signin-button');
            if (button) button.disabled = true;
            if (googleMessage) { googleMessage.textContent = 'Redirecting to Google sign-in...'; googleMessage.className = 'admin-message'; }
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                // signInWithRedirect (not signInWithPopup) -- matches the fix already applied
                // to portal.html: popups are routinely blocked by browser popup blockers and
                // third-party-cookie restrictions. Completion is handled by getRedirectResult() above.
                await auth.signInWithRedirect(provider);
            } catch (error) {
                if (googleMessage) { googleMessage.textContent = 'Google sign-in failed. Please try again.'; googleMessage.className = 'admin-message error'; }
                if (button) button.disabled = false;
            }
        });

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
            const linking = Boolean(pendingGoogleCredential);
            if (button) button.disabled = true;
            if (loginMessageEl) loginMessageEl.textContent = linking ? 'Verifying your password to link Google sign-in...' : 'Signing in...';
            try {
                const result = await auth.signInWithEmailAndPassword($('#login-email').value.trim(), $('#login-password').value);
                if (linking) {
                    const credentialToLink = pendingGoogleCredential;
                    pendingGoogleCredential = null;
                    try {
                        await result.user.linkWithCredential(credentialToLink);
                        if (googleMessage) { googleMessage.textContent = 'Google sign-in is now linked to your account. You can use either method next time.'; googleMessage.className = 'admin-message success'; }
                    } catch (linkError) {
                        // Sign-in itself already succeeded, so the admin can still continue.
                        if (googleMessage) { googleMessage.textContent = 'Signed in, but we could not link Google this time. You can keep using your email and password.'; googleMessage.className = 'admin-message error'; }
                    }
                }
                // Falls through to the existing auth.onAuthStateChanged listener above either way.
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
        $('#delete-application')?.addEventListener('click', deleteSelectedApplication);
        $('#programme-form')?.addEventListener('submit', createProgramme);
        $('#trainer-form')?.addEventListener('submit', createTrainer);
        $('#detail-close')?.addEventListener('click', () => { const el = $('#application-detail'); if (el) el.hidden = true; });
        $('#role-form')?.addEventListener('submit', event => { event.preventDefault(); submitRoleChange(true); });
        $('#role-revoke-button')?.addEventListener('click', () => submitRoleChange(false));
        $('#student-search')?.addEventListener('input', renderStudents);
        $('#student-programme-filter')?.addEventListener('change', renderStudents);
        $('#student-status-filter')?.addEventListener('change', renderStudents);
        $('#student-detail-close')?.addEventListener('click', closeStudent);
        $('#student-overview-form')?.addEventListener('submit', saveStudentOverview);
        document.querySelectorAll('[data-student-tab]').forEach(button => button.addEventListener('click', () => switchStudentTab(button.dataset.studentTab)));
        document.querySelectorAll('[data-academic-subtab]').forEach(button => button.addEventListener('click', () => switchAcademicSubtab(button.dataset.academicSubtab)));
        $('#student-reset-password')?.addEventListener('click', sendStudentPasswordReset);
        $('#submission-grade-form')?.addEventListener('submit', submitGradeForm);
        $('#submission-grade-cancel')?.addEventListener('click', closeGradeForm);

        $('#assignment-form')?.addEventListener('submit', submitAssignmentForm);
        $('#assignment-cancel-edit')?.addEventListener('click', resetAssignmentForm);
        $('#assignment-search')?.addEventListener('input', renderAssignments);
        $('#assignment-programme-filter')?.addEventListener('change', renderAssignments);
        $('#assignment-status-filter')?.addEventListener('change', renderAssignments);

        $('#material-form')?.addEventListener('submit', submitMaterialForm);
        $('#material-cancel-edit')?.addEventListener('click', resetMaterialForm);
        $('#material-search')?.addEventListener('input', renderMaterials);
        $('#material-public')?.addEventListener('change', () => {
            updateMaterialPickerVisibility();
            if (!$('#material-public')?.checked) ensureMaterialStudentOptionsLoaded();
        });
        $('#material-student-search')?.addEventListener('input', renderMaterialStudentPicker);

        document.querySelectorAll('[data-admin-nav]').forEach(button => button.addEventListener('click', async () => {
            const view = button.dataset.adminNav;
            if (view === 'applications') { await loadData(); show(view); }
            else if (view === 'students') await loadStudents();
            else if (view === 'programmes') await loadProgrammes();
            else if (view === 'trainers') await loadTrainers();
            else if (view === 'assignments') await loadAssignments();
            else if (view === 'materials') await loadMaterials();
            else if (view === 'superadmin') { await loadStaff(); show(view); }
            else show(view);
        }));
    }

    initialize();
})();

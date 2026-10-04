// ------------------------------------------------------------------------
// SUBMISSION EMAIL NOTIFICATIONS (Zoho Mail SMTP)
// ------------------------------------------------------------------------
//
// Sends the two emails triggered when an application is successfully
// submitted (see finalizeApplicationSubmission in admission-service.js):
// a notification to FEWA Admissions, and a confirmation to the applicant.
// Uses the college's own Zoho Mail SMTP relay -- credentials are read from
// Firebase Functions secrets (see the .runWith({ secrets: [...] }) call in
// functions/index.js), never hardcoded and never present in any
// frontend/public file.
//
// A failure here is deliberately non-fatal to the caller: the application
// record is already safely written to Firestore before this is ever
// attempted, so a transient SMTP problem cannot lose or break a submission.

const nodemailer = require('nodemailer');

const ADMISSIONS_EMAIL = 'admissions@fewa.ac.ke';
// Matches the phone number already published on contact.html -- not invented here.
const SUPPORT_PHONE = '0182368996';
const STUDENT_PORTAL_URL = 'https://fewa.ac.ke/portal.html';

function buildTransporter(smtpUser, smtpPass) {
    return nodemailer.createTransport({
        host: 'smtp.zoho.com',
        port: 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass }
    });
}

function applicantName(application) {
    const person = application.personalInformation || {};
    return [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Applicant';
}

async function sendAdmissionsNotification(transporter, application) {
    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    await transporter.sendMail({
        from: `"FEWA Website" <${ADMISSIONS_EMAIL}>`,
        to: ADMISSIONS_EMAIL,
        subject: `New Application Submitted -- ${application.applicationNumber || 'Reference unavailable'}`,
        text: [
            'A new application has been submitted on the FEWA website.',
            '',
            `Applicant: ${applicantName(application)}`,
            `Email: ${person.email || 'Not provided'}`,
            `Phone: ${person.phone || 'Not provided'}`,
            `Programme: ${programme.program || 'Not specified'}`,
            `Intake: ${programme.intake || 'Not specified'}`,
            `Application Number: ${application.applicationNumber || 'Not available'}`,
            '',
            'Review it in the FEWA Admin Portal.'
        ].join('\n')
    });
}

async function sendApplicantConfirmation(transporter, application) {
    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    if (!person.email) return;
    await transporter.sendMail({
        from: `"FEWA Beauty & Fashion College" <${ADMISSIONS_EMAIL}>`,
        to: person.email,
        subject: 'We Have Received Your FEWA Application',
        text: [
            `Dear ${applicantName(application)},`,
            '',
            'Thank you for applying to FEWA Beauty & Fashion College. We have successfully received your application.',
            '',
            `Programme: ${programme.program || 'Not specified'}`,
            `Intake: ${programme.intake || 'Not specified'}`,
            `Application Number: ${application.applicationNumber || 'Not available'}`,
            '',
            `Our admissions team will review your application and contact you with the outcome. If you have any questions in the meantime, reach us at ${ADMISSIONS_EMAIL} or ${SUPPORT_PHONE}.`,
            '',
            'Regards,',
            'FEWA Admissions Team'
        ].join('\n')
    });
}

// Returns a ready-to-use (application) => Promise<void> function bound to one
// SMTP transporter, so admission-service.js never needs to know about
// nodemailer or SMTP credentials directly -- it only ever calls
// sendEmails(application). Passed in as a parameter (not a hardcoded
// dependency) so tests can substitute a no-op without needing real SMTP
// credentials.
function createEmailSender(smtpUser, smtpPass) {
    if (!smtpUser || !smtpPass) {
        // Fails fast instead of attempting a real SMTP connection with empty
        // credentials, which would otherwise hang/timeout on every submission
        // (and every local test run) until ZOHO_SMTP_USER/ZOHO_SMTP_PASS are set.
        return async function sendSubmissionEmailsUnconfigured() {
            throw new Error('Zoho SMTP credentials are not configured (ZOHO_SMTP_USER/ZOHO_SMTP_PASS).');
        };
    }
    const transporter = buildTransporter(smtpUser, smtpPass);
    return async function sendSubmissionEmails(application) {
        await Promise.all([
            sendAdmissionsNotification(transporter, application),
            sendApplicantConfirmation(transporter, application)
        ]);
    };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function sendAcceptanceNotification(transporter, application, studentId) {
    const person = application.personalInformation || {};
    const programme = application.programInformation || {};
    if (!person.email) return;
    const name = applicantName(application);
    const applicationNumber = application.applicationNumber || 'Not available';
    const program = programme.program || 'Not specified';
    const intake = programme.intake || 'Not specified';

    await transporter.sendMail({
        from: `"FEWA Beauty & Fashion College" <${ADMISSIONS_EMAIL}>`,
        to: person.email,
        subject: 'Congratulations! Your FEWA Application Has Been Accepted',
        html: `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
                <h2 style="color: #7a1f3d;">Congratulations, ${escapeHtml(name)}!</h2>
                <p>We are delighted to inform you that your application to <strong>FEWA Beauty &amp; Fashion College</strong> has been <strong>accepted</strong>.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 6px 0; color: #555;">Programme</td><td style="padding: 6px 0;"><strong>${escapeHtml(program)}</strong></td></tr>
                    <tr><td style="padding: 6px 0; color: #555;">Intake</td><td style="padding: 6px 0;"><strong>${escapeHtml(intake)}</strong></td></tr>
                    <tr><td style="padding: 6px 0; color: #555;">Application Number</td><td style="padding: 6px 0;"><strong>${escapeHtml(applicationNumber)}</strong></td></tr>
                    <tr><td style="padding: 6px 0; color: #555;">Student ID</td><td style="padding: 6px 0;"><strong>${escapeHtml(studentId)}</strong></td></tr>
                </table>
                <h3 style="color: #7a1f3d;">Next Steps</h3>
                <ol>
                    <li>Check your inbox (and spam folder) for a separate email inviting you to set your Student Portal password.</li>
                    <li>Sign in to the Student Portal using your Student ID <strong>${escapeHtml(studentId)}</strong> and the password you set.</li>
                    <li>Complete any remaining admission requirements as advised by our admissions team.</li>
                </ol>
                <p><a href="${STUDENT_PORTAL_URL}" style="display: inline-block; background: #7a1f3d; color: #fff; padding: 10px 18px; border-radius: 4px; text-decoration: none;">Go to Student Portal</a></p>
                <p>If you have any questions, our admissions team is here to help at <a href="mailto:${ADMISSIONS_EMAIL}">${ADMISSIONS_EMAIL}</a> or ${SUPPORT_PHONE}.</p>
                <p>Once again, congratulations, and welcome to FEWA Beauty &amp; Fashion College.</p>
                <p>Regards,<br><strong>FEWA Admissions Team</strong></p>
            </div>
        `,
        text: [
            `Congratulations, ${name}!`,
            '',
            'We are delighted to inform you that your application to FEWA Beauty & Fashion College has been accepted.',
            '',
            `Programme: ${program}`,
            `Intake: ${intake}`,
            `Application Number: ${applicationNumber}`,
            `Student ID: ${studentId}`,
            '',
            'Next Steps:',
            '1. Check your inbox (and spam folder) for a separate email inviting you to set your Student Portal password.',
            `2. Sign in to the Student Portal using your Student ID ${studentId} and the password you set.`,
            '3. Complete any remaining admission requirements as advised by our admissions team.',
            '',
            `Student Portal: ${STUDENT_PORTAL_URL}`,
            '',
            `If you have any questions, reach us at ${ADMISSIONS_EMAIL} or ${SUPPORT_PHONE}.`,
            '',
            'Regards,',
            'FEWA Admissions Team'
        ].join('\n')
    });
}

// Same shape as createEmailSender, but for the single acceptance email --
// kept separate because it fires from promoteAcceptedApplication (accept
// flow), not finalizeApplicationSubmission (submit flow), and needs the
// allocated studentId as well as the application record.
function createAcceptanceEmailSender(smtpUser, smtpPass) {
    if (!smtpUser || !smtpPass) {
        return async function sendAcceptanceEmailUnconfigured() {
            throw new Error('Zoho SMTP credentials are not configured (ZOHO_SMTP_USER/ZOHO_SMTP_PASS).');
        };
    }
    const transporter = buildTransporter(smtpUser, smtpPass);
    return async function sendAcceptanceEmail(application, studentId) {
        await sendAcceptanceNotification(transporter, application, studentId);
    };
}

const STAFF_PORTAL_URL = 'https://fewa.ac.ke/staff';

const ROLE_LABELS = {
    admin: 'Administrator',
    superadmin: 'Superadmin',
    admissions: 'Admissions',
    finance: 'Finance',
    lecturer: 'Lecturer/Trainer'
};

async function sendStaffInvitation(transporter, { name, email, role, resetLink }) {
    const roleLabel = ROLE_LABELS[role] || role;
    await transporter.sendMail({
        from: `"FEWA Beauty & Fashion College" <${ADMISSIONS_EMAIL}>`,
        to: email,
        subject: 'You Have Been Invited to the FEWA Staff Portal',
        html: `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
                <h2 style="color: #7a1f3d;">Welcome to FEWA, ${escapeHtml(name)}!</h2>
                <p>You have been invited to join the <strong>FEWA Staff Portal</strong> at FEWA Beauty &amp; Fashion College.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 6px 0; color: #555;">Assigned role</td><td style="padding: 6px 0;"><strong>${escapeHtml(roleLabel)}</strong></td></tr>
                </table>
                <p>To get started, use the secure link below to set your own password. No password has been generated for you -- you choose it yourself on the next screen.</p>
                <p><a href="${escapeHtml(resetLink)}" style="display: inline-block; background: #7a1f3d; color: #fff; padding: 10px 18px; border-radius: 4px; text-decoration: none;">Set Your Password</a></p>
                <p>Once your password is set, sign in to the Staff Portal any time at <a href="${STAFF_PORTAL_URL}">${STAFF_PORTAL_URL}</a> using this email address.</p>
                <p>If you weren't expecting this invitation, you can safely ignore this email, or contact our admissions team at <a href="mailto:${ADMISSIONS_EMAIL}">${ADMISSIONS_EMAIL}</a> or ${SUPPORT_PHONE}.</p>
                <p>Regards,<br><strong>FEWA Beauty &amp; Fashion College</strong></p>
            </div>
        `,
        text: [
            `Welcome to FEWA, ${name}!`,
            '',
            'You have been invited to join the FEWA Staff Portal at FEWA Beauty & Fashion College.',
            '',
            `Assigned role: ${roleLabel}`,
            '',
            'To get started, use the secure link below to set your own password. No password has been generated for you -- you choose it yourself on the next screen.',
            '',
            `Set your password: ${resetLink}`,
            '',
            `Once your password is set, sign in to the Staff Portal any time at ${STAFF_PORTAL_URL} using this email address.`,
            '',
            `If you weren't expecting this invitation, you can safely ignore this email, or contact our admissions team at ${ADMISSIONS_EMAIL} or ${SUPPORT_PHONE}.`,
            '',
            'Regards,',
            'FEWA Beauty & Fashion College'
        ].join('\n')
    });
}

// Same injection shape as createEmailSender/createAcceptanceEmailSender.
function createStaffInvitationEmailSender(smtpUser, smtpPass) {
    if (!smtpUser || !smtpPass) {
        return async function sendStaffInvitationUnconfigured() {
            throw new Error('Zoho SMTP credentials are not configured (ZOHO_SMTP_USER/ZOHO_SMTP_PASS).');
        };
    }
    const transporter = buildTransporter(smtpUser, smtpPass);
    return async function sendInvitation({ name, email, role, resetLink }) {
        await sendStaffInvitation(transporter, { name, email, role, resetLink });
    };
}

module.exports = {
    createEmailSender,
    createAcceptanceEmailSender,
    createStaffInvitationEmailSender,
    sendAdmissionsNotification,
    sendApplicantConfirmation,
    sendAcceptanceNotification,
    sendStaffInvitation,
    buildTransporter,
    ADMISSIONS_EMAIL
};

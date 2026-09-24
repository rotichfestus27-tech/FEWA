// Fee STRUCTURE display component -- renders window.FEWA_FEES (defined in
// fees-catalog-data.js, which must be loaded before this file). Contains no
// fee amounts itself; only knows how to lay the data out as tables and format
// currency.
const fees = window.FEWA_FEES;

function formatKSh(amount) {
    return `KSh ${Number(amount).toLocaleString('en-US')}`;
}

function admissionSection(data) {
    const rows = data.items.map((item) => `
        <tr>
            <td data-label="Particulars">${item.particulars}</td>
            <td data-label="Period">${item.period}</td>
            ${data.schools.map((school) => `<td data-label="${school}">${formatKSh(item.amounts[school])}</td>`).join('')}
        </tr>`).join('');
    const totalRow = `
        <tr class="fees-total-row">
            <td data-label="Particulars"><strong>Total</strong></td>
            <td data-label="Period"></td>
            ${data.schools.map((school) => `<td data-label="${school}"><strong>${formatKSh(data.total[school])}</strong></td>`).join('')}
        </tr>`;
    return `
        <section class="fees-section" aria-labelledby="fees-admission-heading">
            <h2 id="fees-admission-heading">1. ${data.title}</h2>
            <div class="fees-table-wrap">
                <table class="fees-table">
                    <thead>
                        <tr><th>Particulars</th><th>Period</th>${data.schools.map((s) => `<th>${s}</th>`).join('')}</tr>
                    </thead>
                    <tbody>${rows}${totalRow}</tbody>
                </table>
            </div>
        </section>`;
}

function studyModeSection(data, index, anchorId) {
    const allPeriods = data.studyModes[0].payments.map((payment) => payment.period);
    const rows = data.studyModes.map((studyMode) => `
        <tr>
            <td data-label="Study Mode">${studyMode.mode}</td>
            ${studyMode.payments.map((payment) => `<td data-label="${payment.period}">${formatKSh(payment.amount)}</td>`).join('')}
        </tr>`).join('');
    return `
        <section class="fees-section" aria-labelledby="${anchorId}-heading">
            <h2 id="${anchorId}-heading">${index}. ${data.title}</h2>
            <div class="fees-table-wrap">
                <table class="fees-table">
                    <thead>
                        <tr><th>Study Mode</th>${allPeriods.map((period) => `<th>${period}</th>`).join('')}</tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>`;
}

function singlePackagesSection(data, index) {
    const cards = data.packages.map((pkg) => `
        <article class="fees-package-card">
            <h3>${pkg.name}</h3>
            <p class="fees-package-amount">${formatKSh(pkg.amount)} <span>${data.billingPeriod}</span></p>
            ${pkg.note ? `<p class="fees-package-note">${pkg.note}</p>` : ''}
        </article>`).join('');
    return `
        <section class="fees-section" aria-labelledby="fees-packages-heading">
            <h2 id="fees-packages-heading">${index}. ${data.title}</h2>
            <div class="fees-package-grid">${cards}</div>
        </section>`;
}

function renderFees() {
    const target = document.querySelector('#fees-content');
    if (!target || !fees) return;
    target.innerHTML = [
        admissionSection(fees.admission),
        studyModeSection(fees.cosmetology, 2, 'fees-cosmetology'),
        studyModeSection(fees.fashionDesign, 3, 'fees-fashion-design'),
        singlePackagesSection(fees.singleFashionPackages, 4)
    ].join('');
}

renderFees();

// Same mobile-menu toggle wiring used by scripts/courses.js -- fees.html uses
// the same header markup and needs the same behavior.
const mobileMenu = document.querySelector('#mobile-menu');
const navLinks = document.querySelector('.nav-links');
if (mobileMenu && navLinks) {
    mobileMenu.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('active');
        mobileMenu.setAttribute('aria-expanded', String(isOpen));
        mobileMenu.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
}

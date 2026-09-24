// Course LISTING display component -- renders window.FEWA_COURSES (defined in
// course-catalog-data.js, which must be loaded before this file). Contains no
// course data itself; only knows how to lay a course out as a card and filter
// the grid by category.
const courses = window.FEWA_COURSES;

const courseGrid = document.querySelector('#course-grid');
const filterButtons = document.querySelectorAll('[data-filter]');

function courseCard(course, index) {
    return `
        <article class="premium-course-card reveal" data-category="${course.category}" style="--card-delay: ${index * 45}ms">
            <a class="course-image-link" href="/courses/${course.slug}" aria-label="View details for ${course.title}">
                <div class="premium-course-image">
                    <img src="${course.image}" alt="${course.title}">
                    <span class="course-icon" aria-hidden="true"><i class="fas ${course.icon}"></i></span>
                </div>
            </a>
            <div class="premium-course-body">
                <span class="course-category">${course.category}</span>
                <h2>${course.title}</h2>
                <div class="course-meta">
                    <span><i class="fas fa-award" aria-hidden="true"></i>${course.qualification}</span>
                    <span><i class="fas fa-clock" aria-hidden="true"></i>${course.duration}</span>
                </div>
                <div class="course-divider"></div>
                <p>${course.description}</p>
                <a class="course-details-link" href="/courses/${course.slug}">View Details <span aria-hidden="true">&rarr;</span></a>
            </div>
        </article>`;
}

// filter is either 'All Courses', a single category string, or an array of
// category strings (used when a homepage "school" spans more than one
// catalogue category -- e.g. School of Cosmetology covers both "Beauty &
// Wellness" and "Hair & Barbering").
function renderCourses(filter = 'All Courses') {
    if (!courseGrid) return;
    const categories = Array.isArray(filter) ? filter : [filter];
    const visibleCourses = categories.includes('All Courses')
        ? courses
        : courses.filter((course) => categories.includes(course.category));

    courseGrid.innerHTML = visibleCourses.map(courseCard).join('');
    requestAnimationFrame(() => {
        courseGrid.querySelectorAll('.reveal').forEach((card) => card.classList.add('is-visible'));
    });
}

filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
        filterButtons.forEach((item) => {
            item.classList.toggle('is-active', item === button);
            item.setAttribute('aria-selected', item === button ? 'true' : 'false');
        });
        renderCourses(button.dataset.filter);
    });
});

// Short, pre-written introductions for the homepage "school" links (Home ->
// School -> Explore Programs). Purely display copy -- the underlying course
// list for each is still derived entirely from window.FEWA_COURSES via the
// category filter below, nothing here adds or changes course data.
const SCHOOL_INTROS = {
    'Beauty & Wellness,Hair & Barbering': {
        eyebrow: 'School of Cosmetology',
        heading: 'Beauty, wellness and hair-care programmes',
        body: 'Explore FEWA’s Cosmetology, Beauty Therapy and Hairdressing pathways.'
    },
    'Fashion Design': {
        eyebrow: 'School of Fashion & Design',
        heading: 'Fashion design programmes',
        body: 'Explore FEWA’s Fashion Design & Creative Styling pathway.'
    },
    'Short Courses': {
        eyebrow: 'Short Courses & Workshops',
        heading: 'Flexible, practical short courses',
        body: 'Explore FEWA’s short courses designed to build specific professional skills.'
    }
};

// Applies ?category=A,B from the URL (set by the homepage "school" links) on
// load: pre-selects the matching filter chip(s) and shows a short, relevant
// intro. An unrecognized or missing category param leaves the page in its
// normal default state (All Courses) -- this never hides or breaks the
// catalogue for a direct/plain visit to courses.html.
function applyCategoryFilterFromUrl() {
    const requested = new URLSearchParams(window.location.search).get('category');
    if (!requested) return false;
    const categories = requested.split(',').map((value) => value.trim()).filter(Boolean);
    const matchingButtons = [...filterButtons].filter((button) => categories.includes(button.dataset.filter));
    if (!matchingButtons.length) return false; // unknown category value(s) -- keep default "All Courses" view

    filterButtons.forEach((item) => {
        const isMatch = matchingButtons.includes(item);
        item.classList.toggle('is-active', isMatch);
        item.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });
    renderCourses(categories);

    const intro = SCHOOL_INTROS[categories.join(',')];
    if (intro) {
        const eyebrowEl = document.querySelector('.courses-intro .courses-eyebrow');
        const headingEl = document.querySelector('.courses-intro h1');
        const bodyEl = document.querySelector('.courses-intro p');
        if (eyebrowEl) eyebrowEl.textContent = intro.eyebrow;
        if (headingEl) headingEl.textContent = intro.heading;
        if (bodyEl) bodyEl.textContent = intro.body;
    }
    return true;
}

const mobileMenu = document.querySelector('#mobile-menu');
const navLinks = document.querySelector('.nav-links');
if (mobileMenu && navLinks) {
    mobileMenu.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('active');
        mobileMenu.setAttribute('aria-expanded', String(isOpen));
        mobileMenu.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
}

if (!applyCategoryFilterFromUrl()) renderCourses();

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

function renderCourses(filter = 'All Courses') {
    if (!courseGrid) return;
    const visibleCourses = filter === 'All Courses'
        ? courses
        : courses.filter((course) => course.category === filter);

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

const mobileMenu = document.querySelector('#mobile-menu');
const navLinks = document.querySelector('.nav-links');
if (mobileMenu && navLinks) {
    mobileMenu.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('active');
        mobileMenu.setAttribute('aria-expanded', String(isOpen));
        mobileMenu.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
}

renderCourses();

window.FEWA_COURSES = [
    {
        title: 'Cosmetology & Advanced Beauty Therapy',
        category: 'Beauty & Wellness',
        qualification: 'Diploma',
        duration: '2 Years',
        description: 'Skin therapies, aesthetics, spa treatments and salon management.',
        image: 'assets/01_cosmetology_beauty_therapy.png',
        icon: 'fa-sparkles',
        slug: 'cosmetology-advanced-beauty-therapy'
    },
    {
        title: 'Fashion Design & Creative Styling',
        category: 'Fashion Design',
        qualification: 'Diploma',
        duration: '2 Years',
        description: 'Pattern drafting, textiles, garment construction and styling.',
        image: 'assets/02_fashion_design_creative_styling.png',
        icon: 'fa-scissors',
        slug: 'fashion-design-creative-styling'
    },
    {
        title: 'Professional Hairdressing & Trichology',
        category: 'Hair & Barbering',
        qualification: 'Certificate',
        duration: '1.5 Years',
        description: 'Cutting, colour systems, chemical work and scalp health.',
        image: 'assets/03_professional_hairdressing_trichology.png',
        icon: 'fa-wand-magic-sparkles',
        slug: 'professional-hairdressing-trichology'
    },
    {
        title: 'Professional Makeup Artistry',
        category: 'Beauty & Wellness',
        qualification: 'Certificate',
        duration: '6 Months',
        description: 'Makeup techniques for beauty, bridal, editorial and special effects.',
        image: 'assets/04_professional_makeup_artistry.png',
        icon: 'fa-paintbrush',
        slug: 'professional-makeup-artistry'
    },
    {
        title: 'Nail Technology & Art',
        category: 'Beauty & Wellness',
        qualification: 'Certificate',
        duration: '6 Months',
        description: 'Manicure, pedicure, nail extensions, nail art and business skills.',
        image: 'assets/05_nail_technology_art.png',
        icon: 'fa-hand-sparkles',
        slug: 'nail-technology-art'
    },
    {
        title: "Barbering & Men's Grooming",
        category: 'Hair & Barbering',
        qualification: 'Certificate',
        duration: '6 Months',
        description: "Haircutting, shaving, beard design and men's grooming.",
        image: 'assets/06_barbering_mens_grooming.png',
        icon: 'fa-scissors',
        slug: 'barbering-mens-grooming'
    },
    {
        title: 'Spa Therapy & Wellness',
        category: 'Beauty & Wellness',
        qualification: 'Certificate',
        duration: '6 Months',
        description: 'Massage, body treatments, aromatherapy and holistic wellness.',
        image: 'assets/07_spa_therapy_wellness.png',
        icon: 'fa-leaf',
        slug: 'spa-therapy-wellness'
    },
    {
        title: 'Skincare & Facial Therapy',
        category: 'Beauty & Wellness',
        qualification: 'Certificate',
        duration: '6 Months',
        description: 'Facial treatments, skincare analysis and product knowledge.',
        image: 'assets/08_skincare_facial_therapy.png',
        icon: 'fa-droplet',
        slug: 'skincare-facial-therapy'
    },
    {
        title: 'Beauty Business Management',
        category: 'Short Courses',
        qualification: 'Certificate',
        duration: '3 Months',
        description: 'Salon management, marketing, customer care and finance.',
        image: 'assets/09_beauty_business_management.png',
        icon: 'fa-chart-line',
        slug: 'beauty-business-management'
    },
    {
        title: 'Short Courses & Workshops',
        category: 'Short Courses',
        qualification: 'Various',
        duration: 'Flexible',
        description: 'Short practical courses to upgrade your skills and boost your career.',
        image: 'assets/10_short_courses_workshops.png',
        icon: 'fa-lightbulb',
        slug: 'short-courses-workshops'
    }
];

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

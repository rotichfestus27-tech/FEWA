// FEWA COURSE CATALOGUE -- SINGLE SOURCE OF TRUTH
//
// Every course/programme name, category, qualification, duration, description,
// image and slug used anywhere on the site (course listing, course detail pages,
// the application form, and the homepage) comes from this one array. To add,
// edit, or remove a course, change it here only -- every page that displays
// courses reads from window.FEWA_COURSES at render time.
//
// This file intentionally contains ONLY data, no DOM/rendering code, so it can
// be loaded standalone by any page (courses.html, course-detail.html, apply.html,
// index.html) ahead of that page's own display logic.
window.FEWA_COURSES = [
    {
        title: 'Beauty Therapy',
        category: 'Cosmetology',
        qualification: 'Artisan Certificate, Diploma',
        duration: '9 months, 18 months',
        description: 'Makeup, Facial, Manicure, Pedicure, Waxing and Nail Technology.',
        image: 'assets/01_cosmetology_beauty_therapy.png',
        icon: 'fa-sparkles',
        slug: 'cosmetology-advanced-beauty-therapy'
    },
    {
        title: 'Fashion Design',
        category: 'Fashion Design',
        qualification: 'Diploma',
        duration: '2 Years',
        description: 'Pattern Drafting & Garment Construction, Fashion Illustration, CAD (Fashion Computer-Aided Design.',
        image: 'assets/02_fashion_design.jpg',
        icon: 'fa-scissors',
        slug: 'fashion-design'
    },
        {
        title: 'Fashion Marketing & Branding',
        category: 'Fashion Design',
        qualification: 'Diploma',
        duration: '2 Years',
        description: 'Individual Project, Fabric manipulation, Modelling & Cat walking',
        image: 'assets/fashion_marketing_&_branding.webp',
        icon: 'fa-scissors',
        slug: 'fashion-marketing-branding'
    },
    {
        title: 'Hairdressing',
        category: 'Cosmetology',
        qualification: 'Artisan Certificate, Certificate, Diploma',
        duration: '9 months, 9 months, 18 months',
        description: 'Braiding & Plaiting, Twisting, Wash & Blow-Dry etc.',
        image: 'assets/03_professional_hairdressing_trichology.webp',
        icon: 'fa-wand-magic-sparkles',
        slug: 'professional-hairdressing-trichology'
    },
    {
        title: 'Pattern Drafting and Garment Construction',
        category: 'Short Courses',
        qualification: 'Certificate',
        duration: '3 Months',
        description: 'Specialize in either gowns, Mens wear, Suits, Childrens Wear etc.',
        image: 'assets/pattern_drafting_and_garment_construction.jpg',
        icon: 'fa-chart-line',
        slug: 'pattern-drafting-and-garment-construction'
    },
    {
        title: 'Fashion Illustration',
        category: 'Short Courses',
        qualification: '',
        duration: 'Flexible',
        description: 'Short practical courses to upgrade your skills and boost your career.',
        image: 'assets/10_short_courses_workshops.png',
        icon: 'fa-lightbulb',
        slug: 'fashion-illustration'
    },
    {
        title: 'Fashion Computer Aided Designing (CAD)',
        category: 'Short Courses',
        qualification: '',
        duration: '3 Months',
        description: '',
        image: 'assets/fashion_aided_computer_design.jpg',
        icon: 'fa-chart-line',
        slug: 'fashion-computer-aided-designing'
    },
        {
        title: 'Fashion Marketing and Fashion Brands',
        category: 'Short Courses',
        qualification: 'Certificate',
        duration: '3 Months',
        description: '',
        image: 'assets/09_beauty_business_management.webp',
        icon: 'fa-chart-line',
        slug: 'fashion-marketing-and-fashion-brands'
    }
];

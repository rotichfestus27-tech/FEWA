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

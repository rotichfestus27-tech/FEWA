// FEWA COURSE CATALOGUE -- SINGLE SOURCE OF TRUTH
//
// Every course/programme name, category, qualification, duration, description,
// image, slug and About-the-Course content used anywhere on the site (course
// listing, course detail pages, the application form, and the homepage) comes
// from this one array. To add, edit, or remove a course, change it here only
// -- every page that displays courses reads from window.FEWA_COURSES at
// render time.
//
// This file intentionally contains ONLY data, no DOM/rendering code, so it can
// be loaded standalone by any page (courses.html, course-detail.html, apply.html,
// index.html) ahead of that page's own display logic.
//
// Restructured into 3 schools (School of Cosmetology / School of Fashion
// Design / Short Courses) per approved direction. qualification/duration are
// left as '' (not invented) for any course with no verified figure at all,
// and set to FEWA_UNCONFIRMED_META for courses whose previously-displayed
// figure was checked against FEWA's own source documents and found to be
// either unsupported or inconsistent with them (see pre-deployment review).
//
// about.* fields are DRAFT placeholder copy (clearly marked here and in the
// rendered page) pending real content from FEWA -- not sourced from a
// verified document. Everything else (title, category, qualification,
// duration) reflects the approved course list only.
const UNCONFIRMED = 'To be confirmed by FEWA';
window.FEWA_UNCONFIRMED_META = UNCONFIRMED;

// Shared badge builder so every page that displays qualification/duration
// (course cards, course-detail hero) renders a single combined badge instead
// of two duplicate "To be confirmed by FEWA" badges side by side.
window.FEWA_courseMetaBadges = function (course) {
    const q = course.qualification;
    const d = course.duration;
    if (q === UNCONFIRMED && d === UNCONFIRMED) {
        return [{ icon: 'fa-circle-info', text: 'Qualification & duration to be confirmed by FEWA' }];
    }
    const badges = [];
    if (q) badges.push({ icon: 'fa-award', text: q });
    if (d) badges.push({ icon: 'fa-clock', text: d });
    return badges;
};

window.FEWA_COURSES = [
    // ---------------- School of Cosmetology ----------------
    {
        title: 'Cosmetology',
        category: 'School of Cosmetology',
        qualification: '',
        duration: '',
        description: 'Professional cosmetology training covering skin science, treatments and salon practice.',
        image: 'assets/01_cosmetology_beauty_therapy.png',
        icon: 'fa-sparkles',
        slug: 'cosmetology',
        about: {
            isDraft: true,
            overview: 'FEWA’s Cosmetology programme introduces you to the full scope of professional beauty science, preparing you to work confidently in salons, spas and clinics.',
            whatYouWillLearn: [
                'Skin anatomy and analysis',
                'Professional treatment techniques',
                'Product knowledge and safe practice',
                'Client consultation and salon hygiene standards'
            ],
            practicalTraining: 'Hands-on practice in FEWA’s training salon, working on real treatments under instructor supervision from early in the programme.',
            careerOpportunities: 'Graduates go on to work in salons and spas, or start their own cosmetology practice.'
        }
    },
    {
        title: 'Beauty Therapy',
        category: 'School of Cosmetology',
        qualification: '',
        duration: '',
        description: 'Comprehensive beauty therapy training in facials, treatments and client care.',
        // No dedicated photo exists yet -- reuses the Cosmetology image (closest
        // existing match) per approved direction.
        image: 'assets/01_cosmetology_beauty_therapy.png',
        icon: 'fa-spa',
        slug: 'beauty-therapy',
        about: {
            isDraft: true,
            overview: 'The Beauty Therapy programme builds the practical skills needed to deliver professional facial, skin and body treatments.',
            whatYouWillLearn: [
                'Facial treatments and skincare routines',
                'Body treatments and client care',
                'Hygiene and safety standards',
                'Product and equipment knowledge'
            ],
            practicalTraining: 'Supervised practical sessions in FEWA’s training facility, working with real clients and professional equipment.',
            careerOpportunities: 'Prepares graduates for roles in spas, salons and wellness centres, or self-employment as a beauty therapist.'
        }
    },
    {
        title: 'Hairdressing',
        category: 'School of Cosmetology',
        qualification: UNCONFIRMED,
        duration: UNCONFIRMED,
        description: 'Cutting, colour systems, chemical work and scalp health.',
        image: 'assets/03_professional_hairdressing_trichology.png',
        icon: 'fa-wand-magic-sparkles',
        slug: 'hairdressing',
        about: {
            isDraft: true,
            overview: 'FEWA’s Hairdressing programme trains you in the full range of modern hairdressing techniques, from cutting and colour to scalp health.',
            whatYouWillLearn: [
                'Cutting and styling techniques',
                'Colour theory and application',
                'Chemical processes and scalp health',
                'Client consultation'
            ],
            practicalTraining: 'Extensive hands-on training in FEWA’s salon, working on live models and real client services.',
            careerOpportunities: 'Graduates work as professional hairdressers in salons, or go on to open their own salon business.'
        }
    },

    // ---------------- School of Fashion Design ----------------
    {
        title: 'Pattern Drafting & Garment Construction',
        category: 'School of Fashion Design',
        qualification: UNCONFIRMED,
        duration: UNCONFIRMED,
        description: 'Specialize in pattern drafting and garment construction for gowns, menswear, suits and childrenswear.',
        image: 'assets/02_fashion_design_creative_styling.png',
        icon: 'fa-shirt',
        slug: 'pattern-drafting-and-garment-construction',
        about: {
            isDraft: true,
            overview: 'This programme focuses on the technical foundation of fashion design: drafting patterns and constructing garments to a professional standard.',
            whatYouWillLearn: [
                'Pattern drafting techniques',
                'Garment construction methods',
                'Fitting and finishing',
                'Working across categories such as gowns, menswear, suits and childrenswear'
            ],
            practicalTraining: 'Hands-on studio work constructing real garments from pattern to finished piece.',
            careerOpportunities: 'Prepares graduates for roles as pattern makers, garment constructors or independent fashion designers.'
        }
    },
    {
        title: 'Fashion Illustration & CAD',
        category: 'School of Fashion Design',
        qualification: '',
        duration: '',
        description: 'Fashion illustration and computer-aided design skills for the modern fashion designer.',
        image: 'assets/10_short_courses_workshops.png',
        icon: 'fa-lightbulb',
        slug: 'fashion-illustration-and-cad',
        about: {
            isDraft: true,
            overview: 'This programme combines traditional fashion illustration with Computer-Aided Design (CAD), giving you the tools to sketch and digitally develop your designs.',
            whatYouWillLearn: [
                'Fashion figure drawing and illustration techniques',
                'Rendering fabric, texture and colour',
                'Digital design using CAD software',
                'Building a professional design portfolio'
            ],
            practicalTraining: 'Studio-based practice combining hand-drawn illustration with computer-based design work.',
            careerOpportunities: 'Prepares graduates for roles as fashion illustrators, design assistants or freelance designers.'
        }
    },
    {
        title: 'Fashion Marketing & Fashion Brands',
        category: 'School of Fashion Design',
        qualification: UNCONFIRMED,
        duration: UNCONFIRMED,
        description: 'Marketing, branding and business skills for the fashion industry.',
        image: 'assets/02_fashion_design_creative_styling.png',
        icon: 'fa-bullhorn',
        slug: 'fashion-marketing-and-fashion-brands',
        about: {
            isDraft: true,
            overview: 'This programme introduces the business side of fashion -- how brands are built, marketed and positioned in a competitive industry.',
            whatYouWillLearn: [
                'Fashion brand development',
                'Marketing strategy and promotion',
                'Industry trends and consumer behaviour',
                'Building a fashion business'
            ],
            practicalTraining: 'Practical projects developing and presenting a fashion brand concept.',
            careerOpportunities: 'Prepares graduates for roles in fashion marketing, brand management or launching their own fashion label.'
        }
    },
    {
        title: 'Fashion & Textile Design',
        category: 'School of Fashion Design',
        qualification: '',
        duration: '',
        description: 'Explore textile design and its role in creating original fashion pieces.',
        // No dedicated photo exists yet -- reuses the Fashion Design image
        // (closest existing match) per approved direction.
        image: 'assets/02_fashion_design_creative_styling.png',
        icon: 'fa-paintbrush',
        slug: 'fashion-and-textile-design',
        about: {
            isDraft: true,
            overview: 'This programme explores the relationship between textiles and fashion, teaching you to design and work with fabric as a creative material.',
            whatYouWillLearn: [
                'Textile design principles',
                'Fabric manipulation and surface design',
                'Integrating textiles into fashion pieces',
                'Material selection and sourcing'
            ],
            practicalTraining: 'Hands-on studio work designing and developing original textile-based fashion pieces.',
            careerOpportunities: 'Prepares graduates for roles in textile design, fashion production or independent design practice.'
        }
    },

    // ---------------- Short Courses ----------------
    {
        title: 'Makeup',
        category: 'Short Courses',
        qualification: UNCONFIRMED,
        duration: UNCONFIRMED,
        description: 'Makeup techniques for beauty, bridal and editorial styles.',
        image: 'assets/04_professional_makeup_artistry.png',
        icon: 'fa-paint-brush',
        slug: 'makeup',
        about: {
            isDraft: true,
            overview: 'FEWA’s Makeup programme builds professional makeup artistry skills across a range of styles and settings.',
            whatYouWillLearn: [
                'Beauty and everyday makeup application',
                'Bridal and editorial makeup techniques',
                'Hygiene and professional kit management'
            ],
            practicalTraining: 'Hands-on practice working on real models for beauty, bridal and editorial looks.',
            careerOpportunities: 'Prepares graduates for work as freelance or salon-based makeup artists.'
        }
    },
    {
        title: 'Nail Technology',
        category: 'Short Courses',
        qualification: UNCONFIRMED,
        duration: UNCONFIRMED,
        description: 'Manicure, pedicure, nail extensions and nail art.',
        image: 'assets/05_nail_technology_art.png',
        icon: 'fa-hand-sparkles',
        slug: 'nail-technology',
        about: {
            isDraft: true,
            overview: 'This programme trains you in the full range of professional nail care and nail art techniques.',
            whatYouWillLearn: [
                'Manicure and pedicure techniques',
                'Nail extensions and enhancements',
                'Nail art design',
                'Hygiene and safety standards'
            ],
            practicalTraining: 'Supervised hands-on practice in FEWA’s training facility, working with real clients.',
            careerOpportunities: 'Prepares graduates for roles in salons and spas, or self-employment as a nail technician.'
        }
    },
    {
        title: 'Braiding & Plaiting',
        category: 'Short Courses',
        qualification: '',
        duration: '',
        description: 'Professional braiding and plaiting techniques for a range of styles.',
        // No dedicated photo exists yet -- reuses the Hairdressing image
        // (closest existing match) per approved direction.
        image: 'assets/03_professional_hairdressing_trichology.png',
        icon: 'fa-cut',
        slug: 'braiding-and-plaiting',
        about: {
            isDraft: true,
            overview: 'This short course builds professional skill in braiding and plaiting, a core service offered in salons across Kenya.',
            whatYouWillLearn: [
                'Braiding and plaiting techniques across styles',
                'Hair preparation and sectioning',
                'Working with extensions',
                'Client care and finishing'
            ],
            practicalTraining: 'Hands-on practice on real models, building speed and precision under instructor guidance.',
            careerOpportunities: 'Prepares graduates for salon-based braiding roles or mobile/freelance styling services.'
        }
    }
];

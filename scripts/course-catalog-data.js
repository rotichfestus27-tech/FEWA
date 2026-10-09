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
// about.overview holds the official programme description supplied by FEWA
// for each course, as one or more paragraphs (array of strings). For the 3
// Short Courses, the first paragraph is the shared FEWA_SHORT_COURSES_INTRO
// text, followed by the course-specific paragraph. isDraft is false for
// every course below -- the client has supplied and approved this content,
// so no "pending review" banner is shown. qualification/duration remain
// separate from this text and are NOT authorized by it (see UNCONFIRMED).
const UNCONFIRMED = 'To be confirmed by FEWA';
window.FEWA_UNCONFIRMED_META = UNCONFIRMED;

window.FEWA_SHORT_COURSES_INTRO = 'Designed for beginners, career changers, entrepreneurs and working professionals, our short courses provide focused, hands-on training in specific areas of beauty. They offer a practical way to develop new skills, strengthen existing abilities or prepare for income-generating opportunities.';

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
            isDraft: false,
            overview: [
                'Our comprehensive Cosmetology programme brings together the essential skills of beauty and hair artistry in one well-rounded qualification. Students gain practical experience in hair cutting, styling, colouring and treatments, alongside skincare, makeup, manicures and pedicures. Training also emphasises client care, hygiene, professional standards and essential business skills, preparing graduates to work confidently in salons, spas and beauty studios or establish and manage their own businesses.'
            ]
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
            isDraft: false,
            overview: [
                'This programme focuses on skin, body care and wellness, equipping students with practical skills in facials, skin analysis, waxing, massage, manicures, pedicures and spa treatments. Students also develop knowledge of beauty products, safe and hygienic practices, and professional client consultation. The programme prepares graduates for opportunities in beauty clinics, spas, hotels, wellness centres and related settings.'
            ]
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
            isDraft: false,
            overview: [
                'Develop professional hairdressing skills from foundational techniques to advanced salon practices. Training covers hair cutting, styling, colouring, relaxing, perming, scalp and hair care, together with essential salon management skills. Through hands-on practical training, students build the confidence, creativity and technical ability needed to succeed as salon professionals or independent hairstylists.'
            ]
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
            isDraft: false,
            overview: [
                'Transform creative concepts into well-constructed, wearable garments. Students learn professional measurement techniques, pattern drafting, fabric cutting and garment construction using appropriate sewing techniques. The programme develops technical accuracy, creativity and quality finishing, preparing graduates for opportunities in tailoring, garment production, fashion houses and their own fashion labels.'
            ]
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
            isDraft: false,
            overview: [
                'Learn to communicate fashion ideas clearly through both traditional illustration and digital design. Students develop skills in figure drawing, fabric and texture rendering, design presentation and computer-aided design (CAD), including digital sketches, technical flats and professional portfolios. This programme is ideal for aspiring designers who want to present their creative concepts with confidence and professionalism.'
            ]
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
            isDraft: false,
            overview: [
                'Discover the business, communication and marketing principles behind successful fashion brands. Students explore branding, retail and merchandising, trend analysis, social media and digital marketing, as well as strategies for building and promoting fashion labels. Graduates can pursue opportunities in fashion retail, communications, buying and brand management, or use their skills to develop and grow their own fashion businesses.'
            ]
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
            isDraft: false,
            overview: [
                'Explore the creative relationship between fashion, textiles and material design. Students develop skills in design development, fabric selection and manipulation, surface decoration, printing, dyeing and other textile techniques, while learning how to develop cohesive fashion collections. The programme encourages creativity and original thinking, preparing graduates for careers in fashion and textile design, creative production and entrepreneurship.'
            ]
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
            isDraft: false,
            overview: [
                window.FEWA_SHORT_COURSES_INTRO,
                'Learn colour theory, skin preparation and professional makeup application for day, evening and bridal looks.'
            ]
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
            isDraft: false,
            overview: [
                window.FEWA_SHORT_COURSES_INTRO,
                'Develop practical skills in manicures, pedicures, gel and acrylic applications, nail art and nail health.'
            ]
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
            isDraft: false,
            overview: [
                window.FEWA_SHORT_COURSES_INTRO,
                'Learn and practise a wide range of braiding techniques, from classic plaits to modern protective and decorative styles.'
            ]
        }
    }
];

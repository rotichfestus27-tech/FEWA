// Server-side mirror of the "qualification level" shown for each programme in
// scripts/course-catalog-data.js (the browser-only course catalogue used by
// the public site). Cloud Functions cannot load that file directly -- it
// assigns to `window.FEWA_COURSES`, a browser global -- so this file repeats
// just the title -> level mapping needed to print the "Level" field on a
// generated acceptance letter. Keep this in sync by hand whenever a
// programme's qualification/qualificationLevel changes in the course
// catalogue. Short Courses intentionally have no level (qualification: '' in
// the catalogue), matching how the website itself displays them.
const COURSE_LEVELS = {
    'Cosmetology': 'Certificate (Level 4)',
    'Beauty Therapy': 'Certificate (Level 4)',
    'Hairdressing': 'Certificate (Level 4)',
    'Pattern Drafting & Garment Construction': 'Certificate (Level 4)',
    'Fashion Illustration & CAD': 'Certificate (Level 4)',
    'Fashion Marketing & Fashion Brands': 'Certificate (Level 4)',
    'Fashion & Textile Design': 'Certificate (Level 4)',
    'Makeup': '',
    'Nail Technology': '',
    'Braiding & Plaiting': ''
};

function qualificationLevelForProgram(program) {
    return COURSE_LEVELS[program] || '';
}

module.exports = { qualificationLevelForProgram };

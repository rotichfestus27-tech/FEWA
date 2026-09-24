// FEWA FEE STRUCTURE -- SINGLE SOURCE OF TRUTH
//
// Every fee amount, payment period, study mode and package name shown on the
// public Fees page comes from this one object. To change a fee, edit it here
// only -- fees.html's display script (scripts/fees.js) renders whatever is in
// window.FEWA_FEES; it contains no amounts of its own.
//
// These are the official amounts supplied by FEWA. All figures below were
// verified against the client's supplied table before this file was written;
// none have been recalculated, rounded, or altered.
window.FEWA_FEES = {
    admission: {
        title: 'One-Time Payment on Admission',
        schools: ['School of Fashion & Design', 'School of Cosmetology'],
        items: [
            {
                particulars: 'School Registration Fee',
                period: 'Once',
                amounts: { 'School of Fashion & Design': 1000, 'School of Cosmetology': 1000 }
            },
            {
                particulars: 'Student ID',
                period: 'Once',
                amounts: { 'School of Fashion & Design': 500, 'School of Cosmetology': 500 }
            },
            {
                particulars: 'Student Branded T-shirt',
                period: 'Once',
                amounts: { 'School of Fashion & Design': 600, 'School of Cosmetology': 600 }
            },
            {
                particulars: 'Student Starter Pack (Design Kit, Beauty Kit)',
                period: 'Once',
                amounts: { 'School of Fashion & Design': 10000, 'School of Cosmetology': 10000 }
            },
            {
                particulars: 'School Equipment Maintenance Fee',
                period: 'Once a year',
                amounts: { 'School of Fashion & Design': 1000, 'School of Cosmetology': 1000 }
            }
        ],
        // Supplied directly by the client as the total -- not recalculated here.
        // (It does independently match the sum of the items above: 1000 + 500 +
        // 600 + 10000 + 1000 = 13,100, so no discrepancy was found to flag.)
        total: { 'School of Fashion & Design': 13100, 'School of Cosmetology': 13100 }
    },

    cosmetology: {
        title: 'Certificate & Diploma in Cosmetology (Beauty Therapy & Hairdressing)',
        studyModes: [
            {
                mode: 'Full-Time Class',
                payments: [
                    { period: 'Monthly Fee', amount: 13500 },
                    { period: '3 Months (Discounted)', amount: 39000 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 71500 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 142000 }
                ]
            },
            {
                mode: 'Part-Time / Evening Class',
                payments: [
                    { period: 'Monthly Fee', amount: 10000 },
                    { period: '3 Months (Discounted)', amount: 28500 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 55000 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 96000 }
                ]
            },
            {
                mode: 'Weekend Class Only',
                payments: [
                    { period: 'Monthly Fee', amount: 8500 },
                    { period: '3 Months (Discounted)', amount: 24000 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 42000 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 78000 }
                ]
            }
        ]
    },

    fashionDesign: {
        title: 'Certificate & Diploma in Fashion & Design',
        studyModes: [
            {
                mode: 'Full-Time Class',
                payments: [
                    { period: 'Monthly Fee', amount: 13500 },
                    { period: '3 Months (Discounted)', amount: 39000 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 71500 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 142000 }
                ]
            },
            {
                mode: 'Part-Time / Evening Class',
                payments: [
                    { period: 'Monthly Fee', amount: 10000 },
                    { period: '3 Months (Discounted)', amount: 28500 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 55000 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 96000 }
                ]
            },
            {
                mode: 'Weekend Class Only',
                payments: [
                    { period: 'Monthly Fee', amount: 8500 },
                    { period: '3 Months (Discounted)', amount: 24000 },
                    { period: '6 Months Bulk Fee (Discounted)', amount: 42000 },
                    { period: '12 Months Bulk Fee (Discounted)', amount: 78000 }
                ]
            }
        ]
    },

    // Individual short-course packages -- explicitly NOT the same as the full
    // Certificate & Diploma programme fees above. Only the courses the client
    // supplied a price for are listed; no other short course gets an invented
    // price.
    singleFashionPackages: {
        title: 'Single Fashion Design Packages',
        billingPeriod: 'Per Month',
        packages: [
            {
                name: 'Pattern Drafting & Garment Construction',
                amount: 15500,
                note: "Specialize in either gowns, Men's Wear, Suits, Children's Wear, etc."
            },
            { name: 'Fashion Marketing & Fashion Brands', amount: 15500 },
            { name: 'Fashion Illustration', amount: 15500 },
            { name: 'Fashion & Textile Design', amount: 15500 },
            { name: 'Fashion Computer-Aided Designing (CAD)', amount: 26000 }
        ]
    }
};

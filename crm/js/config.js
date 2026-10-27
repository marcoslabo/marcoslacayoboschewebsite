// ==========================================================================
// CRM Configuration
// ==========================================================================

const CRM_CONFIG = {
    // Supabase Configuration (same as Spark)
    SUPABASE_URL: 'https://eccodohheekwbywifipl.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo',

    // Contact Sources
    SOURCES: [
        'Grader',
        'LinkedIn post',
        'LinkedIn outreach',
        'Newsletter',
        'Referral',
        'Other'
    ],

    // Pipeline stages, in order (stored in contacts.status)
    PIPELINE: [
        'Reached out',
        'Replied',
        'Graded',
        'Call booked',
        'Demo built',
        'Demo reviewed',
        'Handed to Nymbl'
    ],

    // Every stage a contact can be in: the pipeline plus the two side stages
    STATUSES: [
        'Reached out',
        'Replied',
        'Graded',
        'Call booked',
        'Demo built',
        'Demo reviewed',
        'Handed to Nymbl',
        'Nurture',
        'Not a Fit'
    ],

    // Daily outreach target shown on the dashboard
    DAILY_OUTREACH_TARGET: 100,

    // Next Actions
    NEXT_ACTIONS: [
        'Call',
        'Email',
        'LinkedIn',
        'Follow Up',
        'None'
    ],

    // Brevo Tags by Source
    BREVO_TAGS: {
        'Grader': 'grader-lead',
        'LinkedIn post': 'linkedin-lead',
        'LinkedIn outreach': 'linkedin-lead',
        'Newsletter': 'newsletter',
        'Referral': 'referral-lead',
        'Other': 'other-lead'
    }
};

// Make config globally available
window.CRM_CONFIG = CRM_CONFIG;

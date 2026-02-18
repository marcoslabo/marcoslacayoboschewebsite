// ==========================================================================
// CRM Configuration
// ==========================================================================

const CRM_CONFIG = {
    // Supabase Configuration (same as Spark)
    SUPABASE_URL: 'https://eccodohheekwbywifipl.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo',

    // Session Settings
    SESSION_KEY: 'crm_session_token',

    // Contact Sources
    SOURCES: [
        'Website (Spark)',
        'Direct Call',
        'Referral',
        'LinkedIn',
        'Event',
        'Met In Person',
        'Clay Import',
        'Other'
    ],

    // Contact Statuses
    STATUSES: [
        'New',
        'Active',
        'Won',
        'Lost',
        'Nurture',
        'Not a Fit'
    ],

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
        'Website (Spark)': 'spark-lead',
        'Met In Person': 'met-lead',
        'Clay Import': 'clay-lead',
        'Direct Call': 'direct-lead',
        'Referral': 'referral-lead',
        'LinkedIn': 'linkedin-lead',
        'Event': 'event-lead',
        'Other': 'other-lead'
    }
};

// Make config globally available
window.CRM_CONFIG = CRM_CONFIG;

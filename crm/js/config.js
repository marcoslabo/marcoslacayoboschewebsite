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
    //   To contact  → on a list, not messaged yet
    //   Messaged    → you sent something, waiting for an answer
    //   Replied     → they answered (or finished the Grader)
    PIPELINE: [
        'To contact',
        'Messaged',
        'Replied',
        'Call booked',
        'Demo',
        'Won'
    ],

    // Every stage a contact can be in: the pipeline plus the two side stages
    STATUSES: [
        'To contact',
        'Messaged',
        'Replied',
        'Call booked',
        'Demo',
        'Won',
        'Nurture',
        'Not a Fit'
    ],

    SIDES: { nymbl: 'Nymbl', personal: 'Personal' },

    // New people per day (editable on Today, remembered per side). LinkedIn
    // limits connection requests, so the default is conservative.
    DAILY_NEW_TARGET: 20,

    // Skip a company someone there heard from recently
    OUTREACH_ORG_COOLDOWN_DAYS: 14,

    // Follow-up sequence: after message N is sent, the next one is due in waitDays.
    // After the last one with no reply, the person moves to Nurture and comes
    // back in NURTURE_RETURN_DAYS.
    CADENCE: [
        { step: 1, label: 'First message', waitDays: 4,
          brief: 'First message. Follow the template.' },
        { step: 2, label: 'Follow-up', waitDays: 6,
          brief: 'Short follow-up, 1 to 2 sentences, with a new angle. Do not repeat the first message or apologize for following up.' },
        { step: 3, label: 'Something useful', waitDays: 11,
          brief: 'Share one useful idea or a quick example related to their likely headache, 2 to 3 sentences, then a light question.' },
        { step: 4, label: 'Close the loop', waitDays: 60,
          brief: 'A polite close-the-loop note, 1 to 2 sentences: no pressure, the offer stays open.' }
    ],
    NURTURE_RETURN_DAYS: 60,

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

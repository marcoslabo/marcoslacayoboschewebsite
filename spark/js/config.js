// ==========================================================================
// Spark Configuration
// ==========================================================================

const SPARK_CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://eccodohheekwbywifipl.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo',

    // OpenAI Configuration (set via environment or localStorage)
    OPENAI_API_KEY: localStorage.getItem('OPENAI_API_KEY') || '',
    OPENAI_MODEL: 'gpt-4-turbo-preview',

    // App Configuration
    APP_NAME: 'Spark',
    CALENDAR_LINK: 'https://calendly.com/marcos-bosche-nymbl/30min', // Replace with actual calendar link

    // Default Values
    DEFAULT_HOURLY_RATE: 50,
    DEFAULT_IMPROVEMENT_PERCENT: 80,

    // Industries
    INDUSTRIES: [
        'Healthcare',
        'Financial Services',
        'Manufacturing',
        'Consulting',
        'Private Equity',
        'Technology',
        'Retail',
        'Energy',
        'Other'
    ],

    // Company Sizes
    COMPANY_SIZES: [
        '1-50',
        '51-200',
        '201-500',
        '501-1000',
        '1000-5000',
        '5000+'
    ],

    // Departments
    DEPARTMENTS: [
        'Operations',
        'Finance',
        'Clinical',
        'IT',
        'HR',
        'Sales',
        'Marketing',
        'Legal',
        'Other'
    ],

    // Contact Sources
    SOURCES: [
        'Website (Spark)',
        'Direct Call',
        'Referral',
        'LinkedIn',
        'Event',
        'Other'
    ],

    // Brief Statuses
    STATUSES: [
        'Draft',
        'Shared',
        'Qualified',
        'In Progress',
        'Deployed',
        'Measuring',
        'Closed Lost'
    ],

    // Solution Levels
    SOLUTION_LEVELS: [
        'Level 1 - Existing Tools',
        'Level 2 - Workflow Integration',
        'Level 3 - Custom Development'
    ]
};

// Make config globally available
window.SPARK_CONFIG = SPARK_CONFIG;

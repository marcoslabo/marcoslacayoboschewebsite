// ==========================================================================
// AI Prompts for Spark
// ==========================================================================

const AI_PROMPTS = {
    /**
     * Problem Cleanup Prompt
     * Transforms messy notes into professional problem statements
     */
    problemCleanup: (problemRaw) => `You are helping create a professional solution brief. 

Take this raw problem description and rewrite it as a clear, professional problem statement. Keep the same meaning but make it polished and suitable for a business document.

Rules:
- 2-4 sentences
- Professional tone
- Specific about the pain points
- Don't add information that wasn't there
- Don't use buzzwords

Raw input: ${problemRaw}

Return only the cleaned description, nothing else.`,

    /**
     * Level Classification Prompt
     * Determines solution complexity
     */
    levelClassification: (problemClean, currentProcess, hoursPerWeek, peopleInvolved) => `You are an AI solutions architect helping classify solution complexity.

Based on this problem, classify it as Level 1, 2, or 3:

Level 1 - Existing Tools: Can be solved by showing them features in tools they already have (ChatGPT, Claude, Excel, existing software). Minimal implementation.

Level 2 - Workflow Integration: Requires connecting multiple systems, setting up automations (Zapier, Make), or adding AI into existing workflows. Medium implementation.

Level 3 - Custom Development: Requires building custom software, complex AI pipelines, or significant engineering work. Major implementation.

Problem: ${problemClean}

Current Process: ${currentProcess || 'Not specified'}

Scale: ${hoursPerWeek || 'Unknown'} hours/week across ${peopleInvolved || 'Unknown'} people

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "level": "Level 1 - Existing Tools",
  "reasoning": "One sentence explanation of why this level",
  "confidence": "High"
}

Use one of these exact level values:
- "Level 1 - Existing Tools"
- "Level 2 - Workflow Integration"
- "Level 3 - Custom Development"`,

    /**
     * Suggested Approach Prompt
     * Generates high-level solution description
     */
    suggestedApproach: (problemClean, solutionLevel, industry) => `You are an AI solutions consultant working with Marcos Bosche, who specializes in AI transformation for enterprises, especially healthcare.

Based on this problem and solution level, suggest a high-level approach in 2-3 sentences. Be specific but not overly technical. This will be shown to the prospect.

Problem: ${problemClean}

Solution Level: ${solutionLevel}

Industry: ${industry || 'General'}

Rules:
- Be concrete, not vague
- Mention specific technologies only if clearly appropriate (e.g., OCR, automation, AI document processing)
- Focus on outcomes, not features
- If Level 3, mention that Nymbl's engineering team would build this

Return only the approach description, nothing else.`,

    /**
     * ROI Estimation Prompt
     * Estimates hours/people when unknown
     */
    roiEstimation: (problemClean, industry, companySize) => `You are helping estimate time spent on a business process.

Based on this problem description, estimate:
1. Hours per week typically spent on this task
2. Number of people typically involved

Problem: ${problemClean}

Industry: ${industry || 'General'}

Company Size: ${companySize || 'Unknown'}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "hours_per_week": 20,
  "people_involved": 3,
  "reasoning": "Brief explanation of estimate"
}

Be conservative. It's better to underestimate than overestimate.`,

    /**
     * Generate Brief Title
     * Creates a concise title from the problem
     */
    generateTitle: (problemClean) => `Based on this problem description, generate a short, professional title for a solution brief (3-5 words max).

Problem: ${problemClean}

Return only the title, nothing else. Do not use quotes.`
};

// Make prompts globally available
window.AI_PROMPTS = AI_PROMPTS;

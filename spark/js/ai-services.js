// ==========================================================================
// AI Services for Spark
// Uses OpenAI API for processing
// ==========================================================================

class SparkAI {
    constructor() {
        this.demoMode = false;
    }

    /**
     * Check if API key is configured
     */
    isConfigured() {
        const { OPENAI_API_KEY } = window.SPARK_CONFIG;
        return OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY';
    }

    /**
     * Call OpenAI API
     */
    async callOpenAI(prompt) {
        if (!this.isConfigured()) {
            console.warn('OpenAI not configured. Using demo responses.');
            return null;
        }

        const { OPENAI_API_KEY, OPENAI_MODEL } = window.SPARK_CONFIG;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('OpenAI API call failed:', error);
            throw error;
        }
    }

    /**
     * Clean up problem description
     */
    async cleanupProblem(problemRaw) {
        const prompt = window.AI_PROMPTS.problemCleanup(problemRaw);
        const result = await this.callOpenAI(prompt);

        if (!result) {
            // Demo fallback
            return this.demoProblemCleanup(problemRaw);
        }

        return result;
    }

    /**
     * Classify solution level
     */
    async classifyLevel(problemClean, currentProcess, hoursPerWeek, peopleInvolved) {
        const prompt = window.AI_PROMPTS.levelClassification(
            problemClean, currentProcess, hoursPerWeek, peopleInvolved
        );
        const result = await this.callOpenAI(prompt);

        if (!result) {
            // Demo fallback
            return this.demoLevelClassification(problemClean);
        }

        try {
            return JSON.parse(result);
        } catch {
            // Try to extract JSON from response
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Failed to parse level classification response');
        }
    }

    /**
     * Generate suggested approach
     */
    async generateApproach(problemClean, solutionLevel, industry) {
        const prompt = window.AI_PROMPTS.suggestedApproach(problemClean, solutionLevel, industry);
        const result = await this.callOpenAI(prompt);

        if (!result) {
            // Demo fallback
            return this.demoApproach(solutionLevel);
        }

        return result;
    }

    /**
     * Estimate ROI when numbers unknown
     */
    async estimateROI(problemClean, industry, companySize) {
        const prompt = window.AI_PROMPTS.roiEstimation(problemClean, industry, companySize);
        const result = await this.callOpenAI(prompt);

        if (!result) {
            // Demo fallback
            return this.demoROIEstimation();
        }

        try {
            return JSON.parse(result);
        } catch {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Failed to parse ROI estimation response');
        }
    }

    /**
     * Generate brief title
     */
    async generateTitle(problemClean) {
        const prompt = window.AI_PROMPTS.generateTitle(problemClean);
        const result = await this.callOpenAI(prompt);

        if (!result) {
            // Demo fallback
            return 'Process Automation';
        }

        return result.replace(/['"]/g, '');
    }

    /**
     * Process entire brief (main workflow)
     */
    async processBrief(formData) {
        const steps = [];
        let progress = 0;

        // Step 1: Clean up problem
        steps.push({ step: 'Cleaning up problem description...', progress: 20 });
        const problemClean = await this.cleanupProblem(formData.problem_raw);
        progress = 20;

        // Step 2: Classify level
        steps.push({ step: 'Analyzing solution complexity...', progress: 40 });
        const levelData = await this.classifyLevel(
            problemClean,
            formData.current_process,
            formData.hours_per_week,
            formData.people_involved
        );
        progress = 40;

        // Step 3: Generate title
        steps.push({ step: 'Generating brief title...', progress: 60 });
        const title = await this.generateTitle(problemClean);
        progress = 60;

        // Step 4: Generate approach
        steps.push({ step: 'Creating solution approach...', progress: 80 });
        const approach = await this.generateApproach(
            problemClean,
            levelData.level,
            formData.industry
        );
        progress = 80;

        // Return processed data
        return {
            title,
            problem_clean: problemClean,
            solution_level: levelData.level,
            level_reasoning: levelData.reasoning,
            suggested_approach: approach
        };
    }

    // ==========================================================================
    // Demo Fallbacks (when API not configured)
    // ==========================================================================

    demoProblemCleanup(problemRaw) {
        // Simple cleanup - capitalize and add periods
        const sentences = problemRaw
            .replace(/[,]+/g, '.')
            .split('.')
            .filter(s => s.trim())
            .map(s => s.trim())
            .map(s => s.charAt(0).toUpperCase() + s.slice(1));

        return sentences.join('. ') + '.';
    }

    demoLevelClassification(problemClean) {
        // Simple heuristic
        const lowerProblem = problemClean.toLowerCase();

        if (lowerProblem.includes('custom') || lowerProblem.includes('build') ||
            lowerProblem.includes('integrate') || lowerProblem.includes('epic') ||
            lowerProblem.includes('api')) {
            return {
                level: 'Level 3 - Custom Development',
                reasoning: 'This problem requires custom software development or complex integrations.',
                confidence: 'Medium'
            };
        }

        if (lowerProblem.includes('automate') || lowerProblem.includes('connect') ||
            lowerProblem.includes('workflow') || lowerProblem.includes('multiple')) {
            return {
                level: 'Level 2 - Workflow Integration',
                reasoning: 'This can be solved by connecting existing tools with automation.',
                confidence: 'Medium'
            };
        }

        return {
            level: 'Level 1 - Existing Tools',
            reasoning: 'This can likely be solved with existing AI tools like ChatGPT or Claude.',
            confidence: 'Medium'
        };
    }

    demoApproach(solutionLevel) {
        if (solutionLevel.includes('Level 3')) {
            return 'We would design and build a custom solution tailored to your specific workflow requirements. Nymbl\'s engineering team has extensive experience building similar enterprise solutions.';
        }

        if (solutionLevel.includes('Level 2')) {
            return 'We would connect your existing systems with automation tools, adding AI processing where it creates the most value. This approach minimizes disruption while maximizing efficiency gains.';
        }

        return 'We would help you leverage existing AI tools you may already have access to, showing you how to use them effectively for this specific use case.';
    }

    demoROIEstimation() {
        return {
            hours_per_week: 20,
            people_involved: 3,
            reasoning: 'Conservative estimate based on typical enterprise workflows.'
        };
    }
}

// Create global instance
window.sparkAI = new SparkAI();

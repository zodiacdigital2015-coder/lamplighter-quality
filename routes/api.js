/**
 * API endpoints for Lamp Lighter: Quality Assurance Edition
 * - Handles "Strict Ofsted Mode" vs "General Quality Mode"
 * - Generates SINGLE COPILOT OUTPUT
 * - Provision-aware prompt generation
 * - ENFORCES SINGLE RESULT (Temperature 0.2)
 * - ADDS DEPTH REQUIREMENT (Cites specific evidence)
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const zod = require('zod');
const { zodResponseFormat } = require("openai/helpers/zod");

// -- API Key Setup --
let openai_api_key = "";
const apiKeyPath = path.join(__dirname, '../../data/openai_api_key.txt');

if (fs.existsSync(apiKeyPath)) {
    try {
        openai_api_key = fs.readFileSync(apiKeyPath, 'utf8').trim();
    } catch (err) {
        console.error('Cannot read OpenAI API Key file.');
    }
} else if (process.env.OPENAI_API_KEY) {
    openai_api_key = process.env.OPENAI_API_KEY;
} else {
    console.error('No API Key found. The app will likely fail to generate.');
}

// -- Initialize OpenAI Client --
const openai = new OpenAI({
    apiKey: openai_api_key,
});

const PRIMARY_MODEL = "gpt-4o";

// -- Zod Schema --
// ChatGPT prompt removed — Copilot only
const GeneratedPromptWithReason = zod.object({
    prompt_heading: zod.string(),
    copilot_prompt: zod.string(),
    reason_for_choosing: zod.string(),
});

const GeneratedPromptList = zod.object({
    prompts: zod.array(GeneratedPromptWithReason),
});

// -- Provision Context --
// Returns specific Ofsted/regulatory context based on provision type
// This ensures the generated prompt reflects the correct inspection framework
function getProvisionContext(level) {
    const contexts = {
        "Education programmes for young people (EPYP)": `
            This is Education Programmes for Young People (EPYP) provision.
            Ofsted judges this under the full EIF: Quality of Education, Behaviour and Attitudes, 
            Personal Development, and Leadership and Management.
            Key considerations: intent/implementation/impact curriculum model, 
            stretch and challenge, progress from starting points.`,

        "Adult learning programmes": `
            This is Adult Learning provision.
            Ofsted applies the EIF but with emphasis on skills for life, 
            employability outcomes, and community impact.
            Key considerations: learner motivation, distance travelled, 
            progression into employment or further learning.`,

        "Apprenticeships": `
            This is Apprenticeship provision.
            Ofsted inspects against the EIF with specific focus on 
            off-the-job training quality, employer engagement, 
            and occupational competence development.
            Key considerations: on-programme reviews, employer satisfaction, 
            end-point assessment readiness, distinction rates.`,

        "High Needs": `
            This is High Needs provision.
            Ofsted applies the EIF with additional scrutiny of 
            EHCP outcomes, independence, and preparation for adulthood.
            Key considerations: SEND Code of Practice compliance, 
            personalised curriculum, transition planning.`,

        "TLevel": `
            This is T Level provision.
            T Levels are inspected under the EIF but with specific attention to 
            industry placement quality (minimum 315 hours), employer partnerships,
            and technical qualification outcomes.
            Regulatory body: Institute for Apprenticeships and Technical Education (IfATE).
            Key considerations: placement provider quality, occupational specialism delivery,
            core component pass rates, employer satisfaction.`,

        "Cross College/All provision": `
            This covers cross-college or all-provision quality work.
            Consider all provision types in scope: EPYP, Adult Learning, 
            Apprenticeships, High Needs, and T Levels where applicable.
            Leadership and Management judgement is particularly relevant here.`,
    };

    return contexts[level] || "This is general Further Education provision. Apply standard EIF judgement criteria.";
}

/**
 * POST /api/generatePrompts
 */
router.post('/generatePrompts', async (req, res) => {
    try {
        let {
            level,
            subject,
            unit,
            learningOutcome,
            activityCategory,
            activityType,
            topic
        } = req.body;

        // -- DEFAULTS LOGIC --
        level = level || "Cross College/All provision";
        subject = subject || "Cross-College / All Departments";
        unit = unit || "General Quality Standards";
        learningOutcome = learningOutcome || "Analysis & Review";

        if (!topic || topic.trim() === "") {
            topic = "The user will provide specific evidence or documents in the next step.";
        }

        // -- PROVISION CONTEXT --
        // Get the regulatory/inspection context for this provision type
        const provisionContext = getProvisionContext(level);

        // -- MODE SELECTION --
        // High-stakes tasks use strict HMI persona with EIF terminology
        const isStrictOfstedMode = ["SAR", "QIP", "Inspection Prep", "Deep Dive"].includes(activityCategory);

        let systemInstruction = "";

        if (isStrictOfstedMode) {
            systemInstruction = `
                You are an expert HMI (His Majesty's Inspector) for Further Education.
                
                The user is performing a high-stakes quality task: ${activityCategory}.
                
                PROVISION CONTEXT:
                ${provisionContext}
                
                RULES:
                1. Use strict Education Inspection Framework (EIF) terminology appropriate 
                   to the provision type above.
                2. Be critical and evaluative — do not soften findings.
                3. Audit evidence against the relevant Grade Descriptors for this provision.
                4. Return EXACTLY ONE result object in the array.
                5. DEPTH REQUIREMENT: The generated prompt must instruct the AI to CITE 
                   SPECIFIC EXAMPLES (quotes, data points, named courses) from the user's 
                   evidence to back up every claim. General summaries are not accepted.
                6. Where the provision type has a specific regulatory body or framework 
                   (e.g. IfATE for T Levels), reference it explicitly in the prompt.
            `;
        } else {
            systemInstruction = `
                You are a helpful Quality Assurance Manager for a Further Education college.
                
                The user is performing a quality task: ${activityCategory}.
                
                PROVISION CONTEXT:
                ${provisionContext}
                
                RULES:
                1. Use professional, supportive educational language appropriate to 
                   the provision type above.
                2. Focus on clarity, evidence, and improvement.
                3. Where relevant, reference the specific quality standards or 
                   frameworks that apply to this provision type.
                4. Return EXACTLY ONE result object in the array.
            `;
        }

        // -- USER PROMPT --
        const userPrompt = `
            Generate a SINGLE structured prompt for Microsoft Copilot for the following:

            - Provision Type: ${level}
            - Curriculum Area / Department: ${subject}
            - Quality Theme / Standard: ${unit}
            - Specific Task: ${activityType}
            - Key Headline / Impact: "${learningOutcome}"
            
            EVIDENCE CONTEXT PROVIDED BY USER:
            "${topic}"

            INSTRUCTIONS FOR COPILOT PROMPT GENERATION:
            Generate a single copilot_prompt optimised for Microsoft 365 Copilot 
            (internal, secure, with access to uploaded knowledge base documents).
            
            The prompt must:
            1. Instruct Copilot to reference the attached file AND its uploaded 
               knowledge base (which contains the EIF handbook and college strategy).
            2. Demand specific citations — named examples, data points, quoted text — 
               not general observations.
            3. Be framed correctly for the provision type: ${level}.
            4. Use language and frameworks appropriate to: ${activityCategory} / ${activityType}.
            
            CONSTRAINT: Return ONLY ONE item in the array.
        `;

        // -- CALL OPENAI --
        const completion = await openai.chat.completions.create({
            model: PRIMARY_MODEL,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: userPrompt }
            ],
            response_format: zodResponseFormat(GeneratedPromptList, "generated_prompt_list"),
            temperature: 0.2,
        });

        // -- SEND RESULT --
        const result = JSON.parse(completion.choices[0].message.content);
        res.json(result);

    } catch (error) {
        console.error("OpenAI Error:", error);
        res.status(500).json({
            error: "Failed to generate prompt. Check server logs."
        });
    }
});

module.exports = router;
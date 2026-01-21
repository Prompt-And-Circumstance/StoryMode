/**
 * Prompt Templates Module
 *
 * Manages LLM prompt templates for blueprint generation and scene management.
 * Loads templates from external files and performs variable substitution.
 *
 * Security Features:
 * - Path whitelist validation for template loading
 * - Regex injection prevention in block extraction
 * - Prompt injection detection for custom prompts
 * - User data sanitization for template variables
 *
 * @module prompt-templates
 * @version 1.1.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { extension_settings } from '/scripts/extensions.js';

// Get the base URL of this extension for loading template files
// Path: lib/generation/templates.js -> ../../prompts/ -> prompts/
const PROMPTS_BASE_URL = new URL('../../prompts/', import.meta.url).href;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Summary style options */
export const SummaryStyle = {
    NARRATIVE: 'narrative',
    BULLET: 'bullet',
    BOTH: 'both',
};

/** Metaphor level options */
export const MetaphorLevel = {
    LITERAL: 'literal',
    GROUNDED: 'grounded',
    MIXED: 'mixed',
    SYMBOLIC: 'symbolic',
};

/**
 * Whitelist of valid template paths (P2: Path Traversal Mitigation)
 * Prevents directory traversal attacks via templatePath parameter
 */
const VALID_TEMPLATE_PATHS = new Set([
    'blueprint-generation/master-prompt.txt',
    'blueprint-generation/metaphor-instructions.txt',
    'scene-management/scene-summary.txt',
    'scene-management/summary-requirements.txt',
    'scene-management/opening-message.txt',
    'phased-generation/foundation-prompt.txt',
    'phased-generation/characters-prompt-with-data.txt',
    'phased-generation/characters-prompt-generate.txt',
    'phased-generation/scenes-prompt.txt',
    'phased-generation/resolutions-prompt.txt',
]);

/**
 * Fields that contain user-controlled data requiring sanitization (P0: User Data Injection)
 */
const SENSITIVE_TEMPLATE_FIELDS = new Set([
    'USER_SCENARIO',
    'CHARACTER_DATA',
    'PERSONA_DATA',
    'CORE_PREMISE',
    'CONTEXT',
    'MESSAGES',
]);

/**
 * Prompt injection patterns to detect (P0: Custom Prompt Injection)
 * Matches specific prompt injection attempts, not common English words
 *
 * Note: These patterns are designed to catch actual injection attempts while
 * minimizing false positives on legitimate user content. Patterns are context-specific
 * rather than single-word matches.
 */
const PROMPT_INJECTION_PATTERNS = [
    // Multi-word instruction override patterns (high confidence)
    /ignore\s+(all\s+)?(previous|above|earlier|the)\s+instructions/gi,
    /instead(\s+of)?(\s+(the|those|these|all|any))?\s+(above|previous|given|earlier)\s+instructions/gi,
    /override\s+(the\s+)?(previous|above|given|system)\s+instructions/gi,
    /forget\s+(the\s+)?(previous|above|all|earlier)\s+instructions/gi,
    /disregard\s+(the\s+)?(above|previous|all\s+)instructions/gi,
    // Boundary markers that suggest injection attempts
    /===\s*END/gi,
    /===\s*IGNORE/gi,
    /===\s*STOP/gi,
    /###\s*NEW\s+INSTRUCTIONS/gi,
    /###\s*OVERRIDE/gi,
    /<<<\s*FORGET/gi,
    /<<<\s*DISREGARD/gi,
    /\[SYSTEM\s*:\s*IGNORE\]/gi,
    /\[SYSTEM\s*:\s*OVERRIDE\]/gi,
    // Attempt to switch to system/developer mode
    /switch\s+to\s+(system|developer|admin)\s+mode/gi,
    /\<\|?\|?system\|?\|?\>/gi,
    // Output manipulation attempts
    /output\s+(only|just|nothing\s+but|exactly)\s+(the\s+)?(json|response)/gi,
    /print\s+(nothing\s+else|only\s+the)/gi,
];

// ============================================================================
// TEMPLATE CACHE
// ============================================================================

/** Cache for loaded templates */
const templateCache = new Map();

// ============================================================================
// SECURITY FUNCTIONS
// ============================================================================

/**
 * Escape special regex characters to prevent ReDoS attacks (P1: Regex Injection)
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegexString(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize custom prompt for prompt injection attempts (P0: Custom Prompt Injection)
 * @param {string} prompt - Custom prompt to validate
 * @returns {{safe: boolean, prompt: string|null, warnings: string[]}}
 */
function sanitizeCustomPrompt(prompt) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        return { safe: false, prompt: null, warnings: ['Empty or invalid prompt'] };
    }

    const warnings = [];
    let sanitizedPrompt = prompt;

    // Check for prompt injection patterns
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
        const matches = sanitizedPrompt.match(pattern);
        if (matches) {
            warnings.push(`Detected suspicious pattern: ${matches[0]}`);
        }
    }

    // Check for excessively long prompts (potential DoS)
    if (sanitizedPrompt.length > 50000) {
        warnings.push(`Prompt excessively long (${sanitizedPrompt.length} chars), truncating to 50000`);
        sanitizedPrompt = sanitizedPrompt.substring(0, 50000) + '... [truncated]';
    }

    // If injection patterns found, block the prompt
    if (warnings.some(w => w.startsWith('Detected suspicious pattern'))) {
        console.warn('[PromptTemplates] Blocked potentially malicious custom prompt:', warnings);
        return { safe: false, prompt: null, warnings };
    }

    if (warnings.length > 0) {
        console.warn('[PromptTemplates] Custom prompt warnings:', warnings);
    }

    return { safe: true, prompt: sanitizedPrompt, warnings };
}

/**
 * Sanitize template value based on field sensitivity (P0: User Data Injection)
 * @param {*} value - Value to sanitize
 * @param {string} key - Template variable name
 * @returns {string} Sanitized string value
 */
function sanitizeTemplateValue(value, key) {
    const str = String(value ?? '');

    // Apply stricter validation to sensitive fields
    if (SENSITIVE_TEMPLATE_FIELDS.has(key)) {
        // Truncate extremely long values
        if (str.length > 10000) {
            console.warn(`[PromptTemplates] Truncated excessively long value for ${key} (${str.length} chars)`);
            return str.substring(0, 10000) + '... [truncated]';
        }

        // Check for prompt injection patterns in user data
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
            if (pattern.test(str)) {
                const match = str.match(pattern);
                console.warn(`[PromptTemplates] Suspicious pattern detected in ${key}: ${match ? match[0] : 'unknown'}`);
                // Add warning comment to prompt but don't block (data may be legitimate)
                return `/* WARNING: Potential prompt injection detected in ${key} */\n${str}`;
            }
        }
    }

    return str;
}

// ============================================================================
// TEMPLATE LOADING
// ============================================================================

/**
 * Load a template from file with path validation (P2: Path Traversal Mitigation)
 * @param {string} templatePath - Path relative to prompts/ directory
 * @returns {Promise<string>} Template content
 * @throws {Error} If path is not in whitelist or loading fails
 */
export async function loadTemplate(templatePath) {
    // P2: Validate path against whitelist
    if (!VALID_TEMPLATE_PATHS.has(templatePath)) {
        throw new Error(`Invalid template path: ${templatePath}. Path must be one of: ${Array.from(VALID_TEMPLATE_PATHS).join(', ')}`);
    }

    // Check cache first
    if (templateCache.has(templatePath)) {
        return templateCache.get(templatePath);
    }

    const url = `${PROMPTS_BASE_URL}${templatePath}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${response.status} ${response.statusText}`);
        }

        const template = await response.text();

        // Cache the template
        templateCache.set(templatePath, template);

        return template;
    } catch (error) {
        console.error(`[PromptTemplates] Error loading template ${templatePath}:`, error);
        throw error;
    }
}

/**
 * Load the default master prompt template
 * Falls back to blueprint-master-prompt.txt in data/ directory
 * @returns {Promise<string>} Master prompt template
 */
export async function loadMasterPrompt() {
    // First try to load from extension settings (custom master prompt)
    const customPrompt = extension_settings.story_mode?.blueprintSettings?.masterPrompt;
    if (customPrompt) {
        // P0: Sanitize custom prompt for injection attempts
        const result = sanitizeCustomPrompt(customPrompt);
        if (!result.safe) {
            console.error('[PromptTemplates] Custom master prompt blocked due to security concerns:', result.warnings);
            // Fall back to default template instead of using unsafe custom prompt
        } else {
            return result.prompt;
        }
    }

    // Try to load from prompts directory
    try {
        return await loadTemplate('blueprint-generation/master-prompt.txt');
    } catch {
        // Fall back to the data directory (original location)
        const dataUrl = new URL('../../data/blueprint-master-prompt.txt', import.meta.url).href;
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error(`Failed to load master prompt: ${response.status}`);
        }
        return await response.text();
    }
}

/**
 * Clear the template cache (useful for testing or forcing reload)
 */
export function clearTemplateCache() {
    templateCache.clear();
}

// ============================================================================
// TEMPLATE RENDERING
// ============================================================================

/**
 * Replace variables in a template string with sanitization (P0: User Data Injection)
 * Supports {{VARIABLE}} syntax
 * @param {string} template - Template string
 * @param {Object} variables - Variables to replace
 * @returns {string} Rendered template
 */
export function renderTemplate(template, variables = {}) {
    let result = template;

    // Replace simple variables with sanitization
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        // P0: Sanitize value before substitution
        const sanitizedValue = sanitizeTemplateValue(value, key);
        while (result.includes(placeholder)) {
            result = result.replace(placeholder, sanitizedValue);
        }
    }

    return result;
}

/**
 * Extract a named block from a template with regex injection prevention (P1: Regex Injection)
 * Blocks are marked with <!-- @@NAME: value@@ --> ... <!-- @@END@@ -->
 * @param {string} template - Template content
 * @param {string} blockName - Name of the block (e.g., 'STYLE', 'LEVEL')
 * @param {string} blockValue - Value to match (e.g., 'narrative', 'literal')
 * @returns {string} Extracted block content
 */
export function extractBlock(template, blockName, blockValue) {
    // P1: Escape special regex characters to prevent ReDoS
    const escapedName = escapeRegexString(blockName);
    const escapedValue = escapeRegexString(blockValue);

    const regex = new RegExp(
        `<!-- @@${escapedName}:\\s*${escapedValue}\\s*@@ -->([\\s\\S]*?)<!-- @@END@@ -->`,
        'gi'
    );

    const match = template.match(regex);
    if (match) {
        // Remove the block markers and return content
        return match[0].replace(/<!-- @@.*?@@ -->/g, '').trim();
    }

    return '';
}

/**
 * Render a template with conditional blocks
 * Supports @@IF: variable@@ ... @@END_IF@@ syntax
 * @param {string} template - Template string
 * @param {Object} variables - Variables for substitution and conditionals
 * @returns {string} Rendered template
 */
export function renderTemplateWithConditionals(template, variables = {}) {
    let result = template;

    // Handle conditionals first
    result = result.replace(/@@IF:\s*(\w+)@@([\s\S]*?)@@END_IF@@/g, (match, key, content) => {
        return variables[key] ? content : '';
    });

    // Then handle simple variable substitution
    result = renderTemplate(result, variables);

    return result;
}

// ============================================================================
// SCENE MANAGEMENT TEMPLATES
// ============================================================================

/**
 * Get the effective scene summary prompt template
 * Checks for custom template in settings, falls back to default
 * @returns {Promise<string>} Scene summary prompt template
 */
export async function getSceneSummaryTemplate() {
    const customTemplate = extension_settings.story_mode?.blueprintSettings?.sceneSummaryPrompt;
    if (customTemplate) {
        // P0: Sanitize custom template
        const result = sanitizeCustomPrompt(customTemplate);
        if (result.safe) {
            return result.prompt;
        }
        console.warn('[PromptTemplates] Custom scene summary template blocked, using default');
    }

    return await loadTemplate('scene-management/scene-summary.txt');
}

/**
 * Get summary requirements for a specific style
 * @param {string} style - Summary style (narrative, bullet, both)
 * @returns {Promise<string>} Requirements text
 */
export async function getSummaryRequirements(style = SummaryStyle.NARRATIVE) {
    const template = await loadTemplate('scene-management/summary-requirements.txt');
    return extractBlock(template, 'STYLE', style);
}

/**
 * Get the opening message generation template
 * @returns {Promise<string>} Opening message prompt template
 */
export async function getOpeningMessageTemplate() {
    return await loadTemplate('scene-management/opening-message.txt');
}

// ============================================================================
// BLUEPRINT GENERATION TEMPLATES
// ============================================================================

/**
 * Get metaphor instructions for a specific level
 * @param {string} level - Metaphor level (literal, grounded, mixed, symbolic)
 * @returns {Promise<string>} Metaphor instructions text
 */
export async function getMetaphorInstructions(level = MetaphorLevel.MIXED) {
    const template = await loadTemplate('blueprint-generation/metaphor-instructions.txt');
    return extractBlock(template, 'LEVEL', level);
}

/**
 * Build a scene summary prompt with context
 * @param {Object} options - Build options
 * @param {string} options.context - Story context (premise, scene, phase)
 * @param {string} options.messages - Scene messages to summarize
 * @param {string} options.style - Summary style (narrative, bullet, both)
 * @returns {Promise<string>} Complete summarization prompt
 */
export async function buildSceneSummaryPrompt({ context, messages, style = SummaryStyle.NARRATIVE }) {
    const template = await getSceneSummaryTemplate();
    const requirements = await getSummaryRequirements(style);

    return renderTemplate(template, {
        CONTEXT: context,
        MESSAGES: messages,
        REQUIREMENTS: requirements,
    });
}

/**
 * Build an opening message generation prompt
 * @param {Object} options - Build options
 * @param {string} options.corePremise - Story core premise
 * @param {string} options.location - Scene location
 * @param {string} options.timePeriod - Time period
 * @param {string} options.atmosphere - Scene atmosphere
 * @param {Object} options.antagonist - Antagonistic forces object
 * @param {Object} options.arcStructure - Arc structure object
 * @param {Object} options.toneAndStyle - Tone and style object
 * @param {Object} options.protagonistGroup - Protagonist group object
 * @param {Array} options.characters - Character arcs array
 * @param {string} options.sceneTitle - Scene 1 title
 * @param {string} options.scenePhase - Scene 1 phase
 * @param {string} options.scenePurpose - Scene 1 purpose
 * @param {string} options.sceneSituation - Scene 1 situation
 * @returns {Promise<string>} Complete opening message prompt
 */
export async function buildOpeningMessagePrompt({
    corePremise,
    location,
    timePeriod,
    atmosphere,
    antagonist,
    arcStructure,
    toneAndStyle,
    protagonistGroup,
    characters,
    sceneTitle,
    scenePhase,
    scenePurpose,
    sceneSituation,
}) {
    const template = await getOpeningMessageTemplate();

    // Build character arcs summary
    const characterArcsSummary = characters?.map(c => {
        let text = `**${c.character_name}:** ${c.initial_state}`;
        if (c.emotional_trajectory) {
            text += `\n*Emotional Journey:* ${c.emotional_trajectory}`;
        }
        return text;
    }).join('\n\n') || 'No character arcs defined yet.';

    return renderTemplate(template, {
        CORE_PREMISE: corePremise,
        LOCATION: location,
        TIME_PERIOD: timePeriod,
        ATMOSPHERE: atmosphere,
        ANTAGONIST_DESCRIPTION: antagonist?.description || 'Unknown antagonistic forces',
        ANTAGONIST_NATURE: antagonist?.nature || 'Unknown',
        ANTAGONIST_MOTIVATION: antagonist?.motivation || 'Unknown',
        ARC_OPENING: arcStructure?.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure?.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure?.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure?.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle?.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle?.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle?.pacing || 'Unknown',
        PROTAGONIST_GROUP_DESCRIPTION: protagonistGroup?.description || 'The protagonists',
        PROTAGONIST_GROUP_SHARED_GOAL: protagonistGroup?.shared_goal || 'To complete their journey',
        PROTAGONIST_GROUP_DYNAMIC: protagonistGroup?.group_dynamic || 'Working together',
        CHARACTER_ARCS_SUMMARY: characterArcsSummary,
        SCENE_TITLE: sceneTitle,
        SCENE_PHASE: scenePhase,
        SCENE_PURPOSE: scenePurpose,
        SCENE_SITUATION: sceneSituation,
    });
}

// ============================================================================
// PHASED GENERATION TEMPLATES
// ============================================================================

/**
 * Get the foundation phase prompt template for phased blueprint generation
 * @returns {Promise<string>} Foundation prompt template
 */
export async function getFoundationPromptTemplate() {
    return await loadTemplate('phased-generation/foundation-prompt.txt');
}

/**
 * Build the Foundation phase prompt with all context variables
 * Follows the same pattern as buildMasterPrompt() for consistency
 * @param {Object} options - Build options
 * @param {string} options.storyTypeName - Story type name
 * @param {Object} options.storyTypeJson - Full story type object as JSON
 * @param {string} options.authorStyleSection - Complete author style section
 * @param {string} options.characterData - Character data string
 * @param {string} options.personaSection - Persona data section
 * @param {string} options.userScenario - User's scenario description
 * @param {string} options.metaphorLevel - Metaphor level setting
 * @param {string} options.metaphorInstructions - Metaphor instructions text
 * @param {number} options.totalMessagesTarget - Target message count
 * @param {string} options.expectedSceneCount - Expected scene count
 * @returns {Promise<string>} Complete foundation phase prompt
 */
export async function buildFoundationPrompt({
    storyTypeName,
    storyTypeJson,
    authorStyleSection,
    characterData,
    personaSection,
    userScenario,
    metaphorLevel,
    metaphorInstructions,
    totalMessagesTarget,
    expectedSceneCount,
}) {
    const template = await getFoundationPromptTemplate();

    return renderTemplate(template, {
        STORY_TYPE_NAME: storyTypeName,
        STORY_TYPE_JSON: storyTypeJson,
        AUTHOR_STYLE_SECTION: authorStyleSection,
        CHARACTER_DATA: characterData,
        PERSONA_SECTION: personaSection,
        USER_SCENARIO: userScenario,
        METAPHOR_LEVEL: metaphorLevel,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        TOTAL_MESSAGES_TARGET: totalMessagesTarget,
        EXPECTED_SCENE_COUNT: expectedSceneCount,
    });
}

// ============================================================================
// PHASED GENERATION TEMPLATES (Phases 2-5)
// ============================================================================

/**
 * Get the characters phase prompt template (with provided character data)
 * @returns {Promise<string>} Characters phase prompt template
 */
export async function getCharactersPromptWithDataTemplate() {
    return await loadTemplate('phased-generation/characters-prompt-with-data.txt');
}

/**
 * Get the characters phase prompt template (generate new characters)
 * @returns {Promise<string>} Characters phase prompt template
 */
export async function getCharactersPromptGenerateTemplate() {
    return await loadTemplate('phased-generation/characters-prompt-generate.txt');
}

/**
 * Build the Characters phase prompt with provided character data
 * Use this when user has supplied character information
 * @param {Object} options - Build options
 * @param {string} options.storyTypeName - Story type name
 * @param {string} options.storyTypeJson - Full story type object as JSON
 * @param {string} options.foundation - Core premise from Phase 1
 * @param {Object} options.setting - Setting object from Phase 1
 * @param {Object} options.antagonist - Antagonistic forces from Phase 1
 * @param {Object} options.arcStructure - Arc structure from Phase 1
 * @param {Object} options.toneAndStyle - Tone and style from Phase 1
 * @param {string} options.characterData - Character data string (provided characters)
 * @param {string} options.personaSection - Persona data section
 * @param {string} options.authorStyleSection - Author style section
 * @param {string} options.userScenario - User's scenario description
 * @param {string} options.metaphorLevel - Metaphor level setting
 * @param {string} options.metaphorInstructions - Metaphor instructions text
 * @param {number} options.totalMessagesTarget - Target message count
 * @param {string} options.expectedSceneCount - Expected scene count
 * @returns {Promise<string>} Complete characters phase prompt
 */
export async function buildCharactersPromptWithData({
    storyTypeName,
    storyTypeJson,
    foundation,
    setting,
    antagonist,
    arcStructure,
    toneAndStyle,
    characterData,
    personaSection,
    authorStyleSection,
    userScenario,
    metaphorLevel,
    metaphorInstructions,
    totalMessagesTarget,
    expectedSceneCount,
}) {
    const template = await getCharactersPromptWithDataTemplate();

    return renderTemplate(template, {
        STORY_TYPE_NAME: storyTypeName,
        STORY_TYPE_JSON: storyTypeJson,
        FOUNDATION: foundation,
        SETTING_LOCATION: setting?.location || 'Unknown',
        SETTING_TIME: setting?.time_period || 'Unknown time',
        SETTING_ATMOSPHERE: setting?.atmosphere || 'Unknown',
        ANTAGONIST_DESCRIPTION: antagonist?.description || 'Unknown',
        ANTAGONIST_NATURE: antagonist?.nature || 'Unknown',
        ANTAGONIST_MOTIVATION: antagonist?.motivation || 'Unknown',
        ARC_OPENING: arcStructure?.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure?.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure?.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure?.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle?.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle?.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle?.pacing || 'Unknown',
        TONE_STYLISTIC_ELEMENTS: toneAndStyle?.key_stylistic_elements?.join(', ') || 'None specified',
        CHARACTER_DATA: characterData || 'No character data provided.',
        PERSONA_SECTION: personaSection || '',
        AUTHOR_STYLE_SECTION: authorStyleSection || 'No author style specified.',
        USER_SCENARIO: userScenario || 'No specific scenario provided.',
        METAPHOR_LEVEL: metaphorLevel,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        TOTAL_MESSAGES_TARGET: totalMessagesTarget,
        EXPECTED_SCENE_COUNT: expectedSceneCount,
    });
}

/**
 * Build the Characters phase prompt to generate new characters
 * Use this when no character data has been provided
 * @param {Object} options - Build options (same as buildCharactersPromptWithData except characterData)
 * @returns {Promise<string>} Complete characters phase prompt
 */
export async function buildCharactersPromptGenerate({
    storyTypeName,
    storyTypeJson,
    foundation,
    setting,
    antagonist,
    arcStructure,
    toneAndStyle,
    personaSection,
    authorStyleSection,
    userScenario,
    metaphorLevel,
    metaphorInstructions,
    totalMessagesTarget,
    expectedSceneCount,
}) {
    const template = await getCharactersPromptGenerateTemplate();

    return renderTemplate(template, {
        STORY_TYPE_NAME: storyTypeName,
        STORY_TYPE_JSON: storyTypeJson,
        FOUNDATION: foundation,
        SETTING_LOCATION: setting?.location || 'Unknown',
        SETTING_TIME: setting?.time_period || 'Unknown time',
        SETTING_ATMOSPHERE: setting?.atmosphere || 'Unknown',
        ANTAGONIST_DESCRIPTION: antagonist?.description || 'Unknown',
        ANTAGONIST_NATURE: antagonist?.nature || 'Unknown',
        ANTAGONIST_MOTIVATION: antagonist?.motivation || 'Unknown',
        ARC_OPENING: arcStructure?.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure?.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure?.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure?.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle?.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle?.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle?.pacing || 'Unknown',
        TONE_STYLISTIC_ELEMENTS: toneAndStyle?.key_stylistic_elements?.join(', ') || 'None specified',
        PERSONA_SECTION: personaSection || '',
        AUTHOR_STYLE_SECTION: authorStyleSection || 'No author style specified.',
        USER_SCENARIO: userScenario || 'No specific scenario provided.',
        METAPHOR_LEVEL: metaphorLevel,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        TOTAL_MESSAGES_TARGET: totalMessagesTarget,
        EXPECTED_SCENE_COUNT: expectedSceneCount,
    });
}

/**
 * Get the scenes phase prompt template
 * @returns {Promise<string>} Scenes phase prompt template
 */
export async function getScenesPromptTemplate() {
    return await loadTemplate('phased-generation/scenes-prompt.txt');
}

/**
 * Build the Scenes phase prompt with context
 * @param {Object} options - Build options
 * @param {string} options.storyTypeName - Story type name
 * @param {string} options.storyTypeJson - Full story type object as JSON
 * @param {string} options.foundation - Core premise from Phase 1
 * @param {Object} options.setting - Setting object from Phase 1
 * @param {Object} options.antagonist - Antagonistic forces from Phase 1
 * @param {Object} options.arcStructure - Arc structure from Phase 1
 * @param {Object} options.toneAndStyle - Tone and style from Phase 1
 * @param {Object} options.protagonistGroup - Protagonist group from Phase 2
 * @param {Array} options.characters - Character arcs from Phase 2
 * @param {string} options.personaSection - Persona data section
 * @param {string} options.authorStyleSection - Author style section
 * @param {string} options.userScenario - User's scenario description
 * @param {string} options.metaphorLevel - Metaphor level setting
 * @param {string} options.metaphorInstructions - Metaphor instructions text
 * @param {number} options.totalMessagesTarget - Target message count
 * @param {string} options.expectedSceneCount - Expected scene count
 * @param {Object} options.memorableElement - Story type's memorable element (type, name, description, placement, setup_hooks)
 * @returns {Promise<string>} Complete scenes phase prompt
 */
export async function buildScenesPrompt({
    storyTypeName,
    storyTypeJson,
    foundation,
    setting,
    antagonist,
    arcStructure,
    toneAndStyle,
    protagonistGroup,
    characters,
    personaSection,
    authorStyleSection,
    userScenario,
    metaphorLevel,
    metaphorInstructions,
    totalMessagesTarget,
    expectedSceneCount,
    memorableElement,
}) {
    const template = await getScenesPromptTemplate();

    // Build character arcs summary
    const characterArcsSummary = characters?.map(c => {
        let text = `**${c.character_name}:** ${c.initial_state}`;
        if (c.key_turning_points && c.key_turning_points.length > 0) {
            text += `\n*Key Turning Points:* ${c.key_turning_points.join(', ')}`;
        }
        if (c.final_state) {
            text += `\n*Final State:* ${c.final_state}`;
        }
        if (c.emotional_trajectory) {
            text += `\n*Emotional Journey:* ${c.emotional_trajectory}`;
        }
        return text;
    }).join('\n\n') || 'No character arcs defined yet.';

    // Format memorable element setup hooks as a bulleted list
    const setupHooksList = memorableElement?.setup_hooks?.map(hook => `- ${hook}`).join('\n') || '- No specific setup hooks defined';

    return renderTemplate(template, {
        STORY_TYPE_JSON: storyTypeJson,
        FOUNDATION: foundation,
        SETTING_LOCATION: setting?.location || 'Unknown',
        SETTING_TIME: setting?.time_period || 'Unknown time',
        SETTING_ATMOSPHERE: setting?.atmosphere || 'Unknown',
        ANTAGONIST_DESCRIPTION: antagonist?.description || 'Unknown',
        ANTAGONIST_NATURE: antagonist?.nature || 'Unknown',
        ANTAGONIST_MOTIVATION: antagonist?.motivation || 'Unknown',
        ARC_OPENING: arcStructure?.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure?.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure?.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure?.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle?.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle?.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle?.pacing || 'Unknown',
        TONE_STYLISTIC_ELEMENTS: toneAndStyle?.key_stylistic_elements?.join(', ') || 'None specified',
        PROTAGONIST_GROUP_DESCRIPTION: protagonistGroup?.description || 'Unknown',
        PROTAGONIST_GROUP_SHARED_GOAL: protagonistGroup?.shared_goal || 'Unknown',
        PROTAGONIST_GROUP_DYNAMIC: protagonistGroup?.group_dynamic || 'Unknown',
        CHARACTER_ARCS_SUMMARY: characterArcsSummary,
        PERSONA_SECTION: personaSection || '',
        AUTHOR_STYLE_SECTION: authorStyleSection || 'No author style specified.',
        USER_SCENARIO: userScenario || 'No specific scenario provided.',
        METAPHOR_LEVEL: metaphorLevel,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        TOTAL_MESSAGES_TARGET: totalMessagesTarget,
        EXPECTED_SCENE_COUNT: expectedSceneCount,
        MEMORABLE_ELEMENT_TYPE: memorableElement?.type || 'signature_moment',
        MEMORABLE_ELEMENT_NAME: memorableElement?.name || 'The Defining Moment',
        MEMORABLE_ELEMENT_DESCRIPTION: memorableElement?.description || 'A pivotal scene that crystallizes the story\'s themes and character arcs',
        MEMORABLE_ELEMENT_PLACEMENT: memorableElement?.placement || 'resolution',
        MEMORABLE_ELEMENT_SETUP_HOOKS: setupHooksList,
    });
}

/**
 * Get the resolutions phase prompt template
 * @returns {Promise<string>} Resolutions phase prompt template
 */
export async function getResolutionsPromptTemplate() {
    return await loadTemplate('phased-generation/resolutions-prompt.txt');
}

/**
 * Build the Resolutions phase prompt with context
 * @param {Object} options - Build options
 * @param {string} options.storyTypeName - Story type name
 * @param {string} options.storyTypeJson - Full story type object as JSON
 * @param {string} options.foundation - Core premise from Phase 1
 * @param {Object} options.setting - Setting object from Phase 1
 * @param {Object} options.antagonist - Antagonistic forces from Phase 1
 * @param {Object} options.arcStructure - Arc structure from Phase 1
 * @param {Object} options.toneAndStyle - Tone and style from Phase 1
 * @param {Object} options.protagonistGroup - Protagonist group from Phase 2
 * @param {Array} options.characters - Character arcs from Phase 2
 * @param {string} options.personaSection - Persona data section
 * @param {string} options.authorStyleSection - Author style section
 * @param {string} options.userScenario - User's scenario description
 * @param {string} options.metaphorLevel - Metaphor level setting
 * @param {string} options.metaphorInstructions - Metaphor instructions text
 * @param {number} options.sceneCount - Number of scenes from Phase 3
 * @returns {Promise<string>} Complete resolutions phase prompt
 */
export async function buildResolutionsPrompt({
    storyTypeName,
    storyTypeJson,
    foundation,
    setting,
    antagonist,
    arcStructure,
    toneAndStyle,
    protagonistGroup,
    characters,
    personaSection,
    authorStyleSection,
    userScenario,
    metaphorLevel,
    metaphorInstructions,
    sceneCount,
    scenes,
}) {
    const template = await getResolutionsPromptTemplate();

    // Build character arcs summary
    const characterArcsSummary = characters?.map(c => {
        let text = `**${c.character_name}:** ${c.initial_state}`;
        if (c.emotional_trajectory) {
            text += `\n*Emotional journey:* ${c.emotional_trajectory}`;
        }
        return text;
    }).join('\n\n') || 'No character arcs defined yet.';

    // Build scene plan summary
    const scenePlanSummary = scenes?.map((s, idx) => {
        const events = s.key_events_if_unchallenged || s.key_events_if_unchanged || [];
        return `Scene ${idx + 1}: ${s.title} (${s.phase})
Situation: ${s.situation}
Key Events: ${events.join(', ')}`;
    }).join('\n\n') || 'No scenes defined.';

    return renderTemplate(template, {
        STORY_TYPE_JSON: storyTypeJson,
        FOUNDATION: foundation,
        SETTING_LOCATION: setting?.location || 'Unknown',
        SETTING_TIME: setting?.time_period || 'Unknown time',
        SETTING_ATMOSPHERE: setting?.atmosphere || 'Unknown',
        ANTAGONIST_DESCRIPTION: antagonist?.description || 'Unknown',
        ANTAGONIST_NATURE: antagonist?.nature || 'Unknown',
        ARC_OPENING: arcStructure?.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure?.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure?.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure?.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle?.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle?.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle?.pacing || 'Unknown',
        PROTAGONIST_GROUP_DESCRIPTION: protagonistGroup?.description || 'Unknown',
        PROTAGONIST_GROUP_SHARED_GOAL: protagonistGroup?.shared_goal || 'Unknown',
        PROTAGONIST_GROUP_DYNAMIC: protagonistGroup?.group_dynamic || 'Unknown',
        CHARACTER_ARCS_SUMMARY: characterArcsSummary,
        PERSONA_SECTION: personaSection || '',
        AUTHOR_STYLE_SECTION: authorStyleSection || 'No author style specified.',
        USER_SCENARIO: userScenario || 'No specific scenario provided.',
        METAPHOR_LEVEL: metaphorLevel,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        SCENE_COUNT: sceneCount || 0,
        SCENE_PLAN_SUMMARY: scenePlanSummary,
    });
}

/**
 * Get the validation phase prompt template
 * @returns {Promise<string>} Validation phase prompt template
 */
export async function getValidationPromptTemplate() {
    return await loadTemplate('phased-generation/validation-prompt.txt');
}

/**
 * Build the Validation phase prompt with context
 * @param {Object} options - Build options
 * @param {string} options.storyTypeName - Story type name
 * @param {string} options.storyTypeJson - Story type JSON
 * @param {Object} options.partialBlueprint - Complete blueprint from Phases 1-4
 * @param {string} options.authorStyleSection - Author style guidance section
 * @returns {Promise<string>} Complete validation phase prompt
 */
export async function buildValidationPrompt({
    storyTypeName,
    storyTypeJson,
    partialBlueprint,
    authorStyleSection,
}) {
    const template = await getValidationPromptTemplate();

    // Serialize the full blueprint for inspection
    const blueprintJson = JSON.stringify(partialBlueprint, null, 2);

    return renderTemplate(template, {
        STORY_TYPE_JSON: storyTypeJson,
        BLUEPRINT_JSON: blueprintJson,
        AUTHOR_STYLE_SECTION: authorStyleSection || 'No author style specified.',
    });
}

// ============================================================================
// PUBLIC API SUMMARY
// ============================================================================

/**
 * Prompt Templates Module Public API
 *
 * Template Loading:
 * - loadTemplate(templatePath) -> Promise<string>
 * - loadMasterPrompt() -> Promise<string>
 * - clearTemplateCache() -> void
 *
 * Template Rendering:
 * - renderTemplate(template, variables) -> string
 * - renderTemplateWithConditionals(template, variables) -> string
 * - extractBlock(template, blockName, blockValue) -> string
 *
 * Scene Management:
 * - getSceneSummaryTemplate() -> Promise<string>
 * - getSummaryRequirements(style) -> Promise<string>
 * - getOpeningMessageTemplate() -> Promise<string>
 * - buildSceneSummaryPrompt(options) -> Promise<string>
 * - buildOpeningMessagePrompt(options) -> Promise<string>
 *
 * Blueprint Generation:
 * - getMetaphorInstructions(level) -> Promise<string>
 *
 * Phased Generation:
 * - getFoundationPromptTemplate() -> Promise<string>
 * - buildFoundationPrompt(options) -> Promise<string>
 * - getCharactersPromptTemplate() -> Promise<string>
 * - buildCharactersPrompt(options) -> Promise<string>
 * - getScenesPromptTemplate() -> Promise<string>
 * - buildScenesPrompt(options) -> Promise<string>
 * - getResolutionsPromptTemplate() -> Promise<string>
 * - buildResolutionsPrompt(options) -> Promise<string>
 * - getValidationPromptTemplate() -> Promise<string>
 * - buildValidationPrompt(options) -> Promise<string>
 *
 * Constants:
 * - SummaryStyle: { NARRATIVE, BULLET, BOTH }
 * - MetaphorLevel: { LITERAL, GROUNDED, MIXED, SYMBOLIC }
 */



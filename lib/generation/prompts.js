/**
 * @file Prompt builders for blueprint generation
 * @module generation/prompts
 *
 * Builds prompts for master generation and phased generation.
 * Handles author style, persona, character data, and metaphor instructions.
 */

import * as PromptTemplates from './templates.js';
import { power_user } from '/scripts/power-user.js';
import { METAPHOR_LEVELS } from '../core/index.js';

// Dependency injection for functions that need module-level state
let _getEffectiveMasterPrompt = null;
let _getFallbackMasterPrompt = null;

/**
 * Initialize prompt builders with dependencies from blueprint-module
 * @param {Function} getEffectiveMasterPromptFn - Function to get effective master prompt
 * @param {Function} getFallbackMasterPromptFn - Function to get fallback master prompt
 */
export function initPromptBuilders(getEffectiveMasterPromptFn, getFallbackMasterPromptFn) {
    _getEffectiveMasterPrompt = getEffectiveMasterPromptFn;
    _getFallbackMasterPrompt = getFallbackMasterPromptFn;
}

/**
 * Build the blueprint request object from UI configuration
 * @param {Object} config - Configuration from UI
 * @returns {Object} Blueprint request object
 */
export function buildBlueprintRequest(config) {
    return {
        story_type_id: config.storyTypeId,
        author_style: config.authorStyleId || undefined,
        character_data: config.characterData,
        persona_data: config.personaData || [],
        user_scenario: config.scenario || '',
        total_messages_target: config.messageTarget || 30,
        genre_interpretation: {
            metaphor_level: config.metaphorLevel || METAPHOR_LEVELS.MIXED,
        },
    };
}

/**
 * Build metaphor instructions from template
 * @param {string} metaphorLevel - Metaphor level setting
 * @returns {Promise<string>} Metaphor instructions text
 */
async function buildMetaphorInstructions(metaphorLevel) {
    return await PromptTemplates.getMetaphorInstructions(metaphorLevel);
}

/**
 * Build author style section for prompts
 * @param {Object} authorStyle - Author style object
 * @returns {string} Formatted author style section
 */
function buildAuthorStyleSection(authorStyle) {
    if (!authorStyle || !authorStyle.authorPrompt) {
        return `
### NO AUTHOR STYLE SPECIFIED

No explicit author style has been requested. Generate the blueprint using the STORY TYPE's default tone and narrative conventions. You may draw on common storytelling best practices and the emotional/thematic underpinnings of the story type itself.
`;
    }

    const styleParts = [`**User-specified author style:** ${authorStyle.name}`];

    if (authorStyle.category) {
        styleParts.push(`- **Category**: ${authorStyle.category}`);
    }

    styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);

    if (authorStyle.nsfwPrompt) {
        styleParts.push(`- **NSFW guidance**: ${authorStyle.nsfwPrompt}`);
    }

    if (authorStyle.heatLevel) {
        styleParts.push(`- **Spice level**: ${authorStyle.heatLevel}/5`);
    }

    return `
### AUTHOR STYLE GUIDANCE

${styleParts.join('\n')}

You MUST adopt this style's tone, voice, structure, and characteristic narrative devices throughout the blueprint.

ACTIVE STYLE APPLICATION:
1. Analyze the STORY TYPE JSON. Actively use its defined 'tropes', 'themes', and 'structure' to inform your scene choices. Do not simply treat it as metadata.
2. Consider *how* ${authorStyle.name} would handle these plot points. Would they focus on internal monologue? Visceral action? Social dynamics? Adjust your scene descriptions to reflect this focus.

Apply the style to:
- Descriptions of scenes, settings, and situations.
- Antagonistic forces (how they behave, what they represent).
- Character arc language and emotional beats.
- Choice points and decision descriptions.
- The 'tone_and_style' section itself.

**Note:** Style should enhance but never override the user's scenario, character data, or genre interpretation level.
`;
}

/**
 * Build persona section for prompts
 * @param {Array<Object>} personaData - Array of persona references
 * @returns {string} Formatted persona section or empty string
 */
function buildPersonaSection(personaData) {
    if (!personaData || personaData.length === 0) {
        return '';
    }

    if (typeof power_user === 'undefined' || !power_user.personas || !power_user.persona_descriptions) {
        return '';
    }

    const personaDataStr = personaData.map(personaRef => {
        const personaName = power_user.personas[personaRef.id];
        const personaDesc = power_user.persona_descriptions[personaRef.id];

        if (personaName && personaDesc) {
            let text = `**Persona: ${personaName}`;
            if (personaDesc.title) {
                text += ` (${personaDesc.title})`;
            }
            text += '**\n';
            if (personaDesc.description) {
                text += `Description: ${personaDesc.description}\n`;
            }
            return text;
        }

        return `**Persona: ${personaRef.name}**\nDescription: Persona data not available\n`;
    }).join('\n---\n');

    return `---

### PERSONA DATA

${personaDataStr}

This PERSONA_DATA includes optional user personas that define the player character's identity, personality, and behavior in this story.

**You MUST:**
- Treat personas as defining the player character's role and perspective in the story.
- Incorporate persona traits, goals, and behaviors into the protagonist_group and character_arcs.
- If a persona is provided, it represents who the player is role-playing as in this narrative.

---`;
}

/**
 * Build character data section for prompts
 * @param {Array<Object>} characterData - Array of character objects
 * @returns {string} Formatted character data section
 */
function buildCharacterDataSection(characterData) {
    if (!characterData || characterData.length === 0) {
        return 'No specific character data provided.';
    }

    return characterData.map(char => {
        let text = `**Character: ${char.name}**\n`;
        if (char.description) {
            text += `Description: ${char.description.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.personality) {
            text += `Personality: ${char.personality.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.scenario) {
            text += `Scenario: ${char.scenario.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.greeting) {
            text += `Greeting: ${char.greeting}\n`;
        }
        return text;
    }).join('\n---\n');
}

/**
 * Get expected scene count based on target rounds
 * @param {number} totalRounds - Target number of rounds
 * @returns {string} Expected scene count description
 */
export function getExpectedSceneCount(totalRounds) {
    if (totalRounds <= 12) {
        return '~5–7 scenes';
    } else if (totalRounds <= 30) {
        return '~8–12 scenes';
    } else if (totalRounds <= 60) {
        return '~12–20 scenes';
    } else if (totalRounds <= 120) {
        return '~20–30 scenes';
    } else {
        const scenesPerRound = 0.25;
        const calculatedScenes = Math.max(30, Math.round(totalRounds * scenesPerRound));
        return `~${calculatedScenes}–${calculatedScenes + 10} scenes`;
    }
}

/**
 * Build the master prompt with template variable replacement
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object (with storyPrompt, phasePrompts, etc.)
 * @param {Object} authorStyle - Author style object (optional)
 * @returns {Promise<string>} The complete master prompt
 */
export async function buildMasterPrompt(request, storyType, authorStyle) {
    let prompt = _getEffectiveMasterPrompt();

    // Build prompt sections using helper functions
    const authorStyleSection = buildAuthorStyleSection(authorStyle);
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    // Calculate expected scene count based on target rounds
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    // Replace template variables - do this in the right order!
    prompt = prompt
        // First, replace the large sections
        .replace('{{STORY_TYPE_JSON}}', JSON.stringify(storyType, null, 2))
        .replace('{{AUTHOR_STYLE_SECTION}}', authorStyleSection)
        .replace('{{METAPHOR_INSTRUCTIONS}}', metaphorInstructions)
        .replace('{{PERSONA_SECTION}}', personaSection)
        .replace('{{CHARACTER_DATA}}', characterDataStr)
        .replace('{{USER_SCENARIO}}', request.user_scenario || 'No specific scenario provided.')
        // Then replace the simple variables
        .replace('{{STORY_TYPE_ID}}', request.story_type_id)
        .replace('{{STORY_TYPE_NAME}}', storyType.name || request.story_type_id)
        .replace('{{METAPHOR_LEVEL}}', request.genre_interpretation.metaphor_level)
        .replace('{{AUTHOR_STYLE}}', authorStyle?.name || 'None')
        .replace('{{TOTAL_MESSAGES_TARGET}}', request.total_messages_target.toString())
        .replace('{{EXPECTED_SCENE_COUNT}}', expectedSceneCount);

    // Debug: Check final prompt

    return prompt;
}

/**
 * Build a phase-specific prompt for phased blueprint generation
 * Dispatcher function that routes to the appropriate phase prompt builder
 * @param {number} phase - Phase number (1-4)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @returns {Promise<string>} Phase-specific prompt
 */
export async function buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint = {}) {
    switch (phase) {
        case 1:
            return buildFoundationPrompt(request, storyType, authorStyle);
        case 2:
            return buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint);
        case 3:
            return buildScenesPrompt(request, storyType, authorStyle, partialBlueprint);
        case 4:
            return buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint);
        default:
            throw new Error(`Invalid phase: ${phase}`);
    }
}

/**
 * Build Phase 1: Foundation prompt
 */
async function buildFoundationPrompt(request, storyType, authorStyle) {
    const authorStyleSection = buildAuthorStyleSection(authorStyle);
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    return await PromptTemplates.buildFoundationPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        authorStyleSection,
        characterData: characterDataStr,
        personaSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
    });
}

/**
 * Build Phase 2: Characters prompt
 */
async function buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};

    // Build author style section
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];

        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }

        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);

        if (authorStyle.nsfwPrompt) {
            styleParts.push(`- **NSFW guidance**: ${authorStyle.nsfwPrompt}`);
        }

        if (authorStyle.heatLevel) {
            styleParts.push(`- **Spice level**: ${authorStyle.heatLevel}/5`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE

${styleParts.join('\n')}

You MUST adopt this style's tone, voice, structure, and characteristic narrative devices throughout the blueprint.

Apply the style to:
- Character descriptions and emotional arcs.
- Group dynamics and interpersonal relationships.
- Emotional trajectory descriptions.
- Character motivation and behavior.

**Note:** Style should enhance but never override the user's scenario or genre interpretation level.
`;
    } else {
        authorStyleSection = `
### NO AUTHOR STYLE SPECIFIED

No explicit author style has been requested. Generate the blueprint using the STORY TYPE's default tone and narrative conventions. You may draw on common storytelling best practices and the emotional/thematic underpinnings of the story type itself.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Build character data section
    const characterDataStr = buildCharacterDataSection(request.character_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    // Calculate expected scene count
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    // Determine which template to use based on whether character data was provided
    const hasCharacterData = request.character_data && request.character_data.length > 0;

    const builderParams = {
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
    };

    if (hasCharacterData) {
        return await PromptTemplates.buildCharactersPromptWithData({
            ...builderParams,
            characterData: characterDataStr,
        });
    } else {
        return await PromptTemplates.buildCharactersPromptGenerate(builderParams);
    }
}

/**
 * Build Phase 3: Scenes prompt
 */
async function buildScenesPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    // Build author style section
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];
        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }
        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);
        if (authorStyle.narrativeTechniques) {
            styleParts.push(`- **Narrative techniques**: ${authorStyle.narrativeTechniques}`);
        }
        if (authorStyle.dialogueStyle) {
            styleParts.push(`- **Dialogue style**: ${authorStyle.dialogueStyle}`);
        }
        if (authorStyle.pacingApproach) {
            styleParts.push(`- **Pacing**: ${authorStyle.pacingApproach}`);
        }
        if (authorStyle.thematicFocus) {
            styleParts.push(`- **Thematic focus**: ${authorStyle.thematicFocus}`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE
${styleParts.join('\n')}

Apply this author's stylistic approach to the scene generation—emulate their voice, pacing, and sentence structure. Ensure ${authorStyle.name}'s distinctive qualities are present in how scenes are structured and described.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    return await PromptTemplates.buildScenesPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
        memorableElement: storyType.memorableElement,
    });
}

/**
 * Build Phase 4: Resolutions prompt
 */
async function buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const scenes = partialBlueprint.scene_plan || [];

    // Build author style section (matching buildMasterPrompt pattern)
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];
        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }
        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);
        if (authorStyle.narrativeTechniques) {
            styleParts.push(`- **Narrative techniques**: ${authorStyle.narrativeTechniques}`);
        }
        if (authorStyle.dialogueStyle) {
            styleParts.push(`- **Dialogue style**: ${authorStyle.dialogueStyle}`);
        }
        if (authorStyle.pacingApproach) {
            styleParts.push(`- **Pacing**: ${authorStyle.pacingApproach}`);
        }
        if (authorStyle.thematicFocus) {
            styleParts.push(`- **Thematic focus**: ${authorStyle.thematicFocus}`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE
${styleParts.join('\n')}

Apply this author's stylistic approach to the resolution generation—consider how they would handle endings, themes, and character outcomes. Ensure ${authorStyle.name}'s distinctive qualities are present in how resolutions are structured.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    return await PromptTemplates.buildResolutionsPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        sceneCount: scenes.length,
        scenes: scenes,
    });
}

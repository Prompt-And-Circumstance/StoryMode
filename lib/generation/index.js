/**
 * @file Generation module public API
 * @module generation
 */

// Re-export from templates.js
export {
    SummaryStyle,
    MetaphorLevel,
    loadTemplate,
    loadMasterPrompt,
    clearTemplateCache,
    renderTemplate,
    extractBlock,
    renderTemplateWithConditionals,
    getSceneSummaryTemplate,
    getSummaryRequirements,
    getOpeningMessageTemplate,
    getMetaphorInstructions,
    buildSceneSummaryPrompt,
    buildOpeningMessagePrompt,
    getFoundationPromptTemplate,
    buildFoundationPrompt,
    getCharactersPromptWithDataTemplate,
    getCharactersPromptGenerateTemplate,
    buildCharactersPromptWithData,
    buildCharactersPromptGenerate,
    getScenesPromptTemplate,
    buildScenesPrompt,
    getResolutionsPromptTemplate,
    buildResolutionsPrompt,
    getValidationPromptTemplate,
    buildValidationPrompt,
} from './templates.js';

// Re-export from prompts.js
export {
    initPromptBuilders,
    buildBlueprintRequest,
    buildMasterPrompt,
    buildPhasePrompt,
    getExpectedSceneCount,
} from './prompts.js';

// Re-export from orchestration.js
export {
    initOrchestration,
    generateBlueprint,
    generateBlueprintPhased,
    generateWithPreset,
    generateOpeningMessage,
} from './orchestration.js';

// Re-export from style-generator.js
export {
    generateAuthorStyle,
    generateStoryType,
} from './style-generator.js';

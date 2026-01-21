/**
 * Blueprint Debug Mocks
 *
 * Provides mock LLM responses for each blueprint generation phase.
 * Useful for testing the wizard pipeline without making actual API calls.
 *
 * Usage:
 * 1. Set window.BLUEPRINT_DEBUG_MODE = true
 * 2. Run blueprint generation normally
 * 3. Mock responses will be injected at each phase
 */

// ============================================================================
// DEBUG MODE TOGGLE
// ============================================================================

/**
 * Enable/disable blueprint debug mode
 * When enabled, generateWithPreset will return mock responses for each phase
 */
export function setBlueprintDebugMode(enabled) {
    window.BLUEPRINT_DEBUG_MODE = enabled;
    console.log(`[Blueprint Debug] Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function isBlueprintDebugMode() {
    return window.BLUEPRINT_DEBUG_MODE === true;
}

// ============================================================================
// PHASE 1: FOUNDATION (core_premise, setting, protagonist_group, antagonistic_forces)
// ============================================================================

export const PHASE_1_MOCK = {
    core_premise: "A band of adventurers must retrieve a stolen artifact from a rival kingdom before a prophecy can be fulfilled, forcing them to navigate political intrigue and ancient magic.",
    setting: {
        location: "The Five Kingdoms of Aethora - spanning coastal cities, mountain passes, and mystical forests",
        time_period: "Medieval fantasy with advanced magical technology",
        atmosphere: "Epic, grand, with moments of dark mystery and wonder"
    },
    protagonist_group: {
        description: "A diverse party of adventurers: a skilled thief, a mage seeking redemption, a paladin bound by oath, and a ranger with hidden lineage",
        shared_goal: "Recover the Starstone before the Blood Moon rises to prevent catastrophic prophecy fulfillment",
        group_dynamic: "Fractured trust held together by necessity; underlying tensions about methods and morality"
    },
    antagonistic_forces: {
        description: "The Shadow Crown - a ruthless faction seeking to weaponize the artifact for conquest, led by a corrupted noble with magical ambitions",
        nature: "external",
        motivation: "They believe the prophecy serves their ultimate power, and they're willing to sacrifice entire kingdoms to test its truth",
        manifestations: [
            "Hired assassins tracking the party",
            "Political enemies spreading misinformation",
            "Magical wards protecting the artifact's location",
            "An ancient curse tied to the artifact itself"
        ]
    }
};

// ============================================================================
// PHASE 2: ELABORATION (character_arcs, tone_and_style)
// ============================================================================

export const PHASE_2_MOCK = {
    character_arcs: [
        {
            character_name: "Kira the Thief",
            initial_state: "Hardened survivor who trusts no one, haunted by a failed heist that killed her partner",
            key_turning_points: [
                "Discovers the heist was orchestrated by her mentor to test her loyalty",
                "Must choose between vengeance and protecting the group during a critical moment",
                "Finds redemption through self-sacrifice in the climax"
            ],
            final_state: "Transformed from a self-serving survivor into someone willing to risk everything for others",
            emotional_trajectory: "Bitter → Resentful → Conflicted → Compassionate → Transcendent"
        },
        {
            character_name: "Theron the Mage",
            initial_state: "Exiled from his tower, drowning in shame for forbidden experiments that harmed innocents",
            key_turning_points: [
                "The group discovers his dark past but accepts him anyway",
                "He learns to channel his magic responsibly through teaching younger mages",
                "His redemption is tested when facing his former master"
            ],
            final_state: "Reclaimed his dignity and magic, becoming a mentor figure and moral compass",
            emotional_trajectory: "Guilt → Self-hatred → Shame → Acceptance → Purpose"
        }
    ],
    tone_and_style: {
        primary_tone: "Epic adventure with dark undertones and philosophical depth",
        narrative_voice: "Third-person omniscient with close POV on character emotions; balances grand scope with intimate character moments",
        pacing: "Fast action sequences interrupted by slower character introspection; escalates from investigation to desperate race against time",
        key_stylistic_elements: [
            "Vivid sensory descriptions of magic and landscape",
            "Internal monologues revealing character doubts",
            "Dialogue that reveals both plot and character conflict",
            "Metaphors connecting character journeys to the artifact's cursed nature"
        ]
    }
};

// ============================================================================
// PHASE 3: STRUCTURE (arc_structure, scene_plan, genre_realism_notes, content_boundaries)
// ============================================================================

export const PHASE_3_MOCK = {
    arc_structure: {
        opening_hook: "The party witnesses the theft of the Starstone and is framed as the culprits, forcing them on the run",
        escalation_pattern: "Each encounter raises stakes: personal threats become kingdom-level consequences; magical side-effects intensify",
        climax_nature: "The party must enter the Shadow Crown's stronghold to retrieve the artifact, confronting both external enemies and their own inner demons",
        resolution_style: "Hard-won victory with lasting consequences; the prophecy is subverted through unexpected sacrifice"
    },
    scene_plan: [
        {
            index: 0,
            title: "The Heist Gone Wrong",
            phase: "setup",
            purpose: "Introduce the party and the central conflict",
            situation: "The Starstone is stolen during a royal ceremony. The party witnesses the theft and are immediately blamed.",
            beats: [
                { index: 0, title: "Royal Ceremony", description: "The party attends the unveiling of the Starstone", type: "establishment", required: true },
                { index: 1, title: "The Theft", description: "Masked figures steal the artifact in a flash of dark magic", type: "hook", required: true },
                { index: 2, title: "Falsely Accused", description: "Guards point at the party as accomplices", type: "escalation", required: true },
                { index: 3, title: "Narrow Escape", description: "The party flees through the chaos", type: "pivot", required: false }
            ],
            character_focus: ["All party members"],
            hooks_for_future: ["The mysterious figure's identity", "The curse on the Starstone"]
        },
        {
            index: 1,
            title: "Following the Trail",
            phase: "setup",
            purpose: "Establish the investigation and introduce secondary characters",
            situation: "The party gathers information about the Shadow Crown and the artifact's location",
            beats: [
                { index: 0, title: "Going Underground", description: "The party hides in the city's underbelly", type: "establishment", required: true },
                { index: 1, title: "Contact Meeting", description: "A shady informant offers intel for a price", type: "hook", required: true },
                { index: 2, title: "Shadow Crown Sighting", description: "They spot agents of the enemy faction", type: "escalation", required: true },
                { index: 3, title: "Ambush", description: "Assassins attack; the party fights or flees", type: "pivot", required: true }
            ],
            character_focus: ["Kira (sneaking)", "Theron (magical investigation)"],
            hooks_for_future: ["The contact is secretly compromised"]
        },
        {
            index: 2,
            title: "The Prophecy Revealed",
            phase: "confrontation",
            purpose: "Raise the stakes by revealing what the artifact does",
            situation: "The party reaches an ancient library and learns the Starstone's true purpose",
            beats: [
                { index: 0, title: "Ancient Archives", description: "The party infiltrates a forbidden library", type: "establishment", required: true },
                { index: 1, title: "Deciphering Texts", description: "Theron translates the prophecy scroll", type: "reaction", required: true },
                { index: 2, title: "The Blood Moon", description: "They realize the deadline is days away", type: "escalation", required: true },
                { index: 3, title: "Dark History", description: "Records show a previous apocalyptic attempt", type: "emotional", required: false }
            ],
            character_focus: ["Theron (magical knowledge)"],
            hooks_for_future: ["The kingdoms don't believe them initially"]
        },
        {
            index: 3,
            title: "Impossible Choices",
            phase: "confrontation",
            purpose: "Force internal conflict and moral dilemmas",
            situation: "The party must infiltrate Shadow Crown territory but discovers innocent people will be harmed",
            beats: [
                { index: 0, title: "Enemy Territory", description: "The party crosses into Shadow Crown lands", type: "establishment", required: true },
                { index: 1, title: "Kira's Temptation", description: "Kira is offered a deal to betray the group", type: "pivot", required: true },
                { index: 2, title: "Theron's Past", description: "Theron confronts his former mentor", type: "emotional", required: true },
                { index: 3, title: "Forced Split", description: "The group must separate to survive", type: "escalation", required: true }
            ],
            character_focus: ["Kira", "Theron", "Others individually"],
            hooks_for_future: ["One character appears to have been captured"]
        },
        {
            index: 4,
            title: "The Stronghold Assault",
            phase: "resolution",
            purpose: "Climactic confrontation with Shadow Crown leader",
            situation: "The party storms the Shadow Crown stronghold as the Blood Moon rises",
            beats: [
                { index: 0, title: "Breach", description: "The party breaks into the stronghold", type: "establishment", required: true },
                { index: 1, title: "Ritual Begins", description: "The leader starts activating the Starstone", type: "escalation", required: true },
                { index: 2, title: "Ultimate Sacrifice", description: "Kira shatters part of the artifact at great cost", type: "pivot", required: true },
                { index: 3, title: "Final Confrontation", description: "Magical combat with the weakened leader", type: "escalation", required: true }
            ],
            character_focus: ["All party members"],
            hooks_for_future: ["Aftermath and consequences"]
        },
        {
            index: 5,
            title: "Aftermath and New Beginning",
            phase: "resolution",
            purpose: "Show the consequences and establish new status quo",
            situation: "The party survives but the world has changed; political and magical consequences unfold",
            beats: [
                { index: 0, title: "Dawn After Storm", description: "The Blood Moon fades; the threat is ended", type: "establishment", required: true },
                { index: 1, title: "Mourning and Honor", description: "The party grieves losses and is recognized", type: "emotional", required: true },
                { index: 2, title: "New Paths", description: "Each survivor chooses their future", type: "transition", required: true }
            ],
            character_focus: ["All surviving characters"],
            hooks_for_future: ["Sequel hooks"]
        }
    ],
    genre_realism_notes: {
        metaphor_level_used: "grounded",
        implementation_notes: "Magic is systematic and costly; prophecies are accurate but can be subverted through unexpected agency; political intrigue is realistic even with magical elements"
    },
    content_boundaries: {
        violence_level: "moderate",
        romance_level: "mild",
        other_content_notes: "Themes of sacrifice, redemption, and moral ambiguity. Character death is possible."
    }
};

// ============================================================================
// PHASE 4: RESOLUTIONS (primary_ending, alternate_endings, blueprint_title, cover_prompt)
// ============================================================================

export const PHASE_4_MOCK = {
    primary_ending: {
        title: "Sacrifice and Redemption",
        description: "Kira uses her last moments to shatter the Starstone, preventing the prophecy. Theron seals the remaining magical fragments at the cost of his connection to magic, becoming a bridge between the magical and mundane worlds. The party is hailed as heroes, but they carry the weight of their sacrifices. A new council is formed with the party's input, reshaping how magic is governed.",
        character_outcomes: [
            {
                character_name: "Kira the Thief",
                outcome: "Dies protecting the others, her sacrifice immortalized in songs. Her legacy inspires a new generation of selfless heroes."
            },
            {
                character_name: "Theron the Mage",
                outcome: "Loses his magical powers but gains peace and purpose as an advisor to the new council. He becomes humanity's translator between magic and politics."
            }
        ],
        thematic_resolution: "True power comes not from magic or strength, but from the willingness to sacrifice for others. Redemption is possible but requires genuine transformation."
    },
    alternate_endings: [
        {
            title: "Corruption's Price",
            description: "The party fails to stop the ritual. The Shadow Crown leader absorbs the Starstone's power and becomes a demi-god. The party must choose between fleeing to rebuild or making a last stand. Either way, the world enters a dark age of tyranny.",
            character_outcomes: [
                {
                    character_name: "Kira the Thief",
                    outcome: "Leads a resistance movement from the shadows; becomes a legend of defiance"
                },
                {
                    character_name: "Theron the Mage",
                    outcome: "Becomes hunted for his knowledge; must hide his magic or serve the new regime"
                }
            ],
            thematic_resolution: "Not all conflicts have happy endings. Sometimes survival and resistance are the only victories available."
        },
        {
            title: "Knowledge Over Violence",
            description: "The party discovers the prophecy can be redirected rather than destroyed. They use ancient magic to bind the Starstone to the party collectively, distributing its power so no one person can abuse it. This requires the party to remain bonded forever.",
            character_outcomes: [
                {
                    character_name: "Kira the Thief",
                    outcome: "Permanently linked to her companions; finds unexpected family in the bond"
                },
                {
                    character_name: "Theron the Mage",
                    outcome: "Becomes a guardian of the artifact; his redemption is sealed by eternal responsibility"
                }
            ],
            thematic_resolution: "The greatest power is not dominion, but connection. Sacrifice becomes ongoing commitment rather than a single act."
        }
    ],
    blueprint_title: "The Starstone Chronicles: Fate's Reversal",
    cover_prompt: "A fantasy book cover showing five diverse adventurers standing before a glowing artifact under a blood moon, with ancient magical symbols swirling around them. Dark stone architecture looms in the background. Epic, dramatic lighting with rich golds, deep purples, and silver accents.",
    llmDescriptor: "Mock LLM Response (Debug Mode)"
};

// ============================================================================
// UTILITY: Get mock response for a phase
// ============================================================================

/**
 * Get the mock response for a specific phase
 * @param {number} phase - Phase number (1-4)
 * @returns {Object} Mock response data
 */
export function getMockPhaseResponse(phase) {
    const mocks = {
        1: PHASE_1_MOCK,
        2: PHASE_2_MOCK,
        3: PHASE_3_MOCK,
        4: PHASE_4_MOCK,
    };

    const mock = mocks[phase];
    if (!mock) {
        throw new Error(`No mock data for phase ${phase}`);
    }

    console.log(`[Blueprint Debug] Returning mock response for Phase ${phase}`);
    return JSON.parse(JSON.stringify(mock)); // Deep copy
}

/**
 * Get mock response as JSON string (like an LLM would return)
 * @param {number} phase - Phase number (1-4)
 * @returns {string} JSON string
 */
export function getMockPhaseJSON(phase) {
    const data = getMockPhaseResponse(phase);
    return JSON.stringify(data, null, 2);
}

// ============================================================================
// COVER GENERATION MOCK
// ============================================================================

/**
 * Enable/disable cover generation mock
 * When enabled, generateCoverFromSD will return a placeholder image
 */
export function setCoverDebugMode(enabled) {
    window.COVER_DEBUG_MODE = enabled;
    console.log(`[Cover Debug] Mock mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function isCoverDebugMode() {
    return window.COVER_DEBUG_MODE === true;
}

/**
 * Get a mock cover result (placeholder image)
 * @returns {Object} Mock cover generation result
 */
export function getMockCoverResult() {
    // 1x1 purple pixel as base64 PNG (placeholder)
    const placeholderDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIA5ag+CwAAAABJRU5ErkJggg==';
    console.log('[Cover Debug] Returning mock cover result');
    return {
        success: true,
        imageUrl: placeholderDataUrl,
        mock: true
    };
}

// ============================================================================
// QUICK TEST COMMANDS
// ============================================================================

/**
 * Enable all debug modes for quick testing
 */
export function enableAllDebugModes() {
    setBlueprintDebugMode(true);
    setCoverDebugMode(true);
    console.log('[Debug] All debug modes enabled. Run wizard normally to test UI flow.');
}

/**
 * Disable all debug modes
 */
export function disableAllDebugModes() {
    setBlueprintDebugMode(false);
    setCoverDebugMode(false);
    console.log('[Debug] All debug modes disabled.');
}

// Expose to window for console access
if (typeof window !== 'undefined') {
    window.StoryModeDebug = {
        enableAll: enableAllDebugModes,
        disableAll: disableAllDebugModes,
        setBlueprintDebug: setBlueprintDebugMode,
        setCoverDebug: setCoverDebugMode,
        getMockPhase: getMockPhaseResponse,
    };
    console.log('[Story Mode] Debug commands available: window.StoryModeDebug.enableAll() / .disableAll()');
}

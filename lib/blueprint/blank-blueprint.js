/**
 * Blank Blueprint Factory
 * Creates minimal blueprint structures for manual editing via the wizard panel
 *
 * @module blueprint/blank-blueprint
 */

import { generateUUID } from './utils.js';
import { normalizeBlueprint } from './normalization.js';

/**
 * Create a blank blueprint with placeholder values
 * Used when user clicks "Add New" in library to create from scratch
 * @returns {Object} Normalized blank blueprint
 */
export function createBlankBlueprint() {
    const raw = {
        blueprint_id: generateUUID(),
        story_type_id: 'custom',
        story_type_name: 'Custom Story',
        blueprint_title: 'Working Title - New Blueprint',
        core_premise: '',
        setting: {
            location: '',
            time_period: '',
            atmosphere: ''
        },
        protagonist_group: {
            description: '',
            shared_goal: '',
            group_dynamic: ''
        },
        antagonistic_forces: {
            description: '',
            nature: 'external',
            motivation: '',
            manifestations: []
        },
        arc_structure: {
            total_messages_target: 30,
            opening_hook: '',
            escalation_pattern: '',
            climax_nature: '',
            resolution_style: ''
        },
        character_arcs: [],
        scene_plan: [],
        tone_and_style: {
            primary_tone: '',
            narrative_voice: '',
            pacing: '',
            key_stylistic_elements: []
        },
        content_boundaries: {
            violence_level: 'moderate',
            romance_level: 'mild',
            other_content_notes: ''
        },
        genre_realism_notes: {
            metaphor_level_used: 'mixed',
            implementation_notes: ''
        },
        cover_prompt: 'Placeholder cover for new blueprint',
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        // Mark as new for wizard panel behavior
        _isNew: true
    };

    return normalizeBlueprint(raw);
}

/**
 * Escape text for XML/SVG
 */
function escapeXML(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const SVG_GRADIENTS = `
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#16213e;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f0f23;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#4db6ac;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#00897b;stop-opacity:1" />
    </linearGradient>
`;

/**
 * Generate a placeholder cover SVG as a data URL
 * @param {string} title - Title to display on placeholder
 * @param {string} subtitle - Optional subtitle text (defaults to "Use the AI Wizard to generate content")
 * @returns {string} Data URL for SVG placeholder
 */
export function generatePlaceholderCover(title = 'New Blueprint', subtitle = 'Use the AI Wizard to generate content') {
    const escapedTitle = escapeXML(title);
    const escapedSubtitle = escapeXML(subtitle);
    const displayTitle = escapedTitle.length > 30
        ? escapedTitle.substring(0, 27) + '...'
        : escapedTitle;

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
            <defs>${SVG_GRADIENTS}</defs>
            <rect width="512" height="768" fill="url(#bg)"/>
            <rect x="40" y="340" width="432" height="4" rx="2" fill="url(#accent)" opacity="0.6"/>
            <rect x="40" y="424" width="432" height="4" rx="2" fill="url(#accent)" opacity="0.6"/>
            <text x="256" y="394" font-family="system-ui, sans-serif" font-size="28" font-weight="600"
                  fill="#ffffff" text-anchor="middle" opacity="0.9">${displayTitle}</text>
            <text x="256" y="500" font-family="system-ui, sans-serif" font-size="14"
                  fill="#4db6ac" text-anchor="middle" opacity="0.7">${escapedSubtitle}</text>
            <g transform="translate(231, 200)" opacity="0.4">
                <path d="M25 0 L50 43.3 L0 43.3 Z" fill="#4db6ac"/>
                <circle cx="25" cy="25" r="8" fill="none" stroke="#ffffff" stroke-width="2"/>
            </g>
        </svg>
    `.trim();

    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Check if a blueprint is considered "blank" (newly created, no content)
 * @param {Object} blueprint - Blueprint to check
 * @returns {boolean} True if blueprint has no meaningful content
 */
export function isBlankBlueprint(blueprint) {
    if (!blueprint || blueprint._isNew) return true;
    if (!blueprint.core_premise?.trim()) return true;
    if (!blueprint.character_arcs?.length) return true;

    const scenes = blueprint.scene_plan || [];
    return scenes.filter(s => !s.is_ending_scene).length === 0;
}

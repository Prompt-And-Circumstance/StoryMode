/**
 * Scenes Tab Module
 * Renders the Scenes tab content for blueprint editor
 */

import { getCurrentBlueprint } from './state.js';
import { escapeHtml } from '../../blueprint/utils.js';

export function renderScenesTab() {
    const scenes = getCurrentBlueprint().scene_plan || [];

    if (scenes.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: var(--SmartThemeEmColor);">
                <i class="fa-solid fa-film" style="font-size: 3em; margin-bottom: 16px;"></i>
                <p>No scenes defined yet.</p>
                <button id="add_scene_btn" class="menu_button" style="margin-top: 16px;">
                    <i class="fa-solid fa-plus"></i> Add First Scene
                </button>
            </div>
        `;
    }

    return `
        <div style="margin-bottom: 16px;">
            <button id="add_scene_btn" class="menu_button">
                <i class="fa-solid fa-plus"></i> Add Scene
            </button>
        </div>
        <div class="storymode-scenes-list">
            ${scenes.map((scene, index) => `
                <div class="storymode-scene-card" draggable data-scene-index="${index}">
                    <div class="storymode-scene-header">
                        <div>
                            <i class="fa-solid fa-grip-vertical"></i>
                            <span class="storymode-scene-title">${escapeHtml(scene.title || `Scene ${index + 1}`)}</span>
                            <span style="color: var(--SmartThemeEmColor); font-size: 0.85em; margin-left: 8px;">
                                ${escapeHtml(scene.phase || 'setup')}
                            </span>
                        </div>
                        <div class="storymode-scene-actions">
                            <button class="menu_button scene-edit-btn" data-index="${index}" title="Edit scene">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="menu_button scene-delete-btn" data-index="${index}" title="Delete scene">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="storymode-scene-body">
                        <strong>Purpose:</strong> ${escapeHtml(scene.purpose || 'N/A')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Get computed gallery state for rendering
 * @param {Object} blueprint - Blueprint object
 * @returns {Object} Gallery state { gallery, index, hasCarousel, currentUrl }
 */

/**
 * Cover Tab Module
 * Renders the Cover tab content for blueprint editor
 */

import { extension_settings } from '/scripts/extensions.js';
import { getCurrentBlueprint } from './state.js';
import { escapeHtml, isValidImageUrl, getBlueprintCoverUrl } from '../../blueprint/utils.js';
import { MODULE_NAME } from '../../core/state-manager.js';

export function getGalleryState(blueprint) {
    const gallery = blueprint.metadata?.coverGallery || [];
    const index = blueprint.metadata?.coverGalleryIndex ?? 0;
    const hasCarousel = gallery.length > 1;
    const currentUrl = gallery[index]?.url || blueprint.coverImageUrl;

    return { gallery, index, hasCarousel, currentUrl };
}

/**
 * Build carousel item HTML
 * @param {Object} cover - Cover object
 * @param {number} index - Cover index
 * @param {number} currentIndex - Currently active index
 * @param {number} total - Total number of covers
 * @returns {string} HTML string
 */
export function buildCarouselItem(cover, index, currentIndex, total) {
    const isActive = index === currentIndex;
    return `
        <div class="storymode-cover-carousel-item ${isActive ? 'active' : ''}"
             role="option"
             aria-selected="${isActive}"
             aria-label="Cover ${index + 1} of ${total}"
             tabindex="${isActive ? '0' : '-1'}"
             data-index="${index}">
            <img src="${escapeHtml(cover.url)}"
                 alt="Cover variant ${index + 1}"
                 aria-hidden="true">
            <div class="storymode-carousel-item-index" aria-hidden="true">${index + 1}</div>
        </div>
    `;
}

/**
 * Render Tab 3: Cover Image Prompt
 * Shows the auto-generated cover prompt with ability to edit
 * @returns {string} HTML content
 */
export function renderCoverTab() {
    const bp = getCurrentBlueprint();

    // Get or generate cover prompt
    bp.metadata = bp.metadata || {};
    if (!bp.metadata.coverPrompt) {
        bp.metadata.coverPrompt = generateCoverPrompt(bp);
    }

    const coverPrompt = bp.metadata.coverPrompt;
    const { gallery, index: currentCoverIndex, hasCarousel, currentUrl: displayCoverUrl } = getGalleryState(bp);

    // Check if SD slash command is available
    const hasSdCommand = SlashCommandParser && 'sd' in SlashCommandParser.commands;

    return `
        <!-- Cover Preview -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Cover Preview</h3>
            <div class="storymode-cover-preview-container">
                <div class="storymode-cover-preview" id="cover_preview_image">
                    ${displayCoverUrl ? `
                        ${hasCarousel ? `
                            <div class="storymode-cover-gallery">
                                <!-- Navigation Arrows -->
                                <button class="storymode-cover-nav storymode-cover-nav-prev"
                                        data-index="${currentCoverIndex - 1}"
                                        ${currentCoverIndex === 0 ? 'disabled' : ''}
                                        aria-label="Previous cover image">
                                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                                </button>

                                <!-- Cover Image -->
                                <div class="storymode-cover-image-wrapper">
                                    <img src="${escapeHtml(displayCoverUrl)}" alt="Blueprint cover">
                                    <div class="storymode-cover-counter">
                                        ${currentCoverIndex + 1} / ${gallery.length}
                                    </div>
                                </div>

                                <button class="storymode-cover-nav storymode-cover-nav-next"
                                        data-index="${currentCoverIndex + 1}"
                                        ${currentCoverIndex === gallery.length - 1 ? 'disabled' : ''}
                                        aria-label="Next cover image">
                                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                                </button>
                            </div>
                        ` : `
                            <img src="${escapeHtml(displayCoverUrl)}" alt="Blueprint cover">
                        `}
                    ` : `
                        <div class="storymode-cover-placeholder">
                            <i class="fa-solid fa-image"></i>
                            <span>No cover image</span>
                        </div>
                    `}
                </div>

                <!-- Right column: carousel and action buttons -->
                <div class="storymode-cover-carousel-column">
                    <!-- Thumbnail Carousel -->
                    ${hasCarousel ? `
                        <div class="storymode-cover-carousel"
                             role="region"
                             aria-label="Cover image gallery">
                            <div class="storymode-cover-carousel-track"
                                 id="cover_carousel_track"
                                 role="listbox"
                                 aria-label="Generated cover images">
                                ${gallery.map((cover, index) => buildCarouselItem(cover, index, currentCoverIndex, gallery.length)).join('')}
                            </div>
                        </div>
                        <!-- Screen reader announcement area -->
                        <div id="cover_gallery_status" class="sr-only" aria-live="assertive"></div>
                    ` : ''}

                    <div class="storymode-cover-actions">
                    <button id="generate_cover_btn" class="menu_button storymode-btn-primary">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Cover
                    </button>
                    <button id="upload_cover_btn" class="menu_button">
                        <i class="fa-solid fa-upload"></i> Upload Image
                    </button>
                    <button id="debug_sd_cmd_btn" class="menu_button" title="Show SD command for testing">
                        <i class="fa-solid fa-bug"></i> Debug
                    </button>
                    ${displayCoverUrl ? `
                    <button id="clear_cover_btn" class="menu_button storymode-btn-danger">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                    ` : ''}
                    </div>

                    <!-- Compact Prompt Editor (prompts only) -->
                    <div class="storymode-cover-prompt-editor">
                        <h4 class="storymode-section-title" style="font-size: 0.9em; margin-bottom: 12px;">Image Prompt</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div>
                                <label style="font-size: 0.8em; color: var(--SmartThemeEmColor);">Positive</label>
                                <textarea id="cover_positive_prompt" class="storymode-textarea" data-cover-field="positive" rows="3"
                                    style="font-size: 0.85em; padding: 6px;"
                                    placeholder="Describe what should be in the image...">${escapeHtml(coverPrompt.positive || '')}</textarea>
                            </div>
                            <div>
                                <label style="font-size: 0.8em; color: var(--SmartThemeEmColor);">Negative</label>
                                <textarea id="cover_negative_prompt" class="storymode-textarea" data-cover-field="negative" rows="2"
                                    style="font-size: 0.85em; padding: 6px;"
                                    placeholder="Describe what should NOT be in the image...">${escapeHtml(coverPrompt.negative || '')}</textarea>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button id="regenerate_prompt_btn" class="menu_button" style="flex: 1; padding: 6px 10px; font-size: 0.8em;">
                                    <i class="fa-solid fa-rotate"></i> Regenerate
                                </button>
                                <button id="copy_prompt_btn" class="menu_button" style="flex: 1; padding: 6px 10px; font-size: 0.8em;">
                                    <i class="fa-solid fa-copy"></i> Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                ${!hasSdCommand ? `
                <p class="storymode-form-hint" style="margin-top: 8px;">
                    <i class="fa-solid fa-info-circle"></i>
                    Stable Diffusion slash command not available. You can still edit the prompt and use it externally.
                </p>
                ` : ''}
            </div>
        </div>

        <!-- Prompt Details (full-width section) -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Style & Technical Details</h3>
            <div class="storymode-cover-prompt-details">
                <div class="storymode-form-grid">
                    <div>
                        <label for="cover_style">Art Style</label>
                        <input type="text" id="cover_style" class="text_pole" data-cover-field="style"
                            value="${escapeHtml(coverPrompt.style || '')}" placeholder="e.g., digital painting, concept art">
                    </div>
                    <div>
                        <label for="cover_mood">Mood</label>
                        <input type="text" id="cover_mood" class="text_pole" data-cover-field="mood"
                            value="${escapeHtml(coverPrompt.mood || '')}" placeholder="e.g., mysterious, dramatic">
                    </div>
                </div>
                <div class="storymode-form-grid">
                    <div>
                        <label for="cover_aspect_ratio">Aspect Ratio</label>
                        <select id="cover_aspect_ratio" class="text_pole" data-cover-field="technical.aspect_ratio">
                            <option value="2:3" ${coverPrompt.technical?.aspect_ratio === '2:3' ? 'selected' : ''}>2:3 (Portrait)</option>
                            <option value="3:4" ${coverPrompt.technical?.aspect_ratio === '3:4' ? 'selected' : ''}>3:4 (Portrait)</option>
                            <option value="1:1" ${coverPrompt.technical?.aspect_ratio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
                            <option value="4:3" ${coverPrompt.technical?.aspect_ratio === '4:3' ? 'selected' : ''}>4:3 (Landscape)</option>
                            <option value="16:9" ${coverPrompt.technical?.aspect_ratio === '16:9' ? 'selected' : ''}>16:9 (Wide)</option>
                        </select>
                    </div>
                    <div>
                        <label for="cover_quality">Quality</label>
                        <select id="cover_quality" class="text_pole" data-cover-field="technical.quality">
                            <option value="draft" ${coverPrompt.technical?.quality === 'draft' ? 'selected' : ''}>Draft (Fast)</option>
                            <option value="standard" ${coverPrompt.technical?.quality === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="high" ${coverPrompt.technical?.quality === 'high' ? 'selected' : ''}>High Quality</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Characters tab
 * Shows characters referenced in blueprint and their availability status
 * @returns {string} HTML
 */

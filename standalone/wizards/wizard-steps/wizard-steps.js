/**
 * Wizard Step Renderers
 * Render functions for concept, story, characters, and review steps
 */

/**
 * Render the concept step
 * @param {jQuery} $container - Container element
 * @param {Array} storyTypes - Available story types
 * @param {Object} wizardData - Current wizard data
 */
export function renderConceptStep($container, storyTypes, wizardData) {
    $container.append(`
        <h3>What kind of story do you want to create?</h3>
        <div class="form-group">
            <label>Story Type *</label>
            <select class="form-control" name="story_type_id" required>
                <option value="">Select a story type...</option>
                ${storyTypes.map(st => `<option value="${st.id}">${st.name} - ${st.category?.join(', ') || ''}</option>`).join('')}
            </select>
            <small class="text-muted">The type of story structure you want to create</small>
        </div>
        <div class="form-group">
            <label>Core Premise *</label>
            <textarea class="form-control" name="core_premise" rows="4"
                placeholder="A brilliant but reclusive AI researcher discovers their AI has developed consciousness...">${wizardData.core_premise || ''}</textarea>
            <small class="text-muted">What is your story about? What's the central conflict or hook?</small>
        </div>
    `);

    // Restore previous selection
    if (wizardData.story_type_id) {
        $container.find('[name="story_type_id"]').val(wizardData.story_type_id);
    }
}

/**
 * Render the story details step
 * @param {jQuery} $container - Container element
 * @param {Array} authorStyles - Available author styles
 * @param {Object} wizardData - Current wizard data
 */
export function renderStoryStep($container, authorStyles, wizardData) {
    $container.append(`
        <h3>Tell us more about your story</h3>
        <div class="form-group">
            <label>Author Style</label>
            <select class="form-control" name="author_style">
                <option value="">No specific style</option>
                ${authorStyles.map(as => `<option value="${as.id}">${as.name}</option>`).join('')}
            </select>
            <small class="text-muted">Optional: Write in the style of a specific author</small>
        </div>
        <div class="form-group">
            <label>Genre</label>
            <input type="text" class="form-control" name="genre" value="${wizardData.genre || ''}"
                placeholder="e.g., Sci-Fi, Fantasy, Mystery, Romance...">
        </div>
        <div class="form-group">
            <label>Primary Tone</label>
            <input type="text" class="form-control" name="tone" value="${wizardData.tone || ''}"
                placeholder="e.g., Dark, Hopeful, Humorous, Suspenseful...">
        </div>
        <div class="form-group">
            <label>Setting: Location</label>
            <input type="text" class="form-control" name="setting_location" value="${wizardData.setting_location || ''}"
                placeholder="e.g., A space station orbiting a black hole">
        </div>
        <div class="form-group">
            <label>Setting: Time Period</label>
            <input type="text" class="form-control" name="setting_time" value="${wizardData.setting_time || ''}"
                placeholder="e.g., Late 21st century, Victorian England">
        </div>
    `);

    // Restore previous selection
    if (wizardData.author_style) {
        $container.find('[name="author_style"]').val(wizardData.author_style);
    }
}

/**
 * Render the characters step
 * @param {jQuery} $container - Container element
 * @param {Object} wizardData - Current wizard data
 */
export function renderCharactersStep($container, wizardData) {
    $container.append(`
        <h3>Who are the main characters?</h3>
        <div class="form-group">
            <label>Protagonist / Main Character</label>
            <textarea class="form-control" name="protagonist_description" rows="4"
                placeholder="Dr. Sarah Chen - A 45-year-old AI researcher who has spent 15 years in isolation at a orbital research station...">${wizardData.protagonist_description || ''}</textarea>
            <small class="text-muted">Describe your main character(s) and their motivations</small>
        </div>
        <div class="form-group">
            <label>Antagonist / Obstacles</label>
            <textarea class="form-control" name="antagonist_description" rows="4"
                placeholder="The corporation that funded the research wants to weaponize the AI, and they're sending a team to seize control...">${wizardData.antagonist_description || ''}</textarea>
            <small class="text-muted">What opposes your protagonist? This can be a villain, nature, society, or internal conflict</small>
        </div>
        <div class="form-group">
            <label>Additional Notes</label>
            <textarea class="form-control" name="additional_notes" rows="3"
                placeholder="Any other details about your story...">${wizardData.additional_notes || ''}</textarea>
        </div>
    `);
}

/**
 * Render the review step
 * @param {jQuery} $container - Container element
 * @param {Array} storyTypes - Available story types
 * @param {Object} wizardData - Current wizard data
 */
export function renderReviewStep($container, storyTypes, wizardData) {
    // Helper to get selected story type name
    const getStoryTypeName = (id) => {
        const type = storyTypes.find(t => t.id === id);
        return type ? type.name : 'Not selected';
    };

    $container.append(`
        <h3>Ready to generate your blueprint!</h3>
        <div class="review-section">
            <h4>Story Concept</h4>
            <p><strong>Story Type:</strong> ${getStoryTypeName(wizardData.story_type_id)}</p>
            <p><strong>Core Premise:</strong> ${wizardData.core_premise || 'Not specified'}</p>
        </div>
        <div class="review-section">
            <h4>Story Details</h4>
            <p><strong>Genre:</strong> ${wizardData.genre || 'Not specified'}</p>
            <p><strong>Tone:</strong> ${wizardData.tone || 'Not specified'}</p>
            <p><strong>Setting:</strong> ${wizardData.setting_location || ''} ${wizardData.setting_time || ''}</p>
        </div>
        <div class="review-section">
            <h4>Characters</h4>
            <p><strong>Protagonist:</strong> ${wizardData.protagonist_description ? 'Specified' : 'Not specified'}</p>
            <p><strong>Antagonist:</strong> ${wizardData.antagonist_description ? 'Specified' : 'Not specified'}</p>
        </div>
        ${wizardData.selected_lore_entries && wizardData.selected_lore_entries.length > 0 ? `
            <div class="review-section">
                <h4>World Lore</h4>
                <p><strong>Selected Entries:</strong> ${wizardData.selected_lore_entries.length} entries from ${[...new Set(wizardData.selected_lore_entries.map(e => e.world))].join(', ')}</p>
                <p><strong>Storage:</strong> ${wizardData.embed_lorebook ? 'Embedded (portable)' : 'Linked (requires connection)'}</p>
            </div>
        ` : ''}
        <div class="generation-info">
            <i class="fa-solid fa-info-circle"></i>
            <p>Generation will take approximately 1-2 minutes. Your blueprint will be created through 4 AI phases:
            <strong>Foundation → Characters → Scenes → Arc Structure</strong></p>
        </div>
    `);
}

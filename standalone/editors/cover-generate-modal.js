/**
 * Cover Generate Modal Module
 * Handles the generate cover modal functionality
 */

import { Popup } from '../adapters/popup-adapter.js';

/**
 * Open the generate cover modal
 * @param {Object} blueprint - Blueprint object for auto-generate
 * @param {Function} onGenerate - Callback with generation params
 */
export function openGenerateModal(blueprint, onGenerate) {
    const $content = $('<div>').addClass('cover-generate-form');

    // Instructions
    $content.append($('<p>').text('Generate a cover image using AI. This feature requires a configured Stable Diffusion backend.'));

    // Prompt input
    const $promptGroup = $('<div>').addClass('form-group');
    $promptGroup.append($('<label>').text('Prompt'));
    $promptGroup.append($('<textarea>')
        .addClass('form-control')
        .attr('id', 'cover-prompt')
        .attr('rows', '3')
        .attr('placeholder', 'Describe the cover image...'));

    // Auto-generate from blueprint
    if (blueprint) {
        const $autoBtn = $('<button>')
            .addClass('btn btn-sm btn-secondary')
            .attr('type', 'button')
            .html('<i class="fa-solid fa-magic"></i> Auto-generate from Blueprint')
            .css('marginTop', '8px');

        $autoBtn.on('click', function() {
            const prompt = generatePromptFromBlueprint(blueprint);
            $content.find('#cover-prompt').val(prompt);
        });

        $promptGroup.append($autoBtn);
    }

    $content.append($promptGroup);

    // Negative prompt
    const $negGroup = $('<div>').addClass('form-group');
    $negGroup.append($('<label>').text('Negative Prompt'));
    $negGroup.append($('<textarea>')
        .addClass('form-control')
        .attr('id', 'cover-negative-prompt')
        .attr('rows', '2')
        .val('text, watermark, signature, blurry, low quality'));
    $content.append($negGroup);

    // Advanced options (collapsible)
    const $advanced = $('<details>').addClass('advanced-options');
    $advanced.append($('<summary>').text('Advanced Options'));

    const $advContent = $('<div>').addClass('advanced-options-content');

    // Steps
    $advContent.append($('<div>').addClass('form-group').append(
        $('<label>').text('Sampling Steps')
    ).append(
        $('<input>').attr('type', 'number').addClass('form-control').attr('id', 'cover-steps').val(20).attr('min', '10').attr('max', '150')
    ));

    // CFG Scale
    $advContent.append($('<div>').addClass('form-group').append(
        $('<label>').text('CFG Scale')
    ).append(
        $('<input>').attr('type', 'number').addClass('form-control').attr('id', 'cover-cfg').val('7').attr('min', '1').attr('max', '30')
    ));

    $advanced.append($advContent);
    $content.append($advanced);

    const popup = new Popup($content, 'TEXT', 'Generate Cover', {
        wide: true,
        okButton: true,
        cancelButton: true,
    });

    popup.show().then(result => {
        if (result) {
            const prompt = $content.find('#cover-prompt').val().trim();
            if (prompt) {
                onGenerate({
                    prompt,
                    negative_prompt: $content.find('#cover-negative-prompt').val().trim(),
                    steps: Number($content.find('#cover-steps').val()),
                    cfg_scale: Number($content.find('#cover-cfg').val()),
                });
            }
        }
    });
}

/**
 * Generate a prompt from blueprint data
 * @param {Object} blueprint - Blueprint object
 * @returns {string} Generated prompt
 */
function generatePromptFromBlueprint(blueprint) {
    const parts = [];

    // Add setting
    if (blueprint.setting?.location) {
        parts.push(`set in ${blueprint.setting.location}`);
    }

    // Add protagonist
    if (blueprint.protagonist_group?.description) {
        parts.push(`featuring ${blueprint.protagonist_group.description}`);
    }

    // Add genre/style from story type
    if (blueprint.story_type_id) {
        parts.push(`${blueprint.story_type_id} style`);
    }

    // Add mood
    if (blueprint.setting?.mood) {
        parts.push(`${blueprint.setting.mood} atmosphere`);
    }

    // Art style
    parts.push('digital art, cinematic, highly detailed');

    return parts.join(', ');
}

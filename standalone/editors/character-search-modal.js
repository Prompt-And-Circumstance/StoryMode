/**
 * Character Search Modal Module
 * Handles character search and selection modal
 */

import { getCharacters } from '../adapters/character-adapter.js';
import { Popup } from '../adapters/popup-adapter.js';

/**
 * Show character search modal
 * @param {jQuery} $input - Input element to populate with selected name
 * @param {Function} onSelect - Callback when character is selected
 */
export async function showCharacterSearch($input, onSelect) {
    const characters = await getCharacters();

    const $content = $('<div>').addClass('character-search');

    // Search input
    const $searchGroup = $('<div>').addClass('form-group');
    $searchGroup.append($('<input>')
        .attr('type', 'text')
        .addClass('form-control')
        .attr('placeholder', 'Search characters...')
        .attr('id', 'char-search-input'));
    $content.append($searchGroup);

    // Results container
    const $results = $('<div>').addClass('character-search-results');
    $content.append($results);

    // Render results
    function renderResults(query = '') {
        $results.empty();

        const filtered = query
            ? characters.filter(c => {
                const name = (c.name || '').toLowerCase();
                return name.includes(query.toLowerCase());
            })
            : characters.slice(0, 10);

        if (filtered.length === 0) {
            $results.empty().append($('<p>').addClass('text-muted').text('No characters found.'));
            return;
        }

        filtered.forEach(char => {
            const $item = $('<div>').addClass('character-result-item');
            $item.append($('<strong>').text(char.name || 'Unnamed'));
            if (char.description) {
                const desc = char.description.length > 100
                    ? char.description.substring(0, 100) + '...'
                    : char.description;
                $item.append($('<p>').addClass('text-muted').text(desc));
            }
            $item.on('click', function() {
                const name = char.name || '';
                if (onSelect) {
                    onSelect(char, name);
                } else {
                    $input.val(name);
                    // Close the popup
                    $('.modal-overlay').last().hide();
                }
            });
            $results.append($item);
        });
    }

    renderResults();

    // Bind search input
    $searchGroup.find('#char-search-input').on('input', function() {
        renderResults($(this).val());
    });

    const popup = new Popup($content, 'TEXT', 'Select Character', {
        wide: true,
        okButton: false,
        cancelButton: true,
    });

    popup.show();
}

/**
 * Get the arc type label for display
 * @param {string} arcType - Arc type
 * @returns {string} Display label
 */
export function getArcTypeLabel(arcType) {
    const labels = {
        'hero': 'Hero',
        'anti-hero': 'Anti-Hero',
        'mentor': 'Mentor',
        'ally': 'Ally',
        'antagonist': 'Antagonist',
        'neutral': 'Neutral',
    };
    return labels[arcType] || 'Unknown';
}

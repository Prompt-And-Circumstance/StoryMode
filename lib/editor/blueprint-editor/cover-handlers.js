/**
 * Cover field and gallery event handlers
 * @module editor/blueprint-editor/cover-handlers
 */

import { getCurrentBlueprint, setHasUnsavedChanges } from './state.js';
import { setNestedValue } from '../../blueprint/utils.js';
import { generateCoverPrompt } from '../../blueprint/storage.js';
import { navigateCoverGallery, canNavigateGallery } from './cover-gallery.js';

let _updateUnsavedIndicator = null;

export function setHelper(updateIndicatorFn) {
    _updateUnsavedIndicator = updateIndicatorFn;
}

function parseCoverFieldValue(field, value) {
    if (field === 'colors') {
        return value.split(',').map(c => c.trim()).filter(c => c);
    }
    return value;
}

function ensureCoverPromptInitialized() {
    getCurrentBlueprint().metadata = getCurrentBlueprint().metadata || {};
    if (!getCurrentBlueprint().metadata.coverPrompt) {
        getCurrentBlueprint().metadata.coverPrompt = generateCoverPrompt(getCurrentBlueprint());
    }
}

export function setupCoverFieldHandlers(EVENT_NAMESPACE) {
    $(document).on('change' + EVENT_NAMESPACE + ' input' + EVENT_NAMESPACE, '[data-cover-field]', function () {
        const field = $(this).data('cover-field');
        let value = parseCoverFieldValue(field, $(this).val());

        ensureCoverPromptInitialized();

        if (field.includes('.')) {
            setNestedValue(getCurrentBlueprint().metadata.coverPrompt, field, value);
        } else {
            getCurrentBlueprint().metadata.coverPrompt[field] = value;
        }

        setHasUnsavedChanges(true);
        if (_updateUnsavedIndicator) _updateUnsavedIndicator();
    });
}

export function setupCoverGalleryHandlers(EVENT_NAMESPACE) {
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-nav-prev, .storymode-cover-nav-next', function (e) {
        e.preventDefault();
        const newIndex = parseInt($(this).data('index'));
        navigateCoverGallery(newIndex);
    });

    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-carousel-item', function (e) {
        e.preventDefault();
        const index = parseInt($(this).data('index'));
        if (!isNaN(index)) {
            navigateCoverGallery(index);
        }
    });

    $(document).on('keydown' + EVENT_NAMESPACE, function (e) {
        if (!canNavigateGallery()) return;

        const currentIndex = getCurrentBlueprint().metadata?.coverGalleryIndex || 0;
        const gallery = getCurrentBlueprint().metadata?.coverGallery;

        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            e.preventDefault();
            navigateCoverGallery(currentIndex - 1);
        } else if (e.key === 'ArrowRight' && currentIndex < gallery.length - 1) {
            e.preventDefault();
            navigateCoverGallery(currentIndex + 1);
        }
    });
}

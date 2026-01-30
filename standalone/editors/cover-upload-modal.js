/**
 * Cover Upload Modal Module
 * Handles the upload cover modal functionality
 */

import { Popup } from '../adapters/popup-adapter.js';

/**
 * Open the upload cover modal
 * @param {Function} onUpload - Callback when file is selected
 */
export function openUploadModal(onUpload) {
    const $content = $('<div>').addClass('cover-upload-form');

    // Instructions
    $content.append($('<p>').text('Upload an image to use as a blueprint cover.'));

    // File input
    const $fileGroup = $('<div>').addClass('form-group');
    $fileGroup.append($('<label>').text('Select Image'));
    $fileGroup.append($('<input>')
        .attr('type', 'file')
        .attr('accept', 'image/*')
        .attr('id', 'cover-file-input'));
    $content.append($fileGroup);

    // Preview
    const $preview = $('<div>').addClass('upload-preview').attr('id', 'cover-preview');
    $content.append($preview);

    // Bind file input change
    $content.find('#cover-file-input').on('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                // Use jQuery attr() instead of template literal to prevent XSS
                const $img = $('<img>').attr('src', e.target.result).css({
                    'max-width': '100%',
                    'max-height': '300px'
                });
                $preview.empty().append($img);
            };
            reader.readAsDataURL(file);
        }
    });

    const popup = new Popup($content, 'TEXT', 'Upload Cover', {
        wide: true,
        okButton: true,
        cancelButton: true,
    });

    popup.show().then(result => {
        if (result) {
            const file = $content.find('#cover-file-input')[0]?.files[0];
            if (file) {
                onUpload(file);
            }
        }
    });
}

/**
 * Upload a cover image file
 * @param {File} file - Image file to upload
 * @param {Function} onReady - Callback when file is read as base64
 */
export function uploadCoverFile(file, onReady) {
    const reader = new FileReader();
    reader.onload = function(e) {
        onReady(e.target.result);
    };
    reader.readAsDataURL(file);
}

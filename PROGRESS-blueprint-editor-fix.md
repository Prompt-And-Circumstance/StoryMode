# Blueprint Editor Fix - Implementation Progress

**Date:** 2026-01-16
**Status:** In Progress
**Session:** Add missing blueprint_title and opening_message UI fields to blueprint editor
**Model:** glm-4.7

---

## Executive Summary

The blueprint editor (`lib/blueprint-editor.js`) is missing UI controls for two critical schema fields: `blueprint_title` and `opening_message`. Both fields are properly defined in `lib/blueprint-schema.js` and validated by `blueprint-module.js`, but the `renderDetailsTab()` function never renders form elements for them, leaving them invisible and uneditable to users.

**Code Metrics:**
- **Module Size:** ~1,800 lines (blueprint-editor.js)
- **Files Modified:** 1 file
- **Functions Updated:** 2 functions (renderDetailsTab, renderLeftPanel)
- **Test Coverage:** Pending implementation

---

## What Was Built

### 1. Blueprint Title Field

**Purpose:** Provide a user-friendly title for the blueprint, separate from the internal identifier

**Key Features:**
1. Text input field with `data-field="blueprint_title"`
2. Full-width layout at the top of Details tab
3. Prominently displayed in left panel header
4. Auto-saves via existing field handler delegation

**Location:** `lib/blueprint-editor.js:380-630` (renderDetailsTab function)

---

## Implementation Details

### Root Cause Analysis

The blueprint schema in `lib/blueprint-schema.js` (lines 17-28) defines:
- `blueprint_title` (string, required, max 200 chars)
- `opening_message` (string, optional, max 50000 chars)

However, `renderDetailsTab()` in `lib/blueprint-editor.js` only renders:
- Core Premise
- Story Type & Author Style (read-only display)
- Setting
- Protagonist Group
- Antagonistic Forces
- Arc Structure
- Scene Plan
- Story Endings
- Tone and Style
- Content Boundaries

Both `blueprint_title` and `opening_message` are completely absent from the UI.

### Proposed Changes

#### 1. renderDetailsTab() - Add Title Field (Lines ~385)

```javascript
// Add at very top, before "Core Premise"
const titleHtml = `
    <div class="blueprint-form-group">
        <label for="blueprint_title" class="blueprint-label">
            <i class="fa-solid fa-heading"></i> Blueprint Title
        </label>
        <input
            type="text"
            id="blueprint_title"
            class="blueprint-input-text"
            data-field="blueprint_title"
            placeholder="Enter a descriptive title for this blueprint..."
            maxlength="200"
        />
        <small class="blueprint-help-text">
            A clear, memorable title that describes the story's concept
        </small>
    </div>
`;
```

#### 2. renderDetailsTab() - Add Opening Message Field (Lines ~625, after Story Endings)

```javascript
const openingMessageHtml = `
    <div class="blueprint-section">
        <details class="blueprint-details">
            <summary class="blueprint-summary">
                <i class="fa-solid fa-message"></i> Opening Message (Optional)
            </summary>
            <div class="blueprint-details-content">
                <div class="blueprint-form-group">
                    <label for="opening_message" class="blueprint-label">
                        Generated Opening Message
                    </label>
                    <textarea
                        id="opening_message"
                        class="blueprint-textarea"
                        data-field="opening_message"
                        rows="10"
                        maxlength="50000"
                        placeholder="If generated, this message will appear when starting a story from this blueprint..."
                    ></textarea>
                    <small class="blueprint-help-text">
                        Optional pre-generated opening message. Up to 50,000 characters.
                    </small>
                </div>
            </div>
        </details>
    </div>
`;
```

#### 3. renderLeftPanel() - Display Title (Lines ~273-324)

Current header is generic "Blueprint Info". Update to:

```javascript
// Replace line ~290 "Blueprint Info" header with:
const title = blueprint.blueprint_title || 'Untitled Blueprint';
const headerHtml = `
    <div class="blueprint-info-header">
        <h3 class="blueprint-title">${this.escapeHtml(title)}</h3>
        <p class="blueprint-subtitle">Blueprint Info</p>
    </div>
`;
```

### Key Implementation Choices

| Decision | Choice Made | Rationale |
|----------|-------------|-----------|
| Title placement | Top of Details tab, before Core Premise | Title is the first thing users should see/edit |
| Opening message placement | After Story Endings, in collapsible section | Less frequently edited, keeps UI compact |
| Input type | Text input (title), textarea (opening) | Standard form controls, consistent with existing fields |
| Character limits | 200 (title), 50000 (opening) | Matches schema validation rules |
| Field handler | Use existing `[data-field]` delegation | No new handler code needed, works automatically |

---

## Testing Checklist

### Unit Tests
- [ ] Title field renders in correct position
- [ ] Opening message field renders in collapsible section
- [ ] Left panel displays title correctly
- [ ] Fields initialize with existing data
- [ ] Character limits enforced

### Integration Tests
- [ ] Changes save via existing field handlers
- [ ] Data persists across editor close/reopen
- [ ] Schema validation accepts new values
- [ ] Collapsible section toggle works

### Manual Testing
- [ ] Create new blueprint, set title and opening message
- [ ] Edit existing blueprint, verify fields populate
- [ ] Save and reload, verify persistence
- [ ] Test character limit enforcement (try >200 chars for title)
- [ ] Test with very long opening message (>1000 chars)

---

## Known Limitations

1. **No live character count** - HTML `maxlength` enforces limits, but no counter shown
   - Mitigation: `maxlength` attribute prevents excess input
   - Future fix: Add character counter like `(180/200)`

2. **Title not used in blueprint selection UI** - `blueprint-module.js` shows blueprint ID in dropdowns
   - Mitigation: Title is primarily for editor organization
   - Future fix: Update selection dropdowns to show `blueprint_title`

3. **Opening message generation** - Field exists but no auto-generation UI
   - Mitigation: Manual edit only for now
   - Future fix: Add "Generate Opening" button similar to "Generate Blueprint"

---

## Dependencies

### External Dependencies
- jQuery - DOM manipulation
- SillyTavern Popup API - Modal container
- toastr - User notifications

### Internal Dependencies
- `./blueprint-schema.js` - Field definitions and validation rules
- `./blueprint-storage.js` - Data persistence (getBlueprint, saveBlueprint)
- `./blueprint-utils.js` - escapeHtml() for safe rendering

---

## Integration Status

| Integration Point | Status | Notes |
|-------------------|--------|-------|
| Schema validation | Complete | Fields already defined in blueprint-schema.js |
| Field handlers | Complete | Existing `[data-field]` delegation will work |
| Storage layer | Complete | getBlueprint/saveBlueprint handle these fields |
| Left panel display | Pending | renderLeftPanel() needs title display |
| Details tab | Pending | renderDetailsTab() needs form fields |

---

## Remaining Work

### High Priority
1. [ ] Implement blueprint_title field in renderDetailsTab()
2. [ ] Implement opening_message field in renderDetailsTab()
3. [ ] Update renderLeftPanel() to display blueprint_title

### Medium Priority
1. [ ] Test field initialization with existing blueprints
2. [ ] Test save/load persistence cycle
3. [ ] Verify collapsible section behavior

### Low Priority / Nice-to-Have
1. [ ] Add live character counters
2. [ ] Update blueprint selection dropdowns to show title
3. [ ] Add "Generate Opening" button with LLM integration
4. [ ] Add field validation on save (visual feedback)

---

## Change Log

| Date | Change | Impact |
|------|--------|--------|
| 2026-01-16 | Created PROGRESS file from debug findings | Initial documentation |

---

## Debug Session Findings

**Issue Reported:** Blueprint editor missing UI for `blueprint_title` and `opening_message` fields

**Investigation:**
1. Reviewed `lib/blueprint-schema.js` - both fields properly defined
2. Reviewed `lib/blueprint-editor.js` - `renderDetailsTab()` missing form elements
3. Confirmed `setupFieldHandlers()` uses event delegation - will auto-work
4. Verified `renderLeftPanel()` shows generic header - should display title

**Root Cause:** `renderDetailsTab()` function (lines 380-630) never renders UI for these fields

**Solution Path:** Add HTML form elements to `renderDetailsTab()` and update `renderLeftPanel()`

**Test Evidence:**
- Schema validation passes for these fields (blueprint-module.js confirms)
- Storage layer persists them correctly (blueprint-storage.js confirms)
- Only UI layer missing

---

**Document Version:** 1.0
**Last Updated:** 2026-01-16
**Author:** Claude Code (with user guidance)
**Session Type:** Bug Fix
**Debug Method:** Static code analysis + schema comparison

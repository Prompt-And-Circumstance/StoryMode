# Testing Plan: Blueprint Export/Import Feature

**Feature:** Story Mode Blueprint Export/Import with Embedded Resources
**Date:** 2026-01-18
**Implementation Status:** Complete (Phase 1-4)
**FIX Report:** `Debugging/FIX-blueprint-export-import.md`

**Purpose:** This plan provides comprehensive testing guidance for the blueprint export/import feature, including security fixes, code quality improvements, and regression prevention.

---

## Executive Summary

The blueprint export/import feature has been implemented with 12 of 13 planned bug fixes. This testing plan covers:

- **8 Security vulnerabilities** — All fixed (SEC-001 through SEC-008)
- **2 Code quality issues** — Fixed (refresh handler, format detection)
- **2 Code quality issues** — Require manual testing (avatar ID, server endpoint)
- **File size compliance** — All files now under 400-line limit
- **Backward compatibility** — v1.0.0 PNG format still supported

**Testing Priority:**
1. **Critical Path** — Export → Import → Round-trip validation (30 min)
2. **Security Tests** — Malicious inputs, size limits, validation (45 min)
3. **Regression Tests** — v1.0.0 compatibility, format detection (30 min)
4. **Integration Tests** — Full workflow, edge cases (45 min)

**Total Testing Time:** ~2.5 hours

---

## Implementation Changes Summary

### New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `lib/blueprint-character-discovery.js` | 128 | Character/persona discovery functions |

### Files Modified

| File | Changes | Key Additions |
|------|---------|---------------|
| `lib/blueprint-character-linker.js` | -78 lines (424→346) | Removed discovery functions |
| `lib/blueprint-png-decoder.js` | +50 lines | Safe JSON parsing, chunk helpers |
| `lib/blueprint-import.js` | +65 lines | Size validation, rate limiting |
| `lib/blueprint-export.js` | +51 lines | Size estimation, warnings |
| `lib/blueprint-editor.js` | +26 lines | Refresh button handler |
| `lib/blueprint-library.js` | +14 lines | Format logging, fallback |
| `lib/blueprint-utils.js` | +43 lines | 5 new utility functions |

### New Utility Functions

1. **`estimateDataURLSize(dataUrl)`** — Calculate decoded size of base64 data URL
2. **`safeParseWithLimit(jsonString, maxSizeKB)`** — Parse JSON with size limit and prototype pollution detection
3. **`validateResourceSizes(resources, type, field, max)`** — Generic resource size validation
4. **`importResourceLoop(resources, importFn, skipped, type)`** — Import loop with error handling
5. **`parseOptionalChunk(metadata, keyword, path, blueprint)`** — Parse optional PNG metadata chunk

---

## Test Categories

### 1. Critical Path Tests (Must Pass)

**Time:** 30 minutes | **Priority:** CRITICAL

These tests validate the core export/import functionality. If any fail, the feature is not usable.

#### Test 1.1: Basic Export
**Steps:**
1. Open blueprint editor with any blueprint loaded
2. Click "Export" button in title bar
3. Observe download behavior
4. Check downloaded file

**Expected Results:**
- Success toast appears: "Blueprint exported: story-blueprint-[name]-[timestamp].png"
- PNG file downloads to default download location
- File size is reasonable (<5MB for typical blueprints)
- No JavaScript errors in console (F12 → Console)

**Failure Indicators:**
- No download occurs
- Error toast appears
- File size is unexpectedly large (>10MB)
- Console errors visible

---

#### Test 1.2: Fresh Import
**Steps:**
1. Transfer exported PNG to another SillyTavern instance (or delete characters first)
2. Open Library panel (Story Mode tab)
3. Drag-and-drop PNG onto library grid

**Expected Results:**
- Import preview dialog appears within 2 seconds
- Dialog shows character cards with thumbnails
- Missing characters are pre-selected (checked)
- Available characters are un-selected
- "Import All" and "Import Selected" buttons present

**Failure Indicators:**
- No dialog appears
- Dialog shows HTML/JSON instead of UI
- Checkboxes don't work
- Thumbnails not loading

---

#### Test 1.3: Import with Conflicts
**Steps:**
1. Import blueprint PNG on instance with existing character names
2. Observe conflict resolution dialog (if conflicts detected)
3. Test each option: Keep existing, Replace, Rename

**Expected Results:**
- Conflict dialog appears showing conflicting character names
- 3 radio options per conflict: Keep existing, Replace, Rename to "(Imported)"
- Selecting "Keep existing" — character not imported
- Selecting "Replace" — existing character overwritten
- Selecting "Rename" — new character imported with suffix

**Failure Indicators:**
- Conflict dialog doesn't appear
- Options don't match expected behavior
- Characters incorrectly handled

---

#### Test 1.4: Round-Trip Data Integrity
**Steps:**
1. Export blueprint with embedded characters
2. Import on fresh instance
3. Compare original vs imported blueprint (check JSON in DevTools or re-export)

**Expected Results:**
- All blueprint fields preserved
- Character data intact (names, descriptions)
- Embedded resources accessible
- Opening message preserved

**Failure Indicators:**
- Missing fields in imported blueprint
- Character data corrupted
- Resources missing from `embeddedResources`

---

### 2. Security Tests (Must Pass)

**Time:** 45 minutes | **Priority:** CRITICAL

These tests validate that security vulnerabilities are properly mitigated.

#### Test 2.1: Large JSON Payload Rejection
**Purpose:** Verify SEC-001 — JSON parsing with size limits

**Steps:**
1. Create malicious PNG with >500KB JSON chunk (use hex editor or script)
2. Attempt import

**Expected Results:**
- Import fails immediately
- Error message: "JSON exceeds size limit: [size] bytes"
- No browser hang or crash

**Failure Indicators:**
- Import proceeds despite large payload
- Browser freezes during parsing
- No size validation occurs

---

#### Test 2.2: Prototype Pollution Rejection
**Purpose:** Verify SEC-001 — Prototype pollution detection

**Steps:**
1. Create PNG with malicious JSON: `{"__proto__": {"admin": true}}`
2. Attempt import

**Expected Results:**
- Import fails
- Error message: "Potentially malicious JSON detected"
- No JavaScript execution or privilege escalation

**Failure Indicators:**
- Malicious JSON accepted
- Object prototype polluted
- Unexpected behavior in UI

---

#### Test 2.3: Invalid Data URL Rejection
**Purpose:** Verify SEC-002 — Data URL format validation

**Steps:**
1. Create PNG with malformed data URL in character field: `data:not-a-url,content`
2. Attempt import

**Expected Results:**
- Import fails
- Error message: "Invalid data URL: must be base64 encoded"
- No crash before error

**Failure Indicators:**
- Invalid data URL accepted
- `atob()` throws uncaught exception
- Browser console shows cryptic error

---

#### Test 2.4: Non-Image MIME Type Rejection
**Purpose:** Verify SEC-002 — MIME type validation

**Steps:**
1. Create PNG with `data:text/html;base64,...` in avatar field
2. Attempt import

**Expected Results:**
- Import fails
- Error message: "Invalid data URL: unsafe MIME type text/html"
- Only `image/*` MIME types accepted

**Failure Indicators:**
- Non-image data URL accepted
- Potential XSS vector

---

#### Test 2.5: Oversized File Rejection
**Purpose:** Verify SEC-003 — 10MB total file limit

**Steps:**
1. Create PNG file >10MB (use large base64 payload)
2. Attempt import

**Expected Results:**
- Import fails immediately
- Error message: "File too large (X.XXMB). Maximum is 10MB."
- No partial import occurs

**Failure Indicators:**
- Large file processed anyway
- Browser memory exhausted
- No size validation

---

#### Test 2.6: Oversized Resource Rejection
**Purpose:** Verify SEC-003 — 5MB per-resource limit

**Steps:**
1. Create PNG with character avatar >5MB
2. Attempt import

**Expected Results:**
- Import fails
- Error message: "Character \"[name]\" exceeds 5MB limit (X.XXMB)"
- Specific resource name mentioned

**Failure Indicators:**
- Large resource accepted
- No per-resource validation

---

#### Test 2.7: Invalid PNG Signature Rejection
**Purpose:** Verify SEC-004 — PNG signature verification

**Steps:**
1. Create file with invalid PNG signature (modify first 8 bytes)
2. Use in blueprint as character card
3. Attempt import

**Expected Results:**
- Import fails
- Error message: "Invalid PNG file signature"
- Invalid file not uploaded to server

**Failure Indicators:**
- Invalid file uploaded to server
- Server error occurs
- No validation before upload

---

#### Test 2.8: Rate Limiting Verification
**Purpose:** Verify SEC-005 — 500ms delays between imports

**Steps:**
1. Import blueprint with 5 characters
2. Observe import timing and progress indicators
3. Check LoadingIndicator messages

**Expected Results:**
- Progress indicators show "Importing character 1 of 5...", "Importing character 2 of 5...", etc.
- ~500ms delays between imports (observable)
- All characters imported successfully
- No server overload

**Failure Indicators:**
- All imports happen instantly (no delays)
- Server returns rate limit errors
- Progress indicators don't update

---

### 3. Regression Tests (Must Pass)

**Time:** 30 minutes | **Priority:** HIGH

These tests ensure backward compatibility and no breaking changes.

#### Test 3.1: v1.0.0 PNG Format Import
**Purpose:** Verify REG-001 — Legacy format support

**Steps:**
1. Obtain v1.0.0 blueprint PNG (without embedded resources)
2. Import via Library panel

**Expected Results:**
- Blueprint imports successfully
- Console log shows: "[Story Mode] Detected PNG format: basic (v1.0.0)"
- No errors or warnings
- Blueprint loads in editor

**Failure Indicators:**
- Import fails
- Misclassified as extended format
- Console errors

---

#### Test 3.2: Format Detection Logging
**Purpose:** Verify REG-001 — Format detection visibility

**Steps:**
1. Import v1.0.0 PNG
2. Import v2.0.0 PNG
3. Check browser console (F12 → Console)

**Expected Results:**
- v1.0.0: "Detected PNG format: basic (v1.0.0)"
- v2.0.0: "Detected PNG format: extended (v2.0.0)"

**Failure Indicators:**
- No logging occurs
- Format misclassified

---

#### Test 3.3: Graceful Fallback
**Purpose:** Verify REG-001 — Extended format fallback

**Steps:**
1. Create malformed extended PNG (triggers parse error)
2. Attempt import
3. Observe behavior

**Expected Results:**
- Warning toast: "Extended format import failed, trying basic format..."
- Attempts basic format parsing
- Clear error message if both fail

**Failure Indicators:**
- No fallback attempt
- Cryptic error message
- Import fails silently

---

#### Test 3.4: Export Size Warning
**Purpose:** Verify SEC-008 — Export size warning

**Steps:**
1. Create blueprint with many large covers (>10MB estimated)
2. Click Export button
3. Observe dialog

**Expected Results:**
- Confirmation dialog appears if size >10MB
- Message: "Warning: Exported blueprint may be large (~XX.XXMB). Continue?"
- Can cancel or continue

**Failure Indicators:**
- No warning shown
- Export hangs browser
- File exceeds browser download limits

---

#### Test 3.5: Blueprint Storage Operations
**Purpose:** Verify no breaking changes to storage

**Steps:**
1. Save blueprint to library
2. Load blueprint from library
3. Delete blueprint from library
4. Verify IndexedDB operations

**Expected Results:**
- All operations work as before
- No storage errors
- Thumbnails generate correctly

**Failure Indicators:**
- Save/load operations fail
- Storage errors in console
- Broken thumbnails

---

### 4. Integration Tests

**Time:** 45 minutes | **Priority:** MEDIUM

#### Test 4.1: Characters Tab Display
**Steps:**
1. Open blueprint editor with `character_arcs` defined
2. Click "Characters" tab
3. Observe character cards

**Expected Results:**
- Tab shows character cards from `character_arcs`
- Available characters have green checkmarks
- Missing characters have yellow warnings
- Character avatars display correctly
- Refresh button re-renders content

**Failure Indicators:**
- Tab shows placeholder or error
- Avatars don't load
- Status indicators incorrect

---

#### Test 4.2: Missing Persona Avatar
**Steps:**
1. Create PNG with persona avatar missing from server
2. Import blueprint
3. Observe persona import

**Expected Results:**
- Import continues (non-blocking)
- Console warning: "Failed to get persona data for [name]"
- Persona imported with placeholder or skipped
- Import result summary shows failure

**Failure Indicators:**
- Import fails completely
- No warning logged
- Partial import state corrupted

---

#### Test 4.3: Network Error Recovery
**Steps:**
1. Simulate network error during character import (disconnect or block server)
2. Observe import behavior

**Expected Results:**
- Import continues for other characters
- Failed character marked as failed
- Import result summary shows specific failure
- No partial state corruption

**Failure Indicators:**
- Import stops entirely
- State corrupted
- No error reporting

---

#### Test 4.4: Cancel Import During Preview
**Steps:**
1. Start import of blueprint with characters
2. When preview dialog appears, click Cancel
3. Observe state

**Expected Results:**
- Dialog closes
- No partial import occurs
- Library state unchanged
- No errors in console

**Failure Indicators:**
- Partial import occurs
- State corrupted
- Error messages appear

---

### 5. Edge Cases

**Time:** 30 minutes | **Priority:** MEDIUM

#### Test 5.1: Empty Blueprint Export
**Steps:**
1. Create blueprint with no characters, no cover
2. Export
3. Import on fresh instance

**Expected Results:**
- Export succeeds (small PNG)
- Import succeeds
- Blueprint loads correctly

---

#### Test 5.2: Maximum Resources (Boundary)
**Steps:**
1. Create blueprint with 10 characters (at 5MB limit each)
2. Export
3. Import

**Expected Results:**
- Export may take longer (progress indicator shown)
- Size validation works correctly
- Rate limiting prevents server overload

---

#### Test 5.3: Special Characters in Names
**Steps:**
1. Create blueprint with character names containing: quotes, angle brackets, emojis
2. Export
3. Import

**Expected Results:**
- Names properly escaped with `escapeHtml()`
- No XSS in import preview
- Names display correctly

---

#### Test 5.4: Concurrent Operations
**Steps:**
1. Start export
2. Immediately start import of another blueprint
3. Observe behavior

**Expected Results:**
- Operations don't interfere
- LoadingIndicator shows correct state
- No race conditions

---

## Pre-Test Setup

### Environment Requirements

1. **SillyTavern Instance:** Running and accessible
2. **Test Characters:** Create 3-4 test characters with avatars
3. **Test Personas:** Create 2-3 test personas with avatars
4. **Browser DevTools:** Open (F12) for console monitoring
5. **Clean State:** Start with fresh library (or backup existing)

### Test Data Preparation

**Test Blueprint:**
```
- Story Type: Any (e.g., "Epic Fantasy")
- Author Style: Any (e.g., "Tolkien-esque")
- Scenes: 5-10 scenes
- Characters: 2-3 characters with avatars
- Cover: Custom cover image
```

**Malicious Test PNGs:**
- Large JSON payload (>500KB)
- Prototype pollution payload
- Invalid data URL
- Non-image MIME type
- Invalid PNG signature
- Oversized file (>10MB)

**Valid Test PNGs:**
- v1.0.0 format (legacy)
- v2.0.0 format (extended)
- With/without embedded resources

---

## Test Execution Checklist

### Critical Path (30 min)

- [ ] Export blueprint from editor
- [ ] Import on fresh instance
- [ ] Import with existing characters (test conflicts)
- [ ] Round-trip data integrity

### Security Tests (45 min)

- [ ] Large JSON payload rejection
- [ ] Prototype pollution rejection
- [ ] Invalid data URL rejection
- [ ] Non-image MIME type rejection
- [ ] Oversized file rejection
- [ ] Oversized resource rejection
- [ ] Invalid PNG signature rejection
- [ ] Rate limiting verification

### Regression Tests (30 min)

- [ ] v1.0.0 PNG import
- [ ] Format detection logging
- [ ] Graceful fallback
- [ ] Export size warning
- [ ] Blueprint storage operations

### Integration Tests (45 min)

- [ ] Characters tab display
- [ ] Missing persona avatar
- [ ] Network error recovery
- [ ] Cancel import during preview

### Edge Cases (30 min)

- [ ] Empty blueprint export/import
- [ ] Maximum resources (boundary)
- [ ] Special characters in names
- [ ] Concurrent operations

---

## Success Criteria

The blueprint export/import feature is considered production-ready when:

### Functional Requirements

- [ ] Export creates valid PNG file with embedded resources
- [ ] Import detects missing resources and shows preview dialog
- [ ] Conflict resolution works correctly (3 options)
- [ ] Characters tab displays linked/missing characters
- [ ] Round-trip export/import preserves all data

### Security Requirements

- [ ] All 8 security vulnerabilities are mitigated
- [ ] Size limits enforced (5MB/resource, 10MB/total)
- [ ] Malicious inputs rejected with clear error messages
- [ ] No XSS vectors (all content escaped)
- [ ] Rate limiting prevents server overload

### Quality Requirements

- [ ] All files under 400-line limit (except blueprint-utils.js pre-existing)
- [ ] All functions under 50-line limit
- [ ] No duplicate code blocks >10 lines
- [ ] Shared utilities properly extracted

### Compatibility Requirements

- [ ] v1.0.0 PNG format imports correctly
- [ ] Extended format imports correctly
- [ ] Format detection logged and accurate
- [ ] Graceful fallback on format errors
- [ ] No breaking changes to existing features

---

## Test Report Template

After testing, document results in:

```
Testing/TEST-RESULTS-blueprint-export-import.md
```

**Template:**

```markdown
# Test Results: Blueprint Export/Import

**Date:** [Date]
**Tester:** [Name]
**Environment:** SillyTavern [Version]

## Summary

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|----------|
| Critical Path | 4 | | | |
| Security | 8 | | | |
| Regression | 5 | | | |
| Integration | 4 | | | |
| Edge Cases | 4 | | | |

## Detailed Results

### [Test Name]

**Status:** PASS / FAIL / BLOCKED

**Steps Taken:**
1.
2.
3.

**Expected Results:**
-
-

**Actual Results:**
-
-

**Evidence:**
- Screenshot:
- Console output:
- File generated:

**Issues Found:**
-

**Fix Required:** YES / NO

---

## Recommendations

[Summary of any fixes needed, production readiness assessment]
```

---

## Known Limitations Requiring Testing

These items from the FIX report require manual verification:

1. **CQ-001: Avatar ID Generation**
   - `importPersona()` uses simplified naming: `${personaData.name}.png`
   - **Test:** Import blueprint with persona, check `power_user.personas` keys
   - **Expected:** Avatar ID matches SillyTavern's actual naming format
   - **Fix if broken:** Adjust naming logic based on actual behavior

2. **CQ-003: Server Endpoint Verification**
   - Uses `/api/characters/import` endpoint
   - **Test:** Export blueprint with character, attempt import
   - **Expected:** Character imports successfully
   - **Fix if broken:** Verify endpoint exists or use alternative import method

---

## Troubleshooting

### Export Issues

**Problem:** Export button not visible
- **Check:** Blueprint loaded in editor
- **Check:** Browser console for JavaScript errors

**Problem:** Download doesn't start
- **Check:** Browser download settings
- **Check:** Popup blocker not blocking

**Problem:** File corrupted
- **Check:** Available disk space
- **Check:** Network stability

### Import Issues

**Problem:** Import preview dialog doesn't appear
- **Check:** PNG has extended format metadata
- **Check:** Browser console for errors
- **Check:** File size under 10MB

**Problem:** Character thumbnails not loading
- **Check:** Avatar paths are valid
- **Check:** Browser console for 404 errors
- **Check:** CORS issues

**Problem:** Import fails silently
- **Check:** Browser console for errors
- **Check:** Network tab for failed requests
- **Check:** Server logs

### Performance Issues

**Problem:** Export takes very long
- **Check:** Number and size of embedded resources
- **Check:** Browser performance (DevTools → Performance)

**Problem:** Import is slow
- **Check:** Rate limiting delays (expected 500ms between items)
- **Check:** Network latency
- **Check:** Server response time

---

## Sign-Off Criteria

The blueprint export/import feature is approved for production when:

- [ ] All Critical Path tests pass (4/4)
- [ ] All Security tests pass (8/8)
- [ ] All Regression tests pass (5/5)
- [ ] Integration tests pass (4/4)
- [ ] No critical bugs found
- [ ] Known limitations documented and acceptable
- [ ] Performance is acceptable

**Approved By:** ___________________ **Date:** __________

---

**End of Testing Plan**

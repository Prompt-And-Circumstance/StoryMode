# Wizard Status Log Enhancement

**Date:** 2026-01-27
**Feature:** Detailed real-time status updates during blueprint generation

---

## Summary

Added a detailed status log panel to the blueprint generation wizard that shows real-time progress including:
- Which API profile is being used for each phase
- Prompt token counts and response sizes
- Current generation status (preparing prompt, waiting for response, parsing, etc.)
- Success/warning/error indicators with timestamps

## Changes Made

### Files Modified (3)

1. **lib/dialog/wizard.js** (~50 lines)
   - Added status log UI container
   - Added `addWizardStatusLog()` function to append timestamped log entries
   - Added event listener for `STORY_MODE_GENERATION_STATUS` events
   - Enhanced `updateWizardProgress()` to accept custom status messages

2. **lib/generation/orchestration.js** (~80 lines)
   - Added `eventSource` import from `/script.js`
   - Added `emitStatusEvent()` helper function
   - Modified `executePhase()` to emit detailed status at key points:
     - Phase started
     - Prompt prepared (with token estimate and API profile)
     - Waiting for response (with max token limit)
     - Response received (with character/token counts)
     - Parsing and validating
     - Phase completed or error

3. **lib/ui/components/wizard.js** (~5 lines)
   - Removed generic ">>>>> GENERATING" message (replaced by detailed log)

**Total Lines Changed:** ~135 lines

---

## New UI Components

### Status Log Panel

Located between the progress indicator and preview panel:

```
┌─────────────────────────────────────────────────────┐
│ Phase 1/4: Foundation                               │ ← Main status
├─────────────────────────────────────────────────────┤
│ ● ● ● ○ Progress Indicator                          │
├─────────────────────────────────────────────────────┤
│ ╔═══════════════════════════════════════════════╗   │ ← NEW: Status Log
│ ║ [14:23:01] ⟳ Starting Foundation phase...    ║   │   (auto-scrolls)
│ ║ [14:23:02] ⟳ Prompt prepared (~2,341 tokens) ║   │
│ ║            → sending to claude-opus-4         ║   │
│ ║ [14:23:02] ⟳ Waiting for response from       ║   │
│ ║            claude-opus-4 (max 8192 tokens)... ║   │
│ ║ [14:23:18] ✓ Response received (12,453 chars,║   │
│ ║            ~3,113 tokens)                     ║   │
│ ║ [14:23:18] ⟳ Parsing and validating...       ║   │
│ ║ [14:23:19] ✓ Foundation phase completed      ║   │
│ ╚═══════════════════════════════════════════════╝   │
├─────────────────────────────────────────────────────┤
│ Preview Panel (blueprint data as it arrives)        │
└─────────────────────────────────────────────────────┘
```

### Status Entry Format

Each log entry includes:
- **Timestamp**: `[HH:MM:SS]` in 24-hour format
- **Icon**:
  - `⟳` (spinning) = in progress
  - `✓` (checkmark) = success
  - `⚠` (warning) = retry/warning
  - `✗` (cross) = error
- **Color coding**:
  - Blue = info (in progress)
  - Green = success
  - Orange = warning
  - Red = error
- **Message**: Detailed description of current operation

---

## Example Status Log (Full Phase)

```
[14:23:01] ⟳ Starting Foundation phase...
[14:23:02] ⟳ Prompt prepared (~2,341 tokens) → sending to claude-opus-4
[14:23:02] ⟳ Waiting for response from claude-opus-4 (max 8192 tokens)...
[14:23:18] ✓ Response received (12,453 chars, ~3,113 tokens)
[14:23:18] ⟳ Parsing and validating Foundation data...
[14:23:19] ✓ Foundation phase completed successfully
[14:23:19] ⟳ Starting Characters phase...
[14:23:20] ⟳ Prompt prepared (~4,567 tokens) → sending to Main API
[14:23:20] ⟳ Waiting for response from Main API (max 16384 tokens)...
```

### Example with Retry

```
[14:25:01] ⟳ Starting Scenes phase...
[14:25:02] ⟳ Prompt prepared (~6,789 tokens) → sending to gpt-4-turbo
[14:25:02] ⟳ Waiting for response from gpt-4-turbo (max 32768 tokens)...
[14:25:45] ⚠ Scenes attempt 1 failed: Failed to parse JSON response
[14:25:45] ⚠ Retrying Scenes (attempt 2/3)...
[14:25:46] ⟳ Prompt prepared (~6,789 tokens) → sending to gpt-4-turbo
[14:25:46] ⟳ Waiting for response from gpt-4-turbo (max 32768 tokens)...
[14:26:12] ✓ Response received (45,231 chars, ~11,308 tokens)
[14:26:13] ⟳ Parsing and validating Scenes data...
[14:26:14] ✓ Scenes phase completed successfully
```

---

## Event System

### New Event: `STORY_MODE_GENERATION_STATUS`

Emitted from `orchestration.js` during generation with payload:

```javascript
{
    type: 'info' | 'success' | 'warning' | 'error',
    message: 'Human-readable status message',
    timestamp: 1706371381234,
    phase: 1,                    // Optional: phase number
    phaseName: 'Foundation',     // Optional: phase name
    inputTokens: 2341,           // Optional: estimated input tokens
    maxTokens: 8192,             // Optional: max output tokens
    responseLength: 12453,       // Optional: response character count
    responseTokens: 3113,        // Optional: estimated response tokens
    profile: 'claude-opus-4',    // Optional: API profile name
    error: 'Error message'       // Optional: error details
}
```

### Existing Event: `STORY_MODE_PHASE_UPDATE`

Still emitted for high-level phase transitions (unchanged).

---

## API Profile Display

The status log shows which API is being used for each phase:

- **Connection Manager profile**: Shows model name if available, otherwise profile ID
  - `claude-opus-4`, `gpt-4-turbo`, `gemini-pro`, etc.
- **Main API**: Shows "Main API" when no profile override is set
- **Phase overrides**: Automatically reflects user selections from Phase Override Panel

---

## Benefits

### For Users
1. **Transparency**: See exactly what the system is doing at each moment
2. **Troubleshooting**: Identify which phase/API is causing issues
3. **Progress estimation**: Token counts help estimate completion time
4. **Cost awareness**: See token usage in real-time
5. **Multi-model workflows**: Clearly see when different models are used for different phases

### For Developers
1. **Debugging**: Detailed logs help diagnose generation failures
2. **Performance monitoring**: Track response times per phase
3. **API selection validation**: Verify phase overrides are applied correctly
4. **Error context**: Better error messages with generation context

---

## Testing Checklist

### Basic Functionality
- [ ] Status log appears when generation starts
- [ ] Log entries appear in real-time during generation
- [ ] Timestamps are accurate and formatted correctly
- [ ] Icons and colors match message types
- [ ] Log auto-scrolls to show latest entries
- [ ] Log max-height works (scroll within panel if many entries)

### Content Accuracy
- [ ] Phase names displayed correctly (Foundation, Characters, Scenes, Resolutions)
- [ ] API profile names shown correctly
- [ ] Token counts appear reasonable (~4 chars per token)
- [ ] Response sizes shown in both characters and tokens
- [ ] Retry messages appear when phases fail

### Phase Override Integration
- [ ] Default profile shown when no override set
- [ ] Custom profile shown when override applied
- [ ] "Main API" shown when profile set to null/empty
- [ ] Token limits reflect overrides (not defaults)

### Error Handling
- [ ] Parse errors shown with warning icon
- [ ] Final errors shown with error icon and red color
- [ ] Retry attempts numbered correctly (attempt 2/3, etc.)
- [ ] Error messages are informative

### UI/UX
- [ ] Log doesn't obscure important content
- [ ] Log container styled consistently with wizard theme
- [ ] Monospace font makes timestamps/numbers easy to read
- [ ] Log remains visible during cover generation
- [ ] Log persists if user retries a failed phase

---

## Known Limitations

1. **Token estimation**: Input/output tokens are estimates based on character count (divide by ~4)
   - May differ from actual tokens reported by API
   - Different tokenizers (GPT vs Claude vs Gemini) have different ratios

2. **No streaming indication**: Doesn't show partial responses during streaming
   - Only shows "Waiting..." until complete response received
   - Future enhancement: show streaming progress bar

3. **Log persistence**: Log clears when wizard closes
   - Not saved to blueprint metadata
   - User cannot export or copy log
   - Future enhancement: add export button

4. **No phase duration**: Doesn't show elapsed time per phase
   - User can calculate from timestamps manually
   - Future enhancement: add duration to completion messages

---

## Future Enhancements

### High Priority
1. **Streaming progress**: Show progress bar during long responses
2. **Duration tracking**: Display elapsed time for each phase
3. **Export log**: Button to copy/download full generation log

### Medium Priority
4. **Token accuracy**: Use actual token counts from API responses when available
5. **Cost estimation**: Show estimated cost based on API pricing
6. **Log search**: Filter log entries by type or keyword
7. **Collapsible log**: Allow user to hide log if they prefer minimal UI

### Low Priority
8. **Log persistence**: Save log to blueprint metadata
9. **Performance graphs**: Visualize token usage and response times
10. **Diff view**: Compare prompt/response between retry attempts

---

## Rollback Plan

If issues arise, revert with:

```bash
git checkout HEAD~1 -- lib/dialog/wizard.js
git checkout HEAD~1 -- lib/generation/orchestration.js
git checkout HEAD~1 -- lib/ui/components/wizard.js
```

Or disable by commenting out event listener in `wizard.js`:

```javascript
// eventSource.on('STORY_MODE_GENERATION_STATUS', handleGenerationStatus);
```

---

## Documentation Updates

### User Documentation

Add to extension README:

```markdown
## Generation Status Log

The blueprint wizard now shows a detailed status log during generation:
- Which AI model is being used for each phase
- Prompt size and response size in tokens
- Real-time progress updates
- Retry attempts and error details

This helps you understand what's happening and troubleshoot any issues.
```

### Developer Documentation

Add to ARCHITECTURE.md:

```markdown
## Wizard Status Events

The orchestration layer emits `STORY_MODE_GENERATION_STATUS` events during
blueprint generation. The wizard listens to these events and displays them
in a scrollable log panel.

Event payload includes type (info/success/warning/error), message, timestamp,
and optional metadata (phase, tokens, API profile, etc.).
```

---

## Sign-Off

**Developer:** Claude Sonnet 4.5
**Implementation Date:** 2026-01-27
**Status:** Complete - Ready for Testing
**Risk Level:** Low (additive feature, doesn't change core logic)

**Next Steps:**
1. Test in development environment
2. Verify with different API profiles
3. Test retry scenarios
4. Update user documentation
5. Merge to main branch

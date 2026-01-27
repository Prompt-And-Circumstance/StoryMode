# Context: Phase Override Panel Feature

**Quick Reference:** What was implemented and why
**Status:** ✅ Implementation complete, awaiting manual testing
**Date:** 2026-01-27

---

## 30-Second Summary

Added a collapsible UI panel that lets users override which AI model and how many tokens are used for each of the 4 blueprint generation phases. Also fixed the previously non-functional "Opening Message Profile" setting in API Settings.

---

## What It Does

### User Perspective
Users can now:
1. **Choose different AI models per phase** - Use GPT-4 for planning, Claude for writing, etc.
2. **Adjust token limits per phase** - Give more tokens to complex phases, fewer to simple ones
3. **Use "Main API" option** - Bypass Connection Manager if it causes issues
4. **See what's overridden** - Real-time status indicators show default vs custom settings
5. **Generate opening messages with specific profiles** - Editor's "Generate Opening Message" respects API Settings

### Technical Perspective
- Per-phase profile and token overrides for 4-phase blueprint generation
- Session-only state (doesn't persist between wizard sessions)
- Retry logic preserves profile while doubling tokens
- Backward compatible (empty overrides = default behavior)

---

## Key Files Changed

```
lib/ui/components/phase-override-panel.js     [NEW] UI component (242 lines)
lib/ui/components/blueprint-tabs.js           [+7] Panel integration
lib/dialog/settings-handlers.js               [+6] Event handlers
lib/dialog/wizard.js                          [+58] Form data & retry logic
lib/blueprint/module.js                       [+2] Parameter threading
lib/generation/orchestration.js               [+49] Override application + opening msg fix
```

**Total:** ~366 lines changed across 7 files

---

## Data Flow (Quick Reference)

```
UI Panel
  ↓ getWizardFormData()
phaseOverrides = { 1: {profileId, maxTokens}, 2: {...}, 3: {...}, 4: {...} }
  ↓ wizard.js → module.js → orchestration.js
executePhase(phase, ..., phaseOverrides)
  ↓
effectiveProfileId = override?.profileId ?? default
effectiveMaxTokens = override?.maxTokens ?? PHASE_CONFIG[phase].maxTokens
  ↓
if (!effectiveProfileId) → generateRaw() [Main API]
else → generateWithPreset(profileId) [Connection Manager]
```

---

## Important Design Decisions

### 1. Why Only 4 Phases (No Opening Message Row)?
**Decision:** Removed opening message from override panel

**Reason:** Opening message is generated TWO ways:
- **Wizard:** Part of Phase 4 JSON → uses Phase 4's override ✅
- **Editor:** Manual "Generate Opening Message" button → uses `openingMessageApi` setting ✅

Having a 5th row was confusing since wizard users never need it. Editor users configure it in API Settings.

### 2. Why Session-Only State?
**Decision:** Overrides reset when wizard closes (not saved to extension settings)

**Reason:** Per plan requirements - overrides are for fine-tuning specific generations, not global preferences. Global preferences go in Blueprint Settings.

### 3. Why Allow Null ProfileId?
**Decision:** Empty string or null in profile dropdown = "Main API"

**Reason:** Gives users escape hatch if Connection Manager profiles cause issues. Falls back to SillyTavern's main API via `generateRaw()`.

### 4. Why Double Tokens on Retry?
**Decision:** Retry preserves profile but doubles tokens each time

**Reason:** If generation fails, likely needs more context/tokens. Doubling progression:
- User sets 4096 → Fails → Retry 1: 8192 → Fails → Retry 2: 16384 (capped at 65536)
- Preserves profile selection (user's choice) while increasing capacity
- Prevents losing profile when switching to higher token count

---

## Code Patterns Used

### 1. Optional Chaining for Safety
```javascript
const phaseOverride = phaseOverrides?.[phase] || {};
const effectiveProfileId = phaseOverride.profileId !== undefined
    ? phaseOverride.profileId
    : selectedProfileId;
```

### 2. Null Profile Fallback
```javascript
if (!effectiveProfileId) {
    // Use Main API
    rawText = await generateRaw(fullPrompt, '', false, false, systemPrompt);
} else {
    // Use Connection Manager
    rawText = await callLLMForPhase(phase, prompt, systemPrompt, effectiveMaxTokens, effectiveProfileId);
}
```

### 3. Token Validation with Clamping
```javascript
const validateTokens = (value, defaultValue) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < MIN_TOKENS) return defaultValue;
    return Math.min(parsed, MAX_TOKENS);
};
```

---

## Testing Checklist (Quick)

**Must Test Before Production:**
- [ ] UI panel expands/collapses
- [ ] Profile dropdown populates
- [ ] Token validation (min/max)
- [ ] Override actually changes which API is used
- [ ] Retry preserves profile + doubles tokens
- [ ] "Main API" bypasses Connection Manager
- [ ] Opening message respects API Settings profile
- [ ] Normal generation (no overrides) still works

**See:** `HANDOVER_PHASE_OVERRIDE_PANEL.md` for complete test matrix

---

## Common Gotchas

### For Developers

1. **phaseOverrides is NOT phaseTokenOverrides**
   - Old parameter name changed to support both profile + tokens
   - Search codebase for `phaseTokenOverrides` to find any stragglers

2. **Opening Message Has Two Paths**
   - Wizard: Part of Phase 4 (uses Phase 4 override)
   - Editor: Separate function (uses `openingMessageApi` setting)
   - Don't try to apply Phase 5 override - it doesn't exist!

3. **Empty String vs Null vs Undefined**
   - `""` or `null` in profileId = Main API (intentional)
   - `undefined` in profileId = Use default from Blueprint Settings
   - Check with `!== undefined`, not just `if (profileId)`

4. **Retry Doubles from Current Override**
   - Each retry doubles from the **last attempt's tokens**, not original user value
   - Example: 4096 → 8192 → 16384 (exponential growth, capped at 65536)

### For Users

1. **Overrides Don't Save**
   - Session-only by design
   - Want permanent changes? Set in Blueprint Settings (default profile)

2. **Opening Message Not in Panel**
   - Wizard: Generated in Phase 4 (use Phase 4's settings)
   - Editor: Configure in API Settings → Opening Message Profile

3. **"Main API" Is a Feature, Not a Bug**
   - Select this if Connection Manager profiles cause errors
   - Uses SillyTavern's default API configuration

---

## Quick Debug Commands

```javascript
// Check if panel is rendered
$('.storymode-phase-override-panel').length > 0

// Check panel state
$('.phase-override-content:visible').length  // 1 = expanded, 0 = collapsed

// Get current overrides
$('#phase_1_profile').val()  // Profile ID or empty string
$('#phase_1_tokens').val()   // Token count

// Check phaseOverrides object (in wizard code)
console.log(config.phaseOverrides)
```

---

## Related Documents

- **HANDOVER_PHASE_OVERRIDE_PANEL.md** - Complete handover plan with testing matrix
- **ARCHITECTURE.md** - Overall system architecture (update with this feature)
- **CODEINDEX.md** - File structure (update with new files)
- **Planning/README.md** - Original feature plan

---

## One-Liner for Future Reference

"Added per-phase API profile and token overrides to blueprint wizard + fixed opening message profile setting"


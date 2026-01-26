# Genre Mashup Generator

Please provide 2-3 genres you would like to mash up (e.g., Cowboys, Hard SciFi, Pulp Romance):

---

Based on your selected genres, build a comprehensive genre description following this schema:

Name: [Creative mashup name]

CATEGORY Tags: [Relevant category tags]

STORY PROMPT:
[2-3 sentence overview combining all genre elements with their key characteristics and conflicts]

***Thematic Hook:*** [Core premise that integrates all genres - what kind of protagonist faces what kind of challenge that combines genre elements]

***Narrative Scope:*** [Range of story scale from personal to epic]

***Tone:*** [4-6 descriptive tone words separated by commas]

***Tropes:*** [8-10 genre-specific tropes that emerge from the mashup, separated by commas]

***Literary Devices:*** Foreshadowing: [approach], Symbolism: [approach], Irony: [approach]

***Subgenre:*** [Specific subgenre classification]

***Pacing:*** [Pacing description]

***POV:*** [Point of view approach]

***Structure:*** [Narrative structure approach]

***Priority:*** [Top priority] > [Second priority] > [Third priority]

## Narrative Arc Phases

PROGRESS TEMPLATE:
Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).

### SETUP PHASE (FIRST ~33% OF THE STORY):
[4-6 sentences describing how the story opens, introducing setting with genre-specific elements, protagonist type, inciting incident, and initial stakes. Show how the genres integrate in the opening.]

### CONFRONTATION PHASE (MIDDLE ~33%):
[4-6 sentences describing escalating conflicts that blend genre elements, obstacles and challenges specific to the mashup, character development moments, and rising tension. Show how genre conflicts interweave.]

### RESOLUTION PHASE (FINAL ~33%):
[4-6 sentences describing the climactic confrontation that synthesizes all genre elements, final challenges, resolution approach, and thematic payoff. Show how the genres culminate together.]

---

## JSON Export Format

After generating the genre mashup above, also provide an importable JSON version following this schema:

```json
{
  "id": "[lowercase_snake_case_mashup_name]",
  "name": "[Display Name from above]",
  "category": ["[Category1]", "[Category2]"],
  "storyPrompt": "[Combine the overview and all *** sections into a single string, using \\n for line breaks]",
  "progressTemplate": "Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).",
  "phasePrompts": {
    "setup": "[SETUP PHASE content condensed to 2-3 sentences]",
    "confrontation": "[CONFRONTATION PHASE content condensed to 2-3 sentences]",
    "resolution": "[RESOLUTION PHASE content condensed to 2-3 sentences]"
  }
}
```

### Example JSON Output

For a "Space Western Noir" mashup:

```json
{
  "id": "space_western_noir",
  "name": "Space Western Noir",
  "category": ["Sci-Fi", "Western", "Noir"],
  "storyPrompt": "Dusty frontier planets where gunslingers pilot rusted starships and corruption runs deeper than any canyon. Cynical drifters chase bounties through lawless colonies where corporations are the new railroad barons.\n***Thematic Hook:*** A morally gray bounty hunter navigates lawless frontier worlds where mega-corps have replaced railroad barons and justice is whatever you can enforce.\n***Narrative Scope:*** Intimate to planetary, always personal stakes.\n***Tone:*** Cynical, Gritty, Melancholic, Atmospheric, Frontier-rugged.\n***Tropes:*** Lone gunslinger, Corrupt frontier town, Hidden past, Femme fatale, Showdown at high noon, Corporate villainy.\n***Literary Devices:*** Foreshadowing: Heavy and ominous, Symbolism: Stars as empty promises, Irony: Dark and bitter.\n***Subgenre:*** Frontier noir, Character-driven.\n***Pacing:*** Methodical with explosive bursts.\n***POV:*** First-person hardboiled or close third.\n***Structure:*** Investigation/hunt-based with western showdowns.\n***Priority:*** Atmosphere > Character depth > World-building.",
  "progressTemplate": "Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).",
  "phasePrompts": {
    "setup": "Establish the lawless frontier world—dusty spaceports, corrupt officials, desperate settlers. Introduce the cynical protagonist and the job that pulls them back into trouble.",
    "confrontation": "The hunt intensifies across hostile planets. Betrayals mount, old enemies resurface, and the protagonist discovers the job is far more dangerous than advertised.",
    "resolution": "The final showdown arrives under alien stars. Justice is served frontier-style, but victory tastes like dust and regret. The protagonist rides off toward the next horizon."
  }
}
```

---

## Output Instructions

After generating the genre mashup:

1. **Display the formatted description** (Name, Category, Story Prompt, Phases, etc.)
2. **Display the JSON** in a code block for easy copying
3. **Offer to download** by saying: "Would you like me to provide this as a downloadable JSON file?"
4. If yes, **create a downloadable file** using your file creation capabilities (canvas/artifact) named `[mashup_id]_story_type.json`

**Import instructions for the user:**
> To import this story type into Story Mode:
> 1. Open the Story Mode settings dialog
> 2. Go to **Genre & Style** → **Story Arc** tab
> 3. Click the **✏️ Edit** button next to the Story Type dropdown
> 4. Click **Import JSON** and select your downloaded file
> 5. The new story type will appear in all Story Type dropdowns

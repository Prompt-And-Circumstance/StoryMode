# Author Style Generator

Please describe the author or writing style you'd like to emulate. You can specify:
- A specific author's name (e.g., "Stephen King", "Jane Austen")
- A writing style description (e.g., "noir detective fiction", "cozy mystery")
- A combination of influences (e.g., "Hemingway's minimalism with Gothic atmosphere")

---

Based on your input, create a comprehensive author style definition following this exact JSON schema. You can output either a single object or an array (both formats are supported for import):

```json
{
  "id": "[lowercase_snake_case_unique_identifier]",
  "name": "[Display Name - author name or style title]",
  "category": ["[Category1]", "[Category2 if applicable]"],
  "authorPrompt": "[Detailed writing style instructions - see guidelines below]",
  "nsfwPrompt": "[Guidelines for handling romantic/mature content in this style]",
  "keywords": ["[keyword1]", "[keyword2]", "[keyword3]", "[keyword4]", "[keyword5]"]
}
```

## Field Guidelines

### id
- Use lowercase letters and underscores only
- For authors: `firstname_lastname` (e.g., `stephen_king`)
- For styles: `descriptive_style_name` (e.g., `noir_detective`)

### name
- For authors: Full name as commonly known
- For styles: Descriptive title (e.g., "Gothic Horror", "Cozy British Mystery")

### category
- 1-3 relevant categories that help users find this style
- Examples: "Horror", "Literary Fiction", "Romance", "Thriller", "Comic Fantasy", "Hard SF", "Victorian", "Noir", "YA"

### authorPrompt
This is the core instruction that guides the AI's writing. Include:

1. **Opening directive**: "Write in a style inspired by [Author/Style]."

2. **Prose characteristics**: Sentence structure, rhythm, complexity
   - Long/short sentences? Complex/simple? Flowing/staccato?

3. **Narrative voice**: POV tendencies, distance, tone
   - First/third person? Close/distant? Warm/detached?

4. **Descriptive approach**: How setting, action, and emotion are rendered
   - Sparse/lush? Sensory focus? Symbolic?

5. **Dialogue style**: How characters speak
   - Naturalistic/stylized? Dialect? Subtext-heavy?

6. **Distinctive techniques**: Signature elements that define this style
   - Specific literary devices, structural quirks, thematic preoccupations

7. **Atmosphere/mood**: The overall feeling the prose should evoke

### nsfwPrompt
Guidance for handling romantic or mature content that fits the style:
- How explicit/implicit should intimacy be?
- What's the emotional vs. physical focus?
- What would feel authentic vs. out-of-place for this style?

### keywords
5-8 searchable terms including:
- Author name or key works (if applicable)
- Genre markers
- Distinctive techniques
- Mood/atmosphere descriptors

---

## Example Output

For input "Raymond Chandler":

```json
{
  "id": "raymond_chandler",
  "name": "Raymond Chandler",
  "category": ["Noir", "Hardboiled Detective"],
  "authorPrompt": "Write in a style inspired by Raymond Chandler.\nUse a first-person narrative voice that is world-weary yet morally centered, observing corruption with sardonic detachment. Favor sharp, rhythmic sentences that balance tough-guy terseness with sudden poetic imagery—similes that illuminate character through unexpected comparisons. Let Los Angeles (or your setting) become a character: describe its geography, weather, and social strata with precise, atmospheric detail.\n\nDistinctive techniques to employ:\n- Similes that reveal character through vivid, often dark comparisons\n- Dialogue that crackles with subtext, threats veiled in politeness\n- A protagonist who maintains personal integrity despite systemic corruption\n- Scene-setting that uses light, shadow, and architecture to create mood\n- Occasional philosophical asides delivered in clipped, quotable prose\n- Violence described with clinical brevity, aftermath with emotional weight",
  "nsfwPrompt": "Handle attraction with charged tension and implication rather than explicit detail. Femme fatales are dangerous and alluring; romantic encounters should feel like another kind of danger. Keep bedroom scenes brief and suggestive—a closed door, rumpled sheets, morning-after regret—focusing on the emotional and moral aftermath rather than physical mechanics.",
  "keywords": ["noir", "hardboiled", "detective", "Los Angeles", "Marlowe", "cynical", "atmospheric", "first-person"]
}
```

---

## Output Instructions

After generating the author style JSON:

1. **Display the JSON** in a code block for review
2. **Offer to download** by saying: "Would you like me to provide this as a downloadable JSON file?"
3. If yes, **create a downloadable file** using your file creation capabilities (canvas/artifact) named `[author_id]_style.json`

**Import instructions for the user:**
> To import this author style into Story Mode:
> 1. Open the Story Mode settings dialog
> 2. Go to **Genre & Style** → **Author Style** tab
> 3. Click the **✏️ Edit** button next to the Author Style dropdown
> 4. Click **Import JSON** and select your downloaded file
> 5. The new style will appear in all Author Style dropdowns

# Story Mode Extension for SillyTavern

**Version:** 0.1 (Initial Release)

## Overview

Story Mode is a extension for SillyTavern that provides intelligent story arc progression and asks the LLM to tell you a story in the style of popular genre writers. It injects context-aware prompts into your chat to guide the AI through the narrative of a story arc. It aims for proper pacing, thematic consistency, and genre-appropriate storytelling. Also include automatically generated epilogues and summaries.

Can also be used without the story arc feature to have the LLM adopt the style of an author for each method.

## Key Features

### 📖 Story Arc System
- **25+ Pre-defined Story Types** including:
  - Mystery (Noir Detective, Murder Mystery, Cozy Mystery Adventure)
  - Horror (Cosmic Horror, Survival Horror, Folk Horror)
  - Fantasy (Epic Fantasy, Urban Fantasy, Portal Fantasy, Fairy Tale Retelling)
  - Sci-Fi (Cyberpunk Thriller, Space Opera, Hard Sci-Fi, Time Travel)
  - Romance (Romantic Drama, Paranormal Romance, Gothic Romance)
  - Action (Action Thriller, Spy Thriller, Superhero)
  - Drama (Coming of Age, Medical Drama, Legal Drama, Sports Drama, Slice of Life)
  - And many more!

- **Three-Act Structure**: Each story type follows a classic narrative arc:
  - **Setup** (~33%): Establish world, characters, and conflict
  - **Confrontation** (~33%): Escalate stakes and challenges
  - **Resolution** (~33%): Climax and conclusion

- **Automatic Progress Tracking**: Monitors story progression through chat metadata
- **Phase-Specific Guidance**: AI receives tailored instructions for each story phase
- **Configurable Arc Length**: Set your story to 5-50 messages

- **Epilogue**: Wrap everything up with a automatically generated epilogue.
- **Autossummary**: Have a summary of the story automatically generated at the end of the story arc.

### 🎭 Author Style Emulation
- Apply specific writing styles independently of story type
- NSFW/Heat guidance support for mature content, this tailored by author style - some a very low heat, others are more spicy.
- Searchable style library with categories
- Combine any author style with any story type

### 🛠️ Customization
- **Full Editor Suite**: Create, edit, and manage custom story types
- **Import/Export**: Share your custom story types and author styles as JSON
- **Revert to Defaults**: Restore original story type definitions
- **Fuzzy Search**: Quickly find story types and styles using Fuse.js

### 📊 Progress Monitoring
- Real-time arc progress display
- Phase indicators (Setup/Confrontation/Resolution)
- Percentage completion tracking
- Visual progress badges

### ⚙️ Advanced Configuration
- **Injection Control**: Choose where prompts are injected
  - In Prompt
  - In Chat (at configurable depth)
  - Before Prompt
- **Role Assignment**: System, User, or Assistant role injection
- **Post-Arc Options**:
  - Auto-epilogue when arc completes
  - Offer story summary after epilogue
- **Live Preview**: See exactly what will be injected into the AI prompt

## Installation

1. Use the "Install Extension' button and enter the address of this resposity:
https://github.com/Prompt-And-Circumstance/StoryMode

2. The Story Mode panel will appear in your Extensions settings (Extensions > Story Mode)

## Quick Start

1. **Enable Story Mode**: Check the "Enable Story Mode" box in the main panel

2. **Enable Story Arc**: Open Story Mode Settings and enable "Enable Story Arc"

3. **Select a Story Type**: Choose from the dropdown (e.g., "Epic Fantasy", "Noir Detective")

4. **Set Arc Length**: Use the slider to set how many AI messages your story should span (default: 15)

5. **Optional - Add Author Style**: Enable "Author Style" and select a writing style

6. **Start Your Story**: Begin chatting! The extension will automatically guide the narrative

## Usage Guide

### Story Arc Progression

Story Mode tracks progress automatically:
- Each AI response advances the story by one step
- The AI receives different guidance based on the current phase, with all story arcs having a three act structure (set up, development, resolution)
- Progress persists per-chat in chat metadata.

### Story Type Anatomy

Each story type includes:
- **Thematic Hook**: Core premise and narrative focus
- **Narrative Scope**: Scale of the story (intimate, epic, etc.)
- **Tone**: Emotional atmosphere and mood
- **Tropes**: Common genre conventions
- **Literary Devices**: Foreshadowing, symbolism, irony usage
- **Pacing**: Speed and rhythm guidance
- **POV Suggestions**: Recommended perspective
- **Structure**: Narrative organization approach
- **Priority**: What matters most in this genre

### Editing Story Types

1. Click the pencil icon next to the Story Type dropdown
2. Search or browse existing story types
3. Click "Add Story Type" to create custom types
4. Edit any story type to customize:
   - Name and categories
   - Complete story blueprint
   - Progress template
   - Phase-specific prompts
5. Use "Revert to Default" on built-in types to restore originals

### Author Styles

Author styles are independent of story types and control:
- Voice and tone
- Prose style and rhythm
- Description approaches
- Dialogue patterns
- Optional NSFW/mature content handling

Mix and match: Use "Noir Detective" story type with any author's writing style!

### Injection Settings

**Position**:
- **In Prompt**: Injected into the system prompt area
- **In Chat**: Injected at a specific depth in message history
- **Before Prompt**: Injected before the main prompt

**Depth** (for In Chat): How many messages from the end to inject (0 = at the very end)

**Role**:
- **System**: Invisible meta-instructions
- **User**: As if the user said it
- **Assistant**: As if the AI said it

## Import/Export

### Exporting
- Click "Export JSON" in the story types or author styles editor
- Downloads a timestamped JSON file
- Share with other users or back up your custom content

### Importing
- Click "Import JSON"
- Select a JSON file
- Duplicate IDs will be overwritten with imported versions

## Technical Details

### How It Works

1. **Prompt Injection**: Uses SillyTavern's `setExtensionPrompt` API
2. **Progress Tracking**: Stores state in `chat_metadata`
3. **Event Hooks**:
   - `GENERATION_STARTED`: Updates prompt before generation
   - `MESSAGE_RECEIVED`: Advances arc progress
   - `CHAT_CHANGED`: Reloads state for new chat
4. **Regeneration Detection**: Prevents double-counting on message regeneration, this doesn't work perfectly yet.

### Data Storage

- **Story Types & Author Styles**: Saved in `extension_settings.story_mode`
- **Arc Progress**: Saved per-chat in `chat_metadata.story_mode`
- **Settings**: Persist across sessions via SillyTavern's settings system

## Prompt Preview

The settings dialog includes a live preview showing exactly what will be injected:

```
<story>
[Story Blueprint with all thematic elements]

Arc Progress: Step 5/15 (33% complete). Phase: setup - Message 5/5 (100% through setup).

[Phase-specific guidance for current phase]
</story>

<style>
[Author style guidance]
[NSFW guidance if enabled]
</style>
```

## Tips & Best Practices

1. **Arc Length**:
   - Short stories: 10-15 messages
   - Medium stories: 20-30 messages
   - Long sagas: 40-50 messages
   - Group chats: factor this up for the number of participants, eg 150 messages for a long story with three people.

2. **Reset Arc**: Use the "Reset Arc" button when starting a new story in the same chat

3. **Response Length**: Use a preset to set the length of responses for each message in the story. Generate a novella with long messages and a long arc length.

4. **Mix & Match**: Try different story type + author style combinations

5. **Preview Changes**: Always check the Prompt Preview after making changes

6. **Custom Types**: Start by duplicating and modifying an existing story type

7. **Scenarios**: Start with your favorite scenaro and take it for a spin.

## Known Limitations (v0.1)

- Impersonation and regeneration isn't yet caught properly. These are likly to advance the arc without a story message being generated.
- Story types must be manually selected; no auto-detection
- No support for nested or branching arcs
- Phase boundaries (set up, build, resolution) are fixed at 33% intervals

## Future Roadmap

Potential features for future releases:
- Dynamic arc length adjustment
- Multi-arc support (story seasons)
- Character arc tracking separate from plot arc
- Auto-detection of genre from chat content
- Collaborative story type creation tools
- Community story type repository

## Troubleshooting

**Story not progressing**: Ensure "Enable Story Mode" and "Enable Story Arc" are both checked

**AI ignoring guidance**: Try changing injection position to "In Prompt" or reducing depth

**Progress not tracked**: Check that you're not in a swipe/regeneration loop

**Custom types not saving**: Verify you clicked Save/Add in the edit form

**Styles not appearing**: Check that the search box is empty or matches your style

**Arcs progressing to fast**: Use continue instead of regeneration.

## Contributing

To contribute custom story types or author styles:
1. Create your custom content in the editors
2. Export to JSON
3. Share the JSON file with the community
4. Others can import directly into their Story Mode

## Credits

**Story Mode Extension Team**

Built for SillyTavern with ❤️

## Version History

### v0.1 (Initial Release)
- 25 pre-defined story types across 10+ genres
- Author style system with NSFW support
- Three-phase narrative arc structure
- Full CRUD editor for story types and styles
- Import/export functionality
- Configurable injection system
- Progress tracking with regeneration detection
- Live prompt preview
- Post-arc epilogue and summary options

## License

This extension is part of the SillyTavern ecosystem.

---



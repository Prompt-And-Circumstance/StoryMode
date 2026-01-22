# Changelog

All notable changes to Story Mode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-22

### Added

**Core Features**
- 43 pre-defined story types across Mystery, Horror, Fantasy, Sci-Fi, Romance, Action, Drama, and more
- Author style emulation system with optional NSFW/mature content guidance
- Three-phase narrative arc structure (Setup → Escalation → Resolution)
- Configurable arc length (5-150 rounds)

**Scenario Blueprints**
- LLM-generated narrative plans with multi-scene progression
- Beat-level tracking within scenes using signal markers (`@@BEAT:N@@`, `@@NEXT_SCENE@@`)
- Phased wizard for blueprint generation (Foundation → Characters → Scenes → Resolutions)
- Opening message generation per blueprint
- Cover art generation via Stable Diffusion integrations

**Scenario Library**
- File-backed storage using SillyTavern's file API (cross-browser compatible)
- PNG steganography for blueprint storage (metadata embedded in images)
- Import/export blueprints as shareable PNG files
- Folder organization (All, Favorites, Recently Played)
- Search and sort capabilities

**Editor & Customization**
- Full CRUD editor for story types and author styles
- Blueprint editor with tabbed interface (Details, Scenes, Cover, Characters)
- Cover gallery with multi-image support
- Scene reordering via drag-and-drop

**Post-Arc Features**
- Automatic epilogue generation when arc completes
- Chat summarization on demand or at arc completion

**UI/UX**
- Wand menu for quick access to controls
- Story controller panel (floating or docked)
- Live prompt preview showing injected context
- Integration with SillyTavern's theming system

**API & Integration**
- Configurable API profiles for different generation tasks
- Injection position/depth/role settings
- Debug mode for troubleshooting prompt injection

### Technical Notes

- Modular architecture with separated concerns (core, blueprint, dialog, editor, UI)
- Event-driven state management with chat metadata persistence
- Dual pacing modes: round-based (Story Mode) and signal-based (Scenario Mode)
- File-backed storage replaces IndexedDB for better cross-browser compatibility

---

## [0.0.1] - Development

Initial development version. Not for production use.

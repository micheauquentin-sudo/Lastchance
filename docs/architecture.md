# Architecture - Lastchance

## Project Structure

```
lastchance/
├── .claude/                 # Claude Code configuration
│   ├── state/              # Project state tracking
│   │   ├── project-state.md
│   │   ├── checkpoint.md
│   │   └── memory.md
│   └── settings.json       # Claude Code settings (if needed)
├── docs/                   # Documentation
│   ├── architecture.md     # This file
│   ├── roadmap.md
│   ├── bugs.md
│   └── decisions.md
├── CLAUDE.md              # Project context and quick links
└── README.md              # Project overview
```

## Current State

This is a foundational project setup with:
- **No business logic yet** - initialization phase only
- **Memory system** - context tracking via state files
- **Documentation structure** - ready for feature development
- **Git branches** - using `claude/project-template-init-gvkmn5` for development

## Design Principles

1. **Context-First**: All context is stored in memory files for continuity
2. **Decision Tracking**: Architecture decisions recorded in decisions.md
3. **Progress Tracking**: Checkpoints mark completion milestones
4. **Issue Management**: Known bugs tracked in bugs.md
5. **Clear Roadmap**: Development direction in roadmap.md

## Technology Stack

*To be determined during first feature implementation*

## Configuration

- **Branch**: `claude/project-template-init-gvkmn5`
- **Repository**: micheauquentin-sudo/lastchance
- **Platform**: Linux
- **Initialization Date**: 2026-07-06

## Next Steps

1. Feature requirements definition in roadmap.md
2. Initial technology stack selection
3. Development environment setup
4. First iteration development

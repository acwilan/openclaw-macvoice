# AGENTS.md - openclaw-macvoice

Guide for AI assistants working with this codebase.

## Project Overview

`openclaw-macvoice` is an OpenClaw plugin that wraps [voicecli](https://github.com/acwilan/voicecli) to provide voice message support (transcription and TTS) for macOS-based OpenClaw installations.

## Architecture

### Main Entry Point
- `src/index.ts` — Main plugin class and OpenClaw hooks
- Exports `VoicePlugin` class and default OpenClaw plugin object

### Key Classes

#### `VoicePlugin`
- **Purpose**: Wrap voicecli CLI for TypeScript integration
- **Methods**:
  - `transcribe(audioPath)` → Promise<string>
  - `speak(text, options)` → Promise<string>
  - `processVoiceMessage(audioPath, options)` → Combined workflow
  - `cleanup()` → Remove old temp files

### OpenClaw Plugin Hooks

```typescript
export default {
  name: 'macvoice',
  version: '0.1.0',
  init(ctx, config),        // Initialize plugin instance
  onVoiceMessage(ctx, msg), // Handle voice message events
  speak(ctx, text),         // TTS helper
}
```

## Platform Constraints

- **macOS ONLY** — Uses `SFSpeechRecognizer` and `AVSpeechSynthesizer` via voicecli
- Requires voicecli installed via Homebrew
- Temp files stored in `os.tmpdir()/openclaw-voice/`

## Dependencies

- `child_process.exec` — Calls voicecli
- `fs/promises` — File operations
- `os` — Temp directory
- `path` — Path utilities

## Testing

Currently manual:
```bash
npm run build
node -e "const p = require('./dist').default; p.init({}, {}).then(() => console.log('OK'))"
```

## Context for AI Assistants

When modifying this code:
- Maintain macOS-only compatibility (no Linux/Windows fallbacks needed)
- Escape shell arguments properly (see `escapeShellArg()`)
- Clean up temp files periodically
- Handle voicecli not-found errors gracefully
- Keep plugin interface stable for OpenClaw consumers

## Commit Message Format

**MANDATORY**: Use Conventional Commits format.

```
<type>(<scope>): <description>
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Code style
- `refactor:` — Refactoring
- `test:` — Tests
- `chore:` — Build/tooling
- `ci:` — CI/CD changes

**Examples:**
- `feat: add voice selection config`
- `fix: handle spaces in audio file paths`
- `docs: update API examples`
- `ci: add ClawHub publish workflow`

## CI/CD

- **Build**: Runs on pushes/PRs to main
- **Release**: Runs on tags, publishes to npm and ClawHub

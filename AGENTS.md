# AGENTS.md - openclaw-macvoice

Guide for AI assistants working with this codebase.

## Project Overview

`openclaw-macvoice` is an OpenClaw plugin that provides local speech synthesis and audio transcription on macOS via [voicecli](https://github.com/acwilan/voicecli).

## Reference documentation

- [OpenClaw text-to-speech guide](https://docs.openclaw.ai/tools/tts)

## Reference projects

- [OpenClaw Draw Things image generator plugin](/Users/andres/dev/openclaw-draw-things)
- [OpenClaw Deepgram TTS plugin](/Users/andres/dev/openclaw/extensions/deepgram)
- [OpenAI provider plugin](/Users/andres/dev/openclaw/extensions/openai)
- [OpenClaw sources](/Users/andres/dev/openclaw)

## Architecture

### Main Entry Point

- `src/index.ts` exports a `definePluginEntry(...)` plugin definition.
- The plugin registers:
- a provider shell with `api.registerProvider(...)`
- a speech provider (TTS) with `api.registerSpeechProvider(...)`
- a media understanding provider (STT) with `api.registerMediaUnderstandingProvider(...)`

### Key Runtime Pieces

#### Configuration

- `normalizeConfig(rawConfig)` sets defaults:
- `voice: "Samantha"`
- `rate: 0.5`
- `tempDir: join(tmpdir(), "openclaw-macvoice")` unless overridden
- `~` expansion is supported for `tempDir`

#### CLI resolution

- `getVoiceCliPath()` prefers:
- `/opt/homebrew/bin/voicecli`
- `/usr/local/bin/voicecli`
- `voicecli` from `PATH`

#### Speech provider

- `buildMacVoiceSpeechProvider(config)` implements TTS.
- It writes request text to a temp file, invokes `voicecli speak`, then tries `ffmpeg` to convert AIFF output to OGG/Opus.
- If `ffmpeg` succeeds:
- returns `audio/ogg` with `.ogg`
- marks `voiceCompatible` true only for `target === "voice-note"`
- If `ffmpeg` fails:
- falls back to raw AIFF with `audio/aiff`

#### Media provider

- `buildMacVoiceMediaProvider()` implements transcription through `transcribeAudio(...)`.
- It writes the incoming buffer to a temp `.ogg` file under `join(tmpdir(), "openclaw-macvoice")`, runs `voicecli transcribe`, and returns trimmed stdout as `{ text }`.

## OpenClaw Surface

The plugin metadata in code is:

```typescript
export default definePluginEntry({
  id: "macvoice",
  name: "macOS Voice",
  description: "Local speech synthesis and transcription using macOS voicecli",
  register(api) {
    api.registerProvider(...);
    api.registerSpeechProvider(...);
    api.registerMediaUnderstandingProvider(...);
  },
});
```

The packaged plugin manifest lives in `openclaw.plugin.json` and must stay version-aligned with `package.json`.

## Platform Constraints

- macOS only. No Linux or Windows fallback is needed.
- `voicecli` is required.
- `ffmpeg` is optional at runtime but needed for OGG/Opus voice-note output; without it, TTS falls back to AIFF.

## Files That Matter

- `src/index.ts` - plugin entry and all runtime logic
- `openclaw.plugin.json` - packaged plugin metadata and config schema
- `package.json` - scripts, versioning, build metadata
- `src/index.test.ts` - Jest unit tests for plugin registration, TTS, transcription, and fallback behavior

## Dependencies

- `node:child_process.execFile` via `promisify` for `voicecli` and `ffmpeg`
- `node:fs/promises` for temp file creation, reads, and cleanup
- `node:fs.existsSync` for CLI path checks
- `node:os` for `tmpdir()` and `homedir()`
- `node:path` for portable path construction
- OpenClaw plugin SDK types from `openclaw/plugin-sdk`

## Testing

Current checks in the repo:

```bash
npm run build
npm test
```

Important caveat:

- `src/index.test.ts` is now aligned with the current `definePluginEntry` implementation, but it is heavily mocked.
- The test suite validates registration, config normalization paths, `voicecli` invocation flow, transcription flow, and the `ffmpeg` fallback path.
- It does not prove real macOS integration, actual `voicecli` availability, Apple framework permissions, or real `ffmpeg` behavior on the host machine.

## Versioning And Release Scripts

- `npm run version:sync` copies the version from `package.json` into `openclaw.plugin.json`.
- `version:patch`, `version:minor`, and `version:major` in `package.json` now:
- bump `package.json` without auto-tagging
- sync `openclaw.plugin.json`
- regenerate `CHANGELOG.md`
- commit the versioned files
- create a `v<version>` git tag

## Context for AI Assistants

When modifying this code:

- Keep the `definePluginEntry(...)` structure intact unless there is a deliberate plugin SDK migration.
- Preserve the provider id `macvoice`; it is used across code and manifest metadata.
- Prefer `execFile` with argument arrays. Do not switch to shell-string command execution.
- Keep temp-file cleanup in success and error paths.
- Preserve the AIFF fallback when `ffmpeg` is missing or fails.
- Keep config defaults and `~` expansion behavior unless the user explicitly wants a breaking change.
- If you change plugin metadata or config schema, verify `openclaw.plugin.json` and runtime behavior stay aligned.
- If you change versions, use the existing version scripts or update both `package.json` and `openclaw.plugin.json`.

## Commit Message Format

**MANDATORY**: Use Conventional Commits format.

```
<type>(<scope>): <description>
```

**Types:**

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style
- `refactor:` - Refactoring
- `test:` - Tests
- `chore:` - Build/tooling
- `ci:` - CI/CD changes

**Examples:**

- `feat: add voice selection config`
- `fix: handle spaces in audio file paths`
- `docs: update API examples`
- `ci: add ClawHub publish workflow`

## CI/CD

- Build runs on pushes and PRs to `main`
- Release runs on tags and publishes to npm and ClawHub

## Release process

- Do not do until user specifically asks (he should give you a type - major/minor/hotfix, you can suggest one type too).
- Commit your changes, then push
- Inform user and wait for confirmation
- Create tag with appropriate message
- Push tag

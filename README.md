# openclaw-macvoice

OpenClaw plugin for voice message support using native **macOS** speech APIs via [voicecli](https://github.com/acwilan/voicecli).

> ⚠️ **macOS only** — This plugin requires macOS 13.0+ and uses native Apple frameworks (`SFSpeechRecognizer`, `AVSpeechSynthesizer`).

## Features

- 🎙️ **Transcribe voice messages** to text
- 🔊 **Respond with voice** — convert text responses to audio
- 🏠 **Native macOS** — uses `SFSpeechRecognizer` and `AVSpeechSynthesizer`
- ⚡ **Fast** — no cloud API calls, all on-device

## Prerequisites

- **macOS 13.0+** (required)
- [voicecli](https://github.com/acwilan/voicecli) installed:
  ```bash
  brew tap acwilan/voicecli
  brew install voicecli
  ```
- **ffmpeg** (for Telegram voice compatibility):
  ```bash
  brew install ffmpeg
  ```

## First-Time Setup

Before using the plugin, you need to grant macOS permissions to voicecli:

```bash
# Generate a test audio file
voicecli speak "Hello world" --voice Samantha --output /tmp/test.aiff

# Transcribe it back (this triggers the speech recognition permission prompt)
voicecli transcribe /tmp/test.aiff

# Clean up
rm /tmp/test.aiff
```

You should see system permission dialogs for **Microphone** and **Speech Recognition** — click **Allow** for both.

## Installation

Install from [ClawHub](https://clawhub.ai):

```bash
openclaw plugins install macvoice
```

Or install from source:

```bash
openclaw plugins install /path/to/openclaw-macvoice
```

Then restart the OpenClaw gateway:

```bash
openclaw gateway restart
```

## Configuration

Add to your `~/.openclaw/openclaw.json` under `messages.tts`:

```json
{
  "messages": {
    "tts": {
      "auto": "inbound",
      "provider": "macvoice",
      "providers": {
        "macvoice": {
          "voice": "Samantha",
          "rate": 0.5
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auto` | `string` | `"off"` | When to use TTS: `"off"`, `"always"`, `"inbound"` (voice replies to voice messages), or `"tagged"` (only with `[[tts]]` tags) |
| `provider` | `string` | — | Set to `"macvoice"` |
| `providers.macvoice.voice` | `string` | `"Samantha"` | Voice to use. Run `voicecli voices` to see available voices |
| `providers.macvoice.rate` | `number` | `0.5` | Speech rate (0.0-1.0). Lower is slower |
| `providers.macvoice.tempDir` | `string` | `~/tmp/openclaw-macvoice` | Directory for temporary audio files |

### Available Voices

To list available voices:

```bash
voicecli voices
```

Common voices include:
- `Samantha` (default, US English)
- `Alex` (US English)
- `Karen` (Australian English)
- `Daniel` (British English)
- `Moira` (Irish English)
- `Tessa` (South African English)

### Changing Voice

Update your `~/.openclaw/openclaw.json`:

```json
{
  "messages": {
    "tts": {
      "providers": {
        "macvoice": {
          "voice": "Karen",
          "rate": 0.6
        }
      }
    }
  }
}
```

Then reload the gateway:

```bash
openclaw gateway restart
```

## Usage

Once configured, the plugin works automatically:

- **Send a voice message** → OpenClaw transcribes it and can reply with voice (if `auto: "inbound"`)
- **Send a text message** → Normal text reply (unless `auto: "always"`)

Use `[[tts:text]]...[[/tts:text]]` tags in your OpenClaw responses to force voice output for specific messages.

### Limitations

- **Per-agent voice configuration**: OpenClaw does not currently support agent-level TTS voice overrides. The voice is configured globally under `messages.tts.providers.macvoice`. To use different voices, use the `[[tts:voice=...]]` directive tag in your responses (e.g., `[[tts:voice=Karen]]Hello[[/tts:text]]`).

## Platform Support

| Platform | Status |
|----------|--------|
| macOS 13.0+ | ✅ Supported |
| Linux | ❌ Not supported |
| Windows | ❌ Not supported |

## License

MIT

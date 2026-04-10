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

## Installation

```bash
# From OpenClaw skill directory
npm install openclaw-macvoice
```

## Usage

### Basic

```typescript
import macvoice from 'openclaw-macvoice';

// Initialize
const plugin = await macvoice.init(ctx, {
  voice: 'com.apple.voice.compact.en-US.Samantha',
  rate: 0.5,
});

// Transcribe a voice message
const transcription = await plugin.transcribe('/path/to/audio.m4a');
console.log('User said:', transcription);

// Respond with voice
const audioPath = await plugin.speak('Hello, how can I help you?');
// Send audioPath as voice message
```

### With Telegram Channel

```typescript
// In your Telegram OpenClaw handler
import macvoice from 'openclaw-macvoice';

export default {
  async onVoiceMessage(message, ctx) {
    // Initialize if not already
    if (!ctx.macvoice) {
      await macvoice.init(ctx, { rate: 0.5 });
    }
    
    // Transcribe
    const text = await ctx.macvoice.transcribe(message.audioPath);
    
    // Get AI response (your existing logic)
    const response = await ctx.llm.chat(text);
    
    // Convert to voice
    const responseAudio = await ctx.macvoice.speak(response);
    
    // Send voice response
    await ctx.telegram.sendVoice({
      chat_id: message.chat_id,
      voice: responseAudio,
    });
  },
};
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `voice` | `string` | — | Voice identifier (see `voicecli voices`) |
| `rate` | `number` | `0.5` | Speech rate 0.0-1.0 |
| `tempDir` | `string` | `os.tmpdir()` | Directory for temporary audio files |

## API

### `MacVoicePlugin`

#### `transcribe(audioPath: string): Promise<string>`
Transcribe audio file to text.

#### `speak(text: string, options?): Promise<string>`
Convert text to speech. Returns path to generated audio file.

#### `processVoiceMessage(audioPath, options)`
Combined method: transcribe + optionally respond with voice.

## Platform Support

| Platform | Status |
|----------|--------|
| macOS 13.0+ | ✅ Supported |
| Linux | ❌ Not supported |
| Windows | ❌ Not supported |

## License

MIT

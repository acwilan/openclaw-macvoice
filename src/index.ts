import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface VoicePluginConfig {
  /** Voice to use for TTS (see `voicecli voices`) */
  voice?: string;
  /** Speech rate 0.0-1.0 */
  rate?: number;
  /** Temp directory for audio files */
  tempDir?: string;
}

export interface VoiceMessage {
  /** Path to the audio file */
  audioPath: string;
  /** Transcribed text */
  text?: string;
}

export class VoicePlugin {
  private config: VoicePluginConfig;
  private tempDir: string;

  constructor(config: VoicePluginConfig = {}) {
    this.config = {
      rate: 0.5,
      ...config,
    };
    this.tempDir = config.tempDir || path.join(os.tmpdir(), 'openclaw-voice');
  }

  /**
   * Initialize the plugin - ensure temp directory exists
   */
  async init(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
    await this.checkVoiceCli();
  }

  /**
   * Verify voicecli is installed and accessible
   */
  private async checkVoiceCli(): Promise<void> {
    try {
      await execAsync('voicecli --help');
    } catch {
      throw new Error('voicecli not found. Install with: brew install voicecli');
    }
  }

  /**
   * Transcribe an audio file to text
   */
  async transcribe(audioPath: string): Promise<string> {
    const { stdout } = await execAsync(`voicecli transcribe "${this.escapeShellArg(audioPath)}"`);
    return stdout.trim();
  }

  /**
   * Convert text to speech and save to file
   * Returns path to generated audio file
   */
  async speak(text: string, options: { outputPath?: string } = {}): Promise<string> {
    const outputPath = options.outputPath || path.join(this.tempDir, `response-${Date.now()}.aiff`);
    
    const args: string[] = [];
    if (this.config.voice) {
      args.push('--voice', this.config.voice);
    }
    if (this.config.rate !== undefined) {
      args.push('--rate', this.config.rate.toString());
    }
    args.push('--output', outputPath);

    // Check if text is a file path
    let inputArg: string;
    try {
      const stats = await fs.stat(text);
      if (stats.isFile()) {
        inputArg = text; // voicecli will read the file
      } else {
        inputArg = text;
      }
    } catch {
      inputArg = text;
    }

    const cmd = `voicecli speak "${this.escapeShellArg(inputArg)}" ${args.map(a => `"${this.escapeShellArg(a)}"`).join(' ')}`;
    await execAsync(cmd);

    return outputPath;
  }

  /**
   * Process a voice message: transcribe and optionally respond with voice
   */
  async processVoiceMessage(
    audioPath: string,
    options: {
      /** Generate voice response */
      respondWithVoice?: boolean;
      /** Response text (if not provided, caller handles response) */
      responseText?: string;
    } = {}
  ): Promise<{ transcription: string; responseAudioPath?: string }> {
    const transcription = await this.transcribe(audioPath);

    let responseAudioPath: string | undefined;
    if (options.respondWithVoice && options.responseText) {
      responseAudioPath = await this.speak(options.responseText);
    }

    return { transcription, responseAudioPath };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Escape shell argument
   */
  private escapeShellArg(arg: string): string {
    return arg.replace(/"/g, '\\"');
  }
}

// OpenClaw plugin hook - exports register function for proper plugin activation
export function register(api: any) {
  const pluginId = 'macvoice';
  
  // Register as a speech provider (TTS + STT)
  api.registerSpeechProvider?.({
    id: pluginId,
    name: 'macOS Voice (voicecli)',
    
    // Text-to-speech
    async synthesize(text: string, options?: { voice?: string; rate?: number; outputPath?: string }) {
      const plugin = new VoicePlugin({
        voice: options?.voice,
        rate: options?.rate,
      });
      await plugin.init();
      return plugin.speak(text, { outputPath: options?.outputPath });
    },
    
    // Speech-to-text (transcription)
    async transcribe(audioPath: string) {
      const plugin = new VoicePlugin();
      await plugin.init();
      return plugin.transcribe(audioPath);
    },
    
    // List available voices
    async listVoices() {
      const { stdout } = await execAsync('voicecli voices');
      return stdout.trim().split('\n').filter(line => line.length > 0);
    },
  });
  
  // Also register hooks for voice message handling
  api.on?.('message_received', async (ctx: any, message: any) => {
    // Check if this is a voice message
    if (message.voice || message.audio) {
      const audioPath = message.voice?.file_path || message.audio?.file_path;
      if (audioPath) {
        const plugin = new VoicePlugin();
        await plugin.init();
        const transcription = await plugin.transcribe(audioPath);
        
        // Attach transcription to message
        message.transcription = transcription;
        message.text = transcription; // Make it available as text too
      }
    }
    return message;
  });
  
  // Log registration
  api.logger?.info?.('macvoice plugin registered');
}

// Legacy alias for backward compatibility
export const activate = register;

// Default export for OpenClaw
export default register;

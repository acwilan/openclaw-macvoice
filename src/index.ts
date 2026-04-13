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
   * Get the full path to voicecli executable
   */
  private getVoiceCliPath(): string {
    // Check common Homebrew locations
    const paths = [
      '/opt/homebrew/bin/voicecli',  // Apple Silicon Macs
      '/usr/local/bin/voicecli',       // Intel Macs
      'voicecli'                       // Fallback to PATH
    ];
    for (const p of paths) {
      try {
        // Try to stat the file to see if it exists
        const fs = require('fs');
        if (p !== 'voicecli' && fs.existsSync(p)) {
          return p;
        }
      } catch {
        // Continue to next path
      }
    }
    return 'voicecli'; // Fallback
  }

  /**
   * Verify voicecli is installed and accessible
   */
  private async checkVoiceCli(): Promise<void> {
    const voiceCliPath = this.getVoiceCliPath();
    try {
      await execAsync(`"${voiceCliPath}" --help`);
    } catch {
      throw new Error('voicecli not found. Install with: brew install voicecli');
    }
  }

  /**
   * Transcribe an audio file to text
   */
  async transcribe(audioPath: string): Promise<string> {
    const voiceCliPath = this.getVoiceCliPath();
    const { stdout } = await execAsync(`"${voiceCliPath}" transcribe "${this.escapeShellArg(audioPath)}"`);
    return stdout.trim();
  }

  /**
   * Convert text to speech and save to file
   * Returns path to generated audio file
   */
  async speak(text: string, options: { outputPath?: string } = {}): Promise<string> {
    // Generate AIFF first, then convert to OGG/OPUS for Telegram voice compatibility
    const tempAiffPath = path.join(this.tempDir, `temp-${Date.now()}.aiff`);
    const outputPath = options.outputPath || path.join(this.tempDir, `response-${Date.now()}.ogg`);
    
    const args: string[] = [];
    if (this.config.voice) {
      args.push('--voice', this.config.voice);
    }
    if (this.config.rate !== undefined) {
      args.push('--rate', this.config.rate.toString());
    }
    args.push('--output', tempAiffPath);

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

    const voiceCliPath = this.getVoiceCliPath();
    const cmd = `"${voiceCliPath}" speak "${this.escapeShellArg(inputArg)}" ${args.map(a => `"${this.escapeShellArg(a)}"`).join(' ')}`;
    await execAsync(cmd);

    // Convert AIFF to OGG/OPUS using ffmpeg for Telegram voice message compatibility
    try {
      await execAsync(`ffmpeg -y -i "${tempAiffPath}" -c:a libopus -b:a 24k "${outputPath}" 2>/dev/null`);
      // Clean up temp AIFF file
      await fs.unlink(tempAiffPath).catch(() => {});
    } catch (error) {
      // If ffmpeg conversion fails, fall back to the AIFF file
      console.warn('macvoice: ffmpeg conversion failed, returning AIFF');
      return tempAiffPath;
    }

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
  
  // Debug: log available API methods
  api.logger?.info?.('macvoice: available API methods: ' + Object.keys(api).join(', '));
  api.logger?.info?.('macvoice: registerProvider available: ' + !!api.registerProvider);
  api.logger?.info?.('macvoice: registerMediaUnderstandingProvider available: ' + !!api.registerMediaUnderstandingProvider);
  api.logger?.info?.('macvoice: registerSpeechProvider available: ' + !!api.registerSpeechProvider);
  
  // Register as a provider first (needed for synthetic auth)
  if (api.registerProvider) {
    api.registerProvider({
      id: pluginId,
      resolveSyntheticAuth: ({ provider }: { provider: string }) => {
        if (provider === pluginId) {
          api.logger?.info?.('macvoice: providing synthetic auth for ' + provider);
          return {
            apiKey: 'macvoice-local',
            source: 'macvoice (synthetic local key)',
            mode: 'api-key'
          };
        }
        return undefined;
      }
    });
    api.logger?.info?.('macvoice: registered as provider with synthetic auth');
  }
  
  // Register as a media understanding provider for audio transcription
  // This is what OpenClaw's audio preflight system uses
  if (api.registerMediaUnderstandingProvider) {
    api.registerMediaUnderstandingProvider({
      id: pluginId,
      capabilities: ['audio'],
      defaultModels: { audio: 'default' },
      autoPriority: { audio: 50 }, // Higher priority than Deepgram (30) and OpenAI (10)
      
      // Audio transcription method - matches MediaUnderstandingProvider interface
      async transcribeAudio(params: { 
        buffer: Buffer; 
        fileName?: string; 
        mime?: string; 
        apiKey?: string;
        baseUrl?: string;
        headers?: Record<string, string>;
        model?: string;
        language?: string;
        timeoutMs?: number;
      }) {
        api.logger?.info?.('macvoice: transcribeAudio called');
        api.logger?.info?.('macvoice: params keys: ' + Object.keys(params).join(', '));
        api.logger?.info?.('macvoice: buffer type: ' + typeof params.buffer);
        api.logger?.info?.('macvoice: buffer length: ' + params.buffer?.length);
        
        try {
          // voicecli works with file paths, not buffers
          // We need to write the buffer to a temp file first
          const tempFile = path.join(os.tmpdir(), `macvoice-${Date.now()}.ogg`);
          await fs.writeFile(tempFile, params.buffer);
          
          api.logger?.info?.('macvoice: temp file written to ' + tempFile);
          
          try {
            const plugin = new VoicePlugin();
            await plugin.init();
            api.logger?.info?.('macvoice: VoicePlugin initialized');
            
            const transcription = await plugin.transcribe(tempFile);
            api.logger?.info?.('macvoice: transcription result: ' + transcription.slice(0, 50));
            return {
              text: transcription,
              model: params.model || 'default'
            };
          } catch (err: any) {
            api.logger?.error?.('macvoice: transcription error: ' + (err?.message || String(err)));
            throw err;
          } finally {
            // Clean up temp file
            try {
              await fs.unlink(tempFile);
            } catch {
              // Ignore cleanup errors
            }
          }
        } catch (err: any) {
          api.logger?.error?.('macvoice: transcribeAudio outer error: ' + (err?.message || String(err)));
          throw err;
        }
      },
    });
    api.logger?.info?.('macvoice: registered as media understanding provider');
  } else {
    api.logger?.warn?.('macvoice: registerMediaUnderstandingProvider NOT available');
  }

  // Register as a speech provider (TTS + STT) - legacy support
  api.registerSpeechProvider?.({
    id: pluginId,
    name: 'macOS Voice (voicecli)',
    
    // Text-to-speech
    async synthesize(text: string, options?: { voice?: string; rate?: number; outputPath?: string }) {
      api.logger?.info?.('macvoice: synthesize CALLED');
      api.logger?.info?.('macvoice: synthesize text length: ' + text?.length);
      api.logger?.info?.('macvoice: synthesize text preview: ' + text?.slice(0, 50));
      api.logger?.info?.('macvoice: synthesize options: ' + JSON.stringify(options));
      
      try {
        const plugin = new VoicePlugin({
          voice: options?.voice,
          rate: options?.rate,
        });
        await plugin.init();
        api.logger?.info?.('macvoice: VoicePlugin initialized for synthesize');
        
        const result = await plugin.speak(text, { outputPath: options?.outputPath });
        api.logger?.info?.('macvoice: synthesize completed, output: ' + result);
        return result;
      } catch (err: any) {
        api.logger?.error?.('macvoice: synthesize ERROR: ' + (err?.message || String(err)));
        throw err;
      }
    },
    
    // Speech-to-text (transcription)
    async transcribe(audioPath: string) {
      api.logger?.info?.('macvoice: speech provider transcribe CALLED: ' + audioPath);
      try {
        const plugin = new VoicePlugin();
        await plugin.init();
        const result = await plugin.transcribe(audioPath);
        api.logger?.info?.('macvoice: speech provider transcribe result: ' + result.slice(0, 50));
        return result;
      } catch (err: any) {
        api.logger?.error?.('macvoice: speech provider transcribe ERROR: ' + (err?.message || String(err)));
        throw err;
      }
    },
    
    // List available voices
    async listVoices() {
      api.logger?.info?.('macvoice: listVoices CALLED');
      try {
        const { stdout } = await execAsync('voicecli voices');
        const voices = stdout.trim().split('\n').filter(line => line.length > 0);
        api.logger?.info?.('macvoice: listVoices found ' + voices.length + ' voices');
        return voices;
      } catch (err: any) {
        api.logger?.error?.('macvoice: listVoices ERROR: ' + (err?.message || String(err)));
        throw err;
      }
    },
  });
  api.logger?.info?.('macvoice: registered as speech provider');
  
  // Also register hooks for voice message handling
  api.on?.('message_received', async (ctx: any, message: any) => {
    // Debug logging
    api.logger?.debug?.('macvoice: message_received hook triggered', { 
      hasVoice: !!message.voice, 
      hasAudio: !!message.audio,
      voiceKeys: message.voice ? Object.keys(message.voice) : undefined,
      audioKeys: message.audio ? Object.keys(message.audio) : undefined,
      attachment: message.attachment ? { type: message.attachment.type, path: message.attachment.path } : undefined
    });
    
    // Check if this is a voice message
    if (message.voice || message.audio) {
      const audioPath = message.voice?.file_path || message.audio?.file_path || message.attachment?.path;
      
      api.logger?.debug?.('macvoice: attempting transcription', { audioPath });
      
      if (audioPath) {
        try {
          const plugin = new VoicePlugin();
          await plugin.init();
          const transcription = await plugin.transcribe(audioPath);
          
          api.logger?.info?.('macvoice: transcription successful', { transcription: transcription.slice(0, 50) + '...' });
          
          // Attach transcription to message
          message.transcription = transcription;
          message.text = transcription; // Make it available as text too
        } catch (error) {
          api.logger?.error?.('macvoice: transcription failed', { error: String(error), audioPath });
        }
      } else {
        api.logger?.warn?.('macvoice: no audio path found in message');
      }
    }
    return message;
  });
  
  // Log registration
  api.logger?.info?.('macvoice plugin registered');
}

// Legacy alias for backward compatibility
export const activate = register;

// Default export for OpenClaw (both ESM and CommonJS compatible)
export default register;

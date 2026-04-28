import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import type {
  OpenClawConfig,
  OpenClawPluginApi,
  SpeechProviderPlugin,
  MediaUnderstandingProviderPlugin,
} from "openclaw/plugin-sdk";
import type {
  SpeechSynthesisRequest,
  SpeechListVoicesRequest,
  SpeechVoiceOption,
} from "openclaw/plugin-sdk/speech-core";
import type {
  AudioTranscriptionRequest,
  AudioTranscriptionResult,
} from "openclaw/plugin-sdk/media-understanding";

const PROVIDER_ID = "macvoice";
const PROVIDER_NAME = "macOS Voice";
const PROVIDER_DESCRIPTION = "Local speech synthesis and transcription using macOS voicecli";

const execFileAsync = promisify(execFile);

// VoiceCLI response formats
const SUPPORTED_FORMATS = ["aiff", "ogg", "opus"];

interface MacVoiceConfig extends OpenClawConfig {
  voice?: string;
  rate?: number;
  tempDir?: string;
  locale?: string; // BCP 47 locale for voice selection
}

/**
 * Get the voicecli executable path
 */
function getVoiceCliPath(): string {
  const paths = [
    "/opt/homebrew/bin/voicecli", // Apple Silicon
    "/usr/local/bin/voicecli", // Intel
    "voicecli", // Fallback
  ];
  for (const p of paths) {
    if (p === "voicecli" || existsSync(p)) {
      return p;
    }
  }
  return "voicecli";
}

/**
 * Normalize the configuration
 */
function normalizeConfig(rawConfig: unknown): MacVoiceConfig {
  const config = (rawConfig || {}) as MacVoiceConfig;
  return {
    voice: config.voice || "Samantha",
    rate: typeof config.rate === "number" ? config.rate : 0.5,
    tempDir: config.tempDir
      ? config.tempDir.replace(/^~\//, homedir() + "/")
      : join(tmpdir(), "openclaw-macvoice"),
    locale: config.locale,
  };
}

/**
 * Build the speech provider
 */
function buildMacVoiceSpeechProvider(config: MacVoiceConfig): SpeechProviderPlugin {
  const voiceCliPath = getVoiceCliPath();

  return {
    id: PROVIDER_ID,
    label: PROVIDER_NAME,
    autoSelectOrder: 5,
    voices: ["Samantha", "Alex", "Fred", "Victoria", "Karen", "Moira", "Tessa"],

    isConfigured: () => {
      // Always available on macOS if voicecli is installed
      try {
        return existsSync(voiceCliPath) || voiceCliPath === "voicecli";
      } catch {
        return false;
      }
    },

    synthesize: async (req: SpeechSynthesisRequest): Promise<{
      audioBuffer: Buffer;
      outputFormat: string;
      fileExtension: string;
      voiceCompatible: boolean;
    }> => {
      const { text, target, timeoutMs } = req;
      const providerCfg = normalizeConfig(req.providerConfig);

      // Ensure temp directory exists
      const tempDir = providerCfg.tempDir!;
      await mkdir(tempDir, { recursive: true });

      // Create temp file paths
      const timestamp = Date.now();
      const tempAiffPath = join(tempDir, `temp-${timestamp}.aiff`);
      const textFilePath = join(tempDir, `text-${timestamp}.txt`);
      const outputPath = join(tempDir, `output-${timestamp}.ogg`);

      // Write text to file to avoid shell escaping issues
      await writeFile(textFilePath, text, "utf-8");

      // Build voicecli arguments
      const args = [
        "speak",
        textFilePath,
        "--rate",
        String(providerCfg.rate ?? 0.5),
        "--output",
        tempAiffPath,
      ];

      // Add voice or locale (voice takes precedence)
      const providerOverrides = req.providerOverrides as { locale?: string } | undefined;
      const effectiveLocale = providerOverrides?.locale || providerCfg.locale;
      
      if (providerCfg.voice) {
        args.push("--voice", providerCfg.voice);
      } else if (effectiveLocale) {
        args.push("--locale", effectiveLocale);
      } else {
        // Default voice
        args.push("--voice", "Samantha");
      }

      try {
        // Generate AIFF
        await execFileAsync(voiceCliPath, args, {
          timeout: timeoutMs || 30000,
        });

        // Try to convert to OGG/OPUS for better compatibility
        try {
          await execFileAsync(
            "ffmpeg",
            [
              "-y",
              "-i",
              tempAiffPath,
              "-c:a",
              "libopus",
              "-b:a",
              "24k",
              outputPath,
            ],
            { timeout: 10000 }
          );

          // Read OGG output
          const audioBuffer = await readFile(outputPath);

          // Cleanup
          await unlink(textFilePath).catch(() => {});
          await unlink(tempAiffPath).catch(() => {});
          await unlink(outputPath).catch(() => {});

          return {
            audioBuffer,
            outputFormat: "audio/ogg",
            fileExtension: ".ogg",
            voiceCompatible: target === "voice-note",
          };
        } catch {
          // FFmpeg failed, fall back to AIFF
          const audioBuffer = await readFile(tempAiffPath);

          // Cleanup
          await unlink(textFilePath).catch(() => {});
          await unlink(tempAiffPath).catch(() => {});

          return {
            audioBuffer,
            outputFormat: "audio/aiff",
            fileExtension: ".aiff",
            voiceCompatible: false,
          };
        }
      } catch (error) {
        // Cleanup on error
        await unlink(textFilePath).catch(() => {});
        await unlink(tempAiffPath).catch(() => {});
        throw error;
      }
    },

    listVoices: async (): Promise<SpeechVoiceOption[]> => {
      try {
        const { stdout } = await execFileAsync(voiceCliPath, ["voices"], {
          timeout: 5000,
        });
        const voices = stdout
          .trim()
          .split("\n")
          .filter((v) => v.length > 0);
        return voices.map((v) => ({ id: v, name: v }));
      } catch {
        // Fallback voices
        return [
          { id: "Samantha", name: "Samantha" },
          { id: "Alex", name: "Alex" },
          { id: "Fred", name: "Fred" },
        ];
      }
    },
  };
}

/**
 * Build the media understanding provider (for transcription)
 */
function buildMacVoiceMediaProvider(): Omit<MediaUnderstandingProviderPlugin, "id"> {
  const voiceCliPath = getVoiceCliPath();

  return {
    capabilities: ["audio"],
    defaultModels: { audio: "macvoice-transcribe" },
    autoPriority: { audio: 5 },
    transcribeAudio: async (req: AudioTranscriptionRequest): Promise<AudioTranscriptionResult> => {
      const { buffer, language } = req;
      // Ensure temp directory
      const tempDir = join(tmpdir(), "openclaw-macvoice");
      await mkdir(tempDir, { recursive: true });

      // Write buffer to temp file
      const tempPath = join(tempDir, `audio-${Date.now()}.ogg`);
      await writeFile(tempPath, buffer);

      try {
        const args = ["transcribe", tempPath];
        if (language) {
          args.push("--locale", language);
        }
        const { stdout } = await execFileAsync(voiceCliPath, args, { timeout: 30000 });
        return { text: stdout.trim() };
      } finally {
        // Cleanup
        await unlink(tempPath).catch(() => {});
      }
    },
  };
}

/**
 * Plugin entry point
 */
export default definePluginEntry({
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  description: PROVIDER_DESCRIPTION,

  register(api: OpenClawPluginApi) {
    // Get config from the plugin entry
    const config = api.config as MacVoiceConfig;

    // Register as a provider (required for speech provider registration)
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_NAME,
      auth: [],
    });

    // Register as speech provider (TTS)
    const speechProvider = buildMacVoiceSpeechProvider(config);
    api.registerSpeechProvider(speechProvider);

    // Register as media understanding provider (STT/transcription)
    const mediaProvider = buildMacVoiceMediaProvider();
    api.registerMediaUnderstandingProvider({
      id: PROVIDER_ID,
      ...mediaProvider,
    });
  },
});

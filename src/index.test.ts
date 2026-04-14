jest.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: jest.fn((entry) => entry),
}));

jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
}));

jest.mock("node:util", () => ({
  promisify: jest.fn(
    (fn: (...args: any[]) => void) =>
      (...args: any[]) =>
        new Promise((resolve, reject) => {
          fn(...args, (error: Error | null, stdout = "", stderr = "") => {
            if (error) {
              reject(error);
              return;
            }
            resolve({ stdout, stderr });
          });
        })
  ),
}));

jest.mock("node:fs/promises", () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock("node:fs", () => ({
  existsSync: jest.fn(),
}));

jest.mock("node:os", () => ({
  homedir: jest.fn(() => "/Users/tester"),
  tmpdir: jest.fn(() => "/tmp/mock"),
}));

import plugin from "./index";
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileMock = execFile as jest.MockedFunction<typeof execFile>;
const mkdirMock = mkdir as jest.MockedFunction<typeof mkdir>;
const writeFileMock = writeFile as jest.MockedFunction<typeof writeFile>;
const readFileMock = readFile as jest.MockedFunction<typeof readFile>;
const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;
const existsSyncMock = existsSync as jest.MockedFunction<typeof existsSync>;

type RegisteredProviders = {
  speechProvider: any;
  mediaProvider: any;
};

type ExecFileCallback = (error: Error | null, stdout?: string, stderr?: string) => void;

function setExecFileImplementation(
  impl: (
    file: string,
    args: unknown,
    options: unknown,
    callback?: ExecFileCallback
  ) => void
): void {
  execFileMock.mockImplementation(((file: unknown, args: unknown, options: unknown, callback: unknown) => {
    impl(
      String(file),
      args,
      options,
      (typeof options === "function" ? options : callback) as ExecFileCallback | undefined
    );
    return {} as any;
  }) as any);
}

function captureProviders(config: Record<string, unknown> = {}): RegisteredProviders {
  const api = {
    config,
    registerProvider: jest.fn(),
    registerSpeechProvider: jest.fn(),
    registerMediaUnderstandingProvider: jest.fn(),
  };

  plugin.register(api as any);

  expect(api.registerProvider).toHaveBeenCalledWith({
    id: "macvoice",
    label: "macOS Voice",
    auth: [],
  });

  return {
    speechProvider: api.registerSpeechProvider.mock.calls[0][0],
    mediaProvider: api.registerMediaUnderstandingProvider.mock.calls[0][0],
  };
}

describe("macvoice plugin entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    mkdirMock.mockResolvedValue(undefined as never);
    writeFileMock.mockResolvedValue(undefined as never);
    unlinkMock.mockResolvedValue(undefined as never);
    readFileMock.mockImplementation(async (path: any) => {
      if (String(path).endsWith(".ogg")) {
        return Buffer.from("ogg-audio") as never;
      }
      return Buffer.from("aiff-audio") as never;
    });
    setExecFileImplementation((file, args, _options, callback) => {
      if (!callback) {
        throw new Error("Missing callback");
      }

      if (file === "ffmpeg") {
        callback(null, "", "");
        return;
      }

      if (Array.isArray(args) && args[0] === "voices") {
        callback(null, "Samantha\nAlex\nVictoria\n", "");
        return;
      }

      if (Array.isArray(args) && args[0] === "transcribe") {
        callback(null, "hello world\n", "");
        return;
      }

      callback(null, "", "");
    });
    jest.spyOn(Date, "now").mockReturnValue(1234567890);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exports the expected plugin metadata", () => {
    expect(plugin.id).toBe("macvoice");
    expect(plugin.name).toBe("macOS Voice");
    expect(plugin.description).toContain("macOS voicecli");
    expect(typeof plugin.register).toBe("function");
  });

  it("registers speech and media providers", () => {
    const { speechProvider, mediaProvider } = captureProviders();

    expect(speechProvider.id).toBe("macvoice");
    expect(speechProvider.label).toBe("macOS Voice");
    expect(speechProvider.autoSelectOrder).toBe(5);
    expect(speechProvider.voices).toContain("Samantha");
    expect(mediaProvider.id).toBe("macvoice");
    expect(typeof mediaProvider.transcribeAudio).toBe("function");
  });

  it("synthesizes ogg audio through voicecli and ffmpeg", async () => {
    const { speechProvider } = captureProviders({
      voice: "Karen",
      rate: 0.7,
      tempDir: "~/tmp/custom-voice",
    });

    const result = await speechProvider.synthesize({
      text: "Hello from test",
      target: "voice-note",
      timeoutMs: 4321,
      providerConfig: {
        voice: "Karen",
        rate: 0.7,
        tempDir: "~/tmp/custom-voice",
      },
    });

    expect(mkdirMock).toHaveBeenCalledWith("/Users/tester/tmp/custom-voice", {
      recursive: true,
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      "/Users/tester/tmp/custom-voice/text-1234567890.txt",
      "Hello from test",
      "utf-8"
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      "voicecli",
      [
        "speak",
        "/Users/tester/tmp/custom-voice/text-1234567890.txt",
        "--voice",
        "Karen",
        "--rate",
        "0.7",
        "--output",
        "/Users/tester/tmp/custom-voice/temp-1234567890.aiff",
      ],
      { timeout: 4321 },
      expect.any(Function)
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      "ffmpeg",
      [
        "-y",
        "-i",
        "/Users/tester/tmp/custom-voice/temp-1234567890.aiff",
        "-c:a",
        "libopus",
        "-b:a",
        "24k",
        "/Users/tester/tmp/custom-voice/output-1234567890.ogg",
      ],
      { timeout: 10000 },
      expect.any(Function)
    );
    expect(readFileMock).toHaveBeenCalledWith(
      "/Users/tester/tmp/custom-voice/output-1234567890.ogg"
    );
    expect(result).toEqual({
      audioBuffer: Buffer.from("ogg-audio"),
      outputFormat: "audio/ogg",
      fileExtension: ".ogg",
      voiceCompatible: true,
    });
  });

  it("falls back to aiff when ffmpeg conversion fails", async () => {
    setExecFileImplementation((file, _args, _options, callback) => {
      if (!callback) {
        throw new Error("Missing callback");
      }

      if (file === "ffmpeg") {
        callback(new Error("ffmpeg failed"), "", "");
        return;
      }

      callback(null, "", "");
    });

    const { speechProvider } = captureProviders();

    const result = await speechProvider.synthesize({
      text: "Fallback test",
      target: "text",
      providerConfig: {},
    });

    expect(readFileMock).toHaveBeenCalledWith("/tmp/mock/openclaw-macvoice/temp-1234567890.aiff");
    expect(result).toEqual({
      audioBuffer: Buffer.from("aiff-audio"),
      outputFormat: "audio/aiff",
      fileExtension: ".aiff",
      voiceCompatible: false,
    });
  });

  it("lists voices from voicecli output", async () => {
    const { speechProvider } = captureProviders();

    await expect(speechProvider.listVoices()).resolves.toEqual([
      { id: "Samantha", name: "Samantha" },
      { id: "Alex", name: "Alex" },
      { id: "Victoria", name: "Victoria" },
    ]);
  });

  it("falls back to default voices when voicecli listing fails", async () => {
    setExecFileImplementation((_file, args, _options, callback) => {
      if (!callback) {
        throw new Error("Missing callback");
      }

      if (Array.isArray(args) && args[0] === "voices") {
        callback(new Error("voicecli missing"), "", "");
        return;
      }

      callback(null, "", "");
    });

    const { speechProvider } = captureProviders();

    await expect(speechProvider.listVoices()).resolves.toEqual([
      { id: "Samantha", name: "Samantha" },
      { id: "Alex", name: "Alex" },
      { id: "Fred", name: "Fred" },
    ]);
  });

  it("transcribes audio buffers through the media provider", async () => {
    const { mediaProvider } = captureProviders();

    const result = await mediaProvider.transcribeAudio({
      buffer: Buffer.from("input-audio"),
    });

    expect(mkdirMock).toHaveBeenCalledWith("/tmp/mock/openclaw-macvoice", {
      recursive: true,
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/mock/openclaw-macvoice/audio-1234567890.ogg",
      Buffer.from("input-audio")
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "voicecli",
      ["transcribe", "/tmp/mock/openclaw-macvoice/audio-1234567890.ogg"],
      { timeout: 30000 },
      expect.any(Function)
    );
    expect(unlinkMock).toHaveBeenCalledWith("/tmp/mock/openclaw-macvoice/audio-1234567890.ogg");
    expect(result).toEqual({ text: "hello world" });
  });

  it("reports configured when voicecli is available on PATH fallback", () => {
    const { speechProvider } = captureProviders();

    expect(speechProvider.isConfigured()).toBe(true);
  });
});

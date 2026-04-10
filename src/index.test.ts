import { VoicePlugin } from './index';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => {
    // Mock successful voicecli responses
    if (cmd.includes('transcribe')) {
      callback(null, { stdout: 'Hello world\n' });
    } else if (cmd.includes('speak')) {
      callback(null, { stdout: 'Saved to: /tmp/test.aiff\n' });
    } else if (cmd.includes('--help')) {
      callback(null, { stdout: 'Usage: voicecli\n' });
    } else {
      callback(null, { stdout: '' });
    }
  }),
}));

describe('VoicePlugin', () => {
  let plugin: VoicePlugin;

  beforeEach(() => {
    plugin = new VoicePlugin({ tempDir: '/tmp/test-voice' });
  });

  describe('initialization', () => {
    it('should create plugin with default config', () => {
      const defaultPlugin = new VoicePlugin();
      expect(defaultPlugin).toBeDefined();
    });

    it('should create plugin with custom config', () => {
      const customPlugin = new VoicePlugin({
        voice: 'com.apple.voice.compact.en-US.Samantha',
        rate: 0.7,
        tempDir: '/custom/temp',
      });
      expect(customPlugin).toBeDefined();
    });
  });

  describe('transcribe', () => {
    it('should transcribe audio file', async () => {
      const result = await plugin.transcribe('/path/to/audio.m4a');
      expect(result).toBe('Hello world');
    });
  });

  describe('speak', () => {
    it('should convert text to speech', async () => {
      const result = await plugin.speak('Hello world');
      expect(result).toContain('.aiff');
    });

    it('should use custom output path when provided', async () => {
      const customPath = '/custom/output.aiff';
      const result = await plugin.speak('Hello', { outputPath: customPath });
      expect(result).toBe(customPath);
    });
  });

  describe('escapeShellArg', () => {
    it('should escape quotes in arguments', () => {
      const text = 'Say "Hello"';
      const escaped = (plugin as any).escapeShellArg(text);
      expect(escaped).toBe('Say \\"Hello\\"');
    });
  });
});

describe('OpenClaw plugin export', () => {
  it('should export plugin with required properties', async () => {
    const plugin = await import('./index');
    const defaultExport = plugin.default;

    expect(defaultExport).toHaveProperty('name', '@acwilan/macvoice');
    expect(defaultExport).toHaveProperty('version', '0.1.0');
    expect(defaultExport).toHaveProperty('init');
    expect(defaultExport).toHaveProperty('onVoiceMessage');
    expect(defaultExport).toHaveProperty('speak');
  });
});

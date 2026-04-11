import { VoicePlugin, register, activate } from './index';

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
    } else if (cmd.includes('voices')) {
      callback(null, { stdout: 'Samantha\nAlex\nVictoria\n' });
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
  it('should export register function', () => {
    expect(typeof register).toBe('function');
  });

  it('should export activate as alias for register', () => {
    expect(typeof activate).toBe('function');
    expect(activate).toBe(register);
  });

  it('should register speech provider when called with api', async () => {
    const mockApi = {
      registerSpeechProvider: jest.fn(),
      on: jest.fn(),
      logger: { info: jest.fn() },
    };
    
    register(mockApi);
    
    expect(mockApi.registerSpeechProvider).toHaveBeenCalled();
    expect(mockApi.on).toHaveBeenCalledWith('message_received', expect.any(Function));
    expect(mockApi.logger.info).toHaveBeenCalledWith('macvoice plugin registered');
  });

  it('should handle missing optional api methods gracefully', () => {
    // Should not throw if api.on is missing
    const mockApiMinimal = {
      registerSpeechProvider: jest.fn(),
    };
    
    expect(() => register(mockApiMinimal)).not.toThrow();
  });
});

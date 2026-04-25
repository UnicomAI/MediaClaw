/**
 * Mock 测试文件 - 测试所有 mediaclaw-plugin 工具
 *
 * 运行方式: npx tsx tests/tools.test.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================
// Mock ClientManager and Clients
// ============================================

interface MockResponse {
  textToImage?: { code: number; msg: string; data?: Array<{ b64_json?: string; url?: string }> };
  imageQA?: { code: number; msg: string; choices?: Array<{ message?: { content?: string } }> };
  submitTextToVideo?: { code: number; msg: string; resource_id?: string };
  queryTextToVideoResult?: { code: number; msg: string; video?: string; data?: { video?: string } };
  submitImageToVideo?: { code: number; msg: string; resource_id?: string };
  queryImageToVideoResult?: { code: number; msg: string; video?: string; data?: { video?: string } };
  submitImagesToVideo?: { code: number; msg: string; resource_id?: string };
  queryImagesToVideoResult?: { code: number; msg: string; video?: string; data?: { video?: string } };
  textToSpeech?: { code: number; msg: string; data?: { audio?: Buffer | string; sampleRate?: number } };
  submitDigitalAvatar?: { code: number; msg: string; resource_id?: string };
  queryDigitalAvatarResult?: { code: number; msg: string; result?: { status?: string; video?: string; subtitle?: string } };
}

// Import the real YuanjingClient to use instanceof check
let YuanjingClientClass: any;

async function getMockClient(responses: MockResponse = {}) {
  // Dynamically import to get the class
  const { YuanjingClient } = await import('../src/api/yuanjing-client.js');
  YuanjingClientClass = YuanjingClient;

  // Create a mock that extends YuanjingClient
  class MockYuanjingClient extends YuanjingClient {
    public callLog: string[] = [];
    private mockResponses: MockResponse;

    constructor(mockResponses: MockResponse) {
      super({ accessToken: 'mock-token' });
      this.mockResponses = mockResponses;
    }

    override async textToImage() {
      this.callLog.push('textToImage');
      return this.mockResponses.textToImage || { code: 0, msg: 'success', data: [{ b64_json: 'aW1hZ2VkYXRh' }] };
    }

    override async imageQA() {
      this.callLog.push('imageQA');
      return this.mockResponses.imageQA || { code: 0, msg: 'success', choices: [{ message: { content: 'Mock response' } }] };
    }

    override async submitTextToVideo() {
      this.callLog.push('submitTextToVideo');
      return this.mockResponses.submitTextToVideo || { code: 0, msg: 'success', resource_id: 'mock-resource-id' };
    }

    override async queryTextToVideoResult() {
      this.callLog.push('queryTextToVideoResult');
      return this.mockResponses.queryTextToVideoResult || { code: 0, msg: 'success', video: 'dmlkZW9kYXRh' };
    }

    override async submitImageToVideo() {
      this.callLog.push('submitImageToVideo');
      return this.mockResponses.submitImageToVideo || { code: 0, msg: 'success', resource_id: 'mock-resource-id' };
    }

    override async queryImageToVideoResult() {
      this.callLog.push('queryImageToVideoResult');
      return this.mockResponses.queryImageToVideoResult || { code: 0, msg: 'success', video: 'dmlkZW9kYXRh' };
    }

    override async submitImagesToVideo() {
      this.callLog.push('submitImagesToVideo');
      return this.mockResponses.submitImagesToVideo || { code: 0, msg: 'success', resource_id: 'mock-resource-id' };
    }

    override async queryImagesToVideoResult() {
      this.callLog.push('queryImagesToVideoResult');
      return this.mockResponses.queryImagesToVideoResult || { code: 0, msg: 'success', video: 'dmlkZW9kYXRh' };
    }

    override async textToSpeech() {
      this.callLog.push('textToSpeech');
      // Create a minimal valid WAV header (44 bytes) + some PCM data
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + 100, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20);
      wavHeader.writeUInt16LE(1, 22);
      wavHeader.writeUInt32LE(24000, 24);
      wavHeader.writeUInt32LE(48000, 28);
      wavHeader.writeUInt16LE(2, 32);
      wavHeader.writeUInt16LE(16, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(100, 40);
      const pcmData = Buffer.alloc(100, 0);
      const audioBuffer = Buffer.concat([wavHeader, pcmData]);

      return this.mockResponses.textToSpeech || { code: 0, msg: 'success', data: { audio: audioBuffer, sampleRate: 24000 } };
    }

    override async submitDigitalAvatar() {
      this.callLog.push('submitDigitalAvatar');
      return this.mockResponses.submitDigitalAvatar || { code: 0, msg: 'success', resource_id: 'mock-resource-id' };
    }

    override async queryDigitalAvatarResult() {
      this.callLog.push('queryDigitalAvatarResult');
      return this.mockResponses.queryDigitalAvatarResult || { code: 0, msg: 'success', result: { status: 'done', video: 'dmlkZW9kYXRh' } };
    }
  }

  return new MockYuanjingClient(responses);
}

class MockClientManager {
  private mockClient: any;
  public callLog: string[] = [];

  constructor(mockClient: any) {
    this.mockClient = mockClient;
  }

  getClient() {
    return this.mockClient;
  }

  hasInterface() {
    return true;
  }

  isCapabilityAvailable() {
    return true;
  }

  getConfiguredInterfaces() {
    return ['yuanjing'];
  }

  getConfig() {
    return {
      interfaces: { yuanjing: { accessToken: 'mock-token' } },
      capabilities: {},
      defaultInterface: 'yuanjing',
      videoPollInterval: 5000,
      videoMaxWaitTime: 300000,
    };
  }
}

// ============================================
// Test Utilities
// ============================================

interface TestResult { name: string; passed: boolean; error?: string }

let testResults: TestResult[] = [];
let testPromises: Promise<void>[] = [];

function test(name: string, fn: () => Promise<void>) {
  const promise = fn().then(() => {
    testResults.push({ name, passed: true });
    console.log(`✅ ${name}`);
  }).catch((err) => {
    testResults.push({ name, passed: false, error: err.message });
    console.log(`❌ ${name}: ${err.message}`);
  });
  testPromises.push(promise);
}

function createTempFile(content: Buffer, ext: string = '.png'): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediaclaw-test-'));
  const filePath = path.join(tempDir, `test${ext}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function createTestImage(): Buffer {
  // Create a minimal valid PNG (1x1 red pixel)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  return pngData;
}

function createTestVideo(): Buffer {
  // Create a minimal valid MP4 header (not a real video, but has correct signature)
  const mp4Data = Buffer.alloc(100);
  mp4Data.writeUInt32BE(100, 0); // box size
  mp4Data.write('ftyp', 4);
  mp4Data.write('mp42', 8);
  return mp4Data;
}

function createTestWav(): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + 100, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(100, 40);
  const pcmData = Buffer.alloc(100, 0);
  return Buffer.concat([header, pcmData]);
}

// ============================================
// Test Suite
// ============================================

async function runTests() {
  console.log('\n========================================');
  console.log('MediaClaw Plugin Tools Mock Test');
  console.log('========================================\n');

  // Import modules
  const { registerLocalImage } = await import('../src/tools/local-image.js');
  const { registerBurnSubtitles } = await import('../src/tools/burn-subtitles.js');
  const { registerReplaceBackground } = await import('../src/tools/replace-background.js');
  const { registerTextToImage } = await import('../src/tools/text-to-image.js');
  const { registerImageQA } = await import('../src/tools/image-qa.js');
  const { registerTextToVideo } = await import('../src/tools/text-to-video.js');
  const { registerImageToVideo } = await import('../src/tools/image-to-video.js');
  const { registerImagesToVideo } = await import('../src/tools/images-to-video.js');
  const { registerTextToSpeech } = await import('../src/tools/text-to-speech.js');
  const { registerDigitalAvatar } = await import('../src/tools/digital-avatar.js');
  const { detectMime } = await import('../mime.js');
  const { generateImageOutputPath, generateVideoOutputPath, generateAudioOutputPath, imageToBase64, imageToBase64DataUrl } = await import('../src/utils/file.js');
  const { parseWavInfo } = await import('../src/utils/audio.js');
  const { sleep } = await import('../src/utils/polling.js');

  // Test 1: local-image tool
  await test('local-image: should read image file', async () => {
    const tool = registerLocalImage();
    const testImage = createTestImage();
    const tempFile = createTempFile(testImage, '.png');

    try {
      const result = await tool.execute('test-id', { path: tempFile });
      if (result.content[0].type !== 'image') throw new Error('Expected image content');
      if (!result.content[0].data) throw new Error('Expected base64 data');
      if (!result.content[0].mimeType?.startsWith('image/')) throw new Error('Expected image mimeType');
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  await test('local-image: should reject non-image files', async () => {
    const tool = registerLocalImage();
    const tempFile = createTempFile(Buffer.from('not an image'), '.txt');

    try {
      await tool.execute('test-id', { path: tempFile });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('不支持的文件类型')) {
        throw err;
      }
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  await test('local-image: should reject oversized images', async () => {
    const tool = registerLocalImage();
    // Create a file larger than 5MB
    const bigData = Buffer.alloc(6 * 1024 * 1024);
    const tempFile = createTempFile(bigData, '.png');

    try {
      await tool.execute('test-id', { path: tempFile });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('超出限制')) {
        throw err;
      }
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  await test('local-image: should handle non-existent file', async () => {
    const tool = registerLocalImage();

    try {
      await tool.execute('test-id', { path: '/non/existent/file.png' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('文件不存在')) {
        throw err;
      }
    }
  });

  await test('local-image: should read video file', async () => {
    const tool = registerLocalImage();
    const testVideo = createTestVideo();
    const tempFile = createTempFile(testVideo, '.mp4');

    try {
      const result = await tool.execute('test-id', { path: tempFile });
      // Video returns text, not video content (as per current implementation)
      const hasTextContent = result.content.some(c => c.type === 'text' && c.text?.includes('local_video'));
      if (!hasTextContent) throw new Error('Expected video text content');
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  // Test 2: burn-subtitles tool
  await test('burn-subtitles: should reject missing video file', async () => {
    const tool = registerBurnSubtitles();

    try {
      await tool.execute('test-id', { video_path: '/non/existent/video.mp4', ass_path: '/non/existent/sub.ass' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Video file does not exist')) {
        throw err;
      }
    }
  });

  await test('burn-subtitles: should reject missing ass file', async () => {
    const tool = registerBurnSubtitles();
    const tempVideo = createTempFile(createTestVideo(), '.mp4');

    try {
      await tool.execute('test-id', { video_path: tempVideo, ass_path: '/non/existent/sub.ass' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Subtitle file does not exist')) {
        throw err;
      }
    } finally {
      fs.rmSync(path.dirname(tempVideo), { recursive: true, force: true });
    }
  });

  // Test 3: replace-background tool
  await test('replace-background: should reject missing foreground file', async () => {
    const tool = registerReplaceBackground();

    try {
      await tool.execute('test-id', { foreground_path: '/non/existent/fg.mp4', background_path: '/non/existent/bg.png' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Foreground file does not exist')) {
        throw err;
      }
    }
  });

  await test('replace-background: should reject missing background file', async () => {
    const tool = registerReplaceBackground();
    const tempFg = createTempFile(createTestVideo(), '.mp4');

    try {
      await tool.execute('test-id', { foreground_path: tempFg, background_path: '/non/existent/bg.png' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Background file does not exist')) {
        throw err;
      }
    } finally {
      fs.rmSync(path.dirname(tempFg), { recursive: true, force: true });
    }
  });

  // Test 4: text-to-image tool (with mock client)
  await test('text-to-image: should validate n parameter', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerTextToImage(mockManager as any, os.tmpdir());

    try {
      await tool.execute('test-id', { prompt: 'test', n: 5 });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('生成图片数量必须在 1-2 之间')) {
        throw err;
      }
    }
  });

  await test('text-to-image: should call client.textToImage', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerTextToImage(mockManager as any, os.tmpdir());

    await tool.execute('test-id', { prompt: 'test image', size: '1024x1024', n: 1 });

    if (!mockClient.callLog.includes('textToImage')) {
      throw new Error('textToImage was not called');
    }
  });

  // Test 5: image-qa tool (with mock client)
  await test('image-qa: should handle file path input', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImageQA(mockManager as any);

    const testImage = createTestImage();
    const tempFile = createTempFile(testImage, '.png');

    try {
      const result = await tool.execute('test-id', { images: [tempFile], prompt: 'describe this image' });
      if (result.content[0].type !== 'text') throw new Error('Expected text content');
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  await test('image-qa: should handle base64 input', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImageQA(mockManager as any);

    const testImage = createTestImage();
    const base64Data = testImage.toString('base64');

    const result = await tool.execute('test-id', { images: [base64Data], prompt: 'describe this image' });
    if (result.content[0].type !== 'text') throw new Error('Expected text content');
  });

  await test('image-qa: should handle URL input', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImageQA(mockManager as any);

    const result = await tool.execute('test-id', {
      images: ['https://example.com/image.png'],
      prompt: 'describe this image'
    });

    if (result.content[0].type !== 'text') throw new Error('Expected text content');
    if (!mockClient.callLog.includes('imageQA')) throw new Error('imageQA was not called');
  });

  // Test 6: text-to-video tool (with mock client)
  await test('text-to-video: should submit and poll for video', async () => {
    const mockClient = await getMockClient({
      submitTextToVideo: { code: 0, msg: 'success', resource_id: 'test-resource' },
      queryTextToVideoResult: { code: 0, msg: 'success', video: 'dmlkZW9kYXRh' }
    });
    const mockManager = new MockClientManager(mockClient);

    const tool = registerTextToVideo(mockManager as any, os.tmpdir(), 100, 1000);

    const result = await tool.execute('test-id', { prompt: 'test video' });
    if (result.content[0].type !== 'text') throw new Error('Expected text content');
    if (!mockClient.callLog.includes('submitTextToVideo')) throw new Error('submitTextToVideo was not called');
  });

  // Test 7: image-to-video tool (with mock client)
  await test('image-to-video: should require image_path', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImageToVideo(mockManager as any, os.tmpdir(), 100, 1000);

    try {
      await tool.execute('test-id', { image_path: '/non/existent/image.png' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('图片文件不存在')) {
        throw err;
      }
    }
  });

  // Test 8: images-to-video tool (with mock client)
  await test('images-to-video: first_last_frame requires both images', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImagesToVideo(mockManager as any, os.tmpdir(), 100, 1000);

    try {
      await tool.execute('test-id', { task_type: 'first_last_frame', first_image: '/non/existent/a.png' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('需要同时指定 first_image 和 last_image')) {
        throw err;
      }
    }
  });

  await test('images-to-video: ref_images requires at least one image', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImagesToVideo(mockManager as any, os.tmpdir(), 100, 1000);

    try {
      await tool.execute('test-id', { task_type: 'ref_images', images: [] });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('需要至少指定一张图片')) {
        throw err;
      }
    }
  });

  await test('images-to-video: ref_images max 3 images', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerImagesToVideo(mockManager as any, os.tmpdir(), 100, 1000);

    try {
      await tool.execute('test-id', { task_type: 'ref_images', images: ['a.png', 'b.png', 'c.png', 'd.png'] });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('最多支持 3 张图片')) {
        throw err;
      }
    }
  });

  // Test 9: text-to-speech tool (with mock client)
  await test('text-to-speech: should reject empty text', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerTextToSpeech(mockManager as any, os.tmpdir());

    try {
      await tool.execute('test-id', { text: '' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('text cannot be empty')) {
        throw err;
      }
    }
  });

  await test('text-to-speech: should generate audio', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerTextToSpeech(mockManager as any, os.tmpdir());

    const result = await tool.execute('test-id', { text: 'Hello world' });
    if (result.content[0].type !== 'text') throw new Error('Expected text content');
    if (!result.content[0].text?.includes('Text-to-speech completed')) throw new Error('Expected completion message');
    if (!mockClient.callLog.includes('textToSpeech')) throw new Error('textToSpeech was not called');
  });

  // Test 10: digital-avatar tool (with mock client)
  await test('digital-avatar: should reject missing audio file', async () => {
    const mockClient = await getMockClient();
    const mockManager = new MockClientManager(mockClient);

    const tool = registerDigitalAvatar(mockManager as any, os.tmpdir(), 100, 1000);

    try {
      await tool.execute('test-id', { audio_path: '/non/existent/audio.wav' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Audio file does not exist')) {
        throw err;
      }
    }
  });

  await test('digital-avatar: should process audio file', async () => {
    const mockClient = await getMockClient({
      submitDigitalAvatar: { code: 0, msg: 'success', resource_id: 'test-resource' },
      queryDigitalAvatarResult: { code: 0, msg: 'success', result: { status: 'done', video: 'dmlkZW9kYXRh' } }
    });
    const mockManager = new MockClientManager(mockClient);

    const tool = registerDigitalAvatar(mockManager as any, os.tmpdir(), 100, 1000);

    const testWav = createTestWav();
    const tempFile = createTempFile(testWav, '.wav');

    try {
      const result = await tool.execute('test-id', { audio_path: tempFile });
      if (result.content[0].type !== 'text') throw new Error('Expected text content');
      if (!result.content[0].text?.includes('Digital avatar completed')) throw new Error('Expected completion message');
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  // Test 11: mime.ts
  await test('mime: should detect image types', async () => {
    if (detectMime('test.jpg') !== 'image/jpeg') throw new Error('Expected image/jpeg for .jpg');
    if (detectMime('test.png') !== 'image/png') throw new Error('Expected image/png for .png');
    if (detectMime('test.gif') !== 'image/gif') throw new Error('Expected image/gif for .gif');
    if (detectMime('test.webp') !== 'image/webp') throw new Error('Expected image/webp for .webp');
  });

  await test('mime: should detect video types', async () => {
    if (detectMime('test.mp4') !== 'video/mp4') throw new Error('Expected video/mp4 for .mp4');
    if (detectMime('test.webm') !== 'video/webm') throw new Error('Expected video/webm for .webm');
    if (detectMime('test.avi') !== 'video/x-msvideo') throw new Error('Expected video/x-msvideo for .avi');
  });

  await test('mime: should return undefined for unknown types', async () => {
    if (detectMime('test.xyz') !== undefined) throw new Error('Expected undefined for unknown extension');
    if (detectMime('noextension') !== undefined) throw new Error('Expected undefined for no extension');
  });

  // Test 12: file utilities
  await test('file: should generate correct image paths', async () => {
    const path1 = generateImageOutputPath('test prompt', 0);
    if (!path1.includes('mediaclaw_t2i')) throw new Error('Expected mediaclaw_t2i prefix');
    if (!path1.endsWith('.png')) throw new Error('Expected .png extension');

    const path2 = generateImageOutputPath('test', 1);
    if (!path2.includes('_1.png')) throw new Error('Expected index suffix');
  });

  await test('file: should generate correct video paths', async () => {
    const path1 = generateVideoOutputPath('test prompt');
    if (!path1.includes('mediaclaw_video')) throw new Error('Expected mediaclaw_video prefix');
    if (!path1.endsWith('.mp4')) throw new Error('Expected .mp4 extension');

    const path2 = generateVideoOutputPath('test', 'custom_prefix');
    if (!path2.includes('custom_prefix')) throw new Error('Expected custom prefix');
  });

  await test('file: should generate correct audio paths', async () => {
    const path1 = generateAudioOutputPath('test text');
    if (!path1.includes('mediaclaw_tts')) throw new Error('Expected mediaclaw_tts prefix');
    if (!path1.endsWith('.mp3')) throw new Error('Expected .mp3 extension');

    const path2 = generateAudioOutputPath('test', undefined, 'wav');
    if (!path2.endsWith('.wav')) throw new Error('Expected .wav extension');
  });

  await test('file: should convert image to base64', async () => {
    const testImage = createTestImage();
    const tempFile = createTempFile(testImage, '.png');

    try {
      const base64 = imageToBase64(tempFile);
      if (typeof base64 !== 'string' || base64.length === 0) throw new Error('Expected base64 string');

      const dataUrl = imageToBase64DataUrl(tempFile);
      if (!dataUrl.startsWith('data:image/')) throw new Error('Expected data URL');
    } finally {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    }
  });

  await test('file: should reject non-existent file', async () => {
    try {
      imageToBase64('/non/existent/file.png');
      throw new Error('Should have thrown');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('图片文件不存在')) {
        throw err;
      }
    }
  });

  // Test 13: audio utilities
  await test('audio: should parse WAV info', async () => {
    const testWav = createTestWav();
    const info = parseWavInfo(testWav);

    if (!info) throw new Error('Expected WAV info');
    if (info.channels !== 1) throw new Error('Expected mono');
    if (info.sampleRate !== 24000) throw new Error('Expected 24000 sample rate');
    if (info.bitsPerSample !== 16) throw new Error('Expected 16 bits');
  });

  await test('audio: should reject non-WAV data', async () => {
    const notWav = Buffer.from('not a wav file');
    const info = parseWavInfo(notWav);

    if (info !== null) throw new Error('Expected null for non-WAV data');
  });

  // Test 14: polling utilities
  await test('polling: sleep should work', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    if (elapsed < 40) throw new Error('Sleep was too short');
  });

  // Wait for all async tests to complete
  await Promise.all(testPromises);
}

// Run tests
runTests().then(() => {
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  console.log(`Total: ${testResults.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

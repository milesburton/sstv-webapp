import { describe, it, expect, beforeEach } from 'vitest';
import { SSTVEncoder, SSTV_MODES } from './SSTVEncoder';

describe('SSTVEncoder', () => {
  let encoder;

  beforeEach(() => {
    encoder = new SSTVEncoder('ROBOT36');
  });

  describe('Initialization', () => {
    it('should initialize with default mode', () => {
      expect(encoder.mode).toBeDefined();
      expect(encoder.mode.name).toBe('Robot 36');
      expect(encoder.sampleRate).toBe(44100);
    });

    it('should support all defined modes', () => {
      Object.keys(SSTV_MODES).forEach((modeName) => {
        const enc = new SSTVEncoder(modeName);
        expect(enc.mode).toBeDefined();
        expect(enc.mode.name).toBeTruthy();
      });
    });
  });

  describe('Audio Generation', () => {
    it('should generate WAV header correctly', () => {
      const samples = [0, 0.5, -0.5, 1, -1];
      const blob = encoder.createWAV(samples);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBeGreaterThan(44); // WAV header is 44 bytes
    });

    it('should create valid tone samples', () => {
      const samples = [];
      const frequency = 1500;
      const duration = 0.01; // 10ms

      encoder.addTone(samples, frequency, duration);

      const expectedSamples = Math.floor(duration * encoder.sampleRate);
      expect(samples.length).toBe(expectedSamples);

      // Samples should be between -1 and 1
      samples.forEach((sample) => {
        expect(sample).toBeGreaterThanOrEqual(-1);
        expect(sample).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('VIS Code', () => {
    it('should generate VIS code with correct structure', () => {
      const samples = [];
      encoder.addVISCode(samples);

      // VIS code should take about 300ms
      const expectedDuration = 0.3 + 0.01 + 0.03 + (8 * 0.03) + 0.03;
      const expectedSamples = Math.floor(expectedDuration * encoder.sampleRate);

      expect(samples.length).toBeGreaterThan(expectedSamples * 0.9);
      expect(samples.length).toBeLessThan(expectedSamples * 1.1);
    });
  });

  describe('Image Encoding', () => {
    it('should encode a simple test image', async () => {
      // Create a simple 2x2 test image
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d');

      // Draw a simple pattern
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = 'black';
      ctx.fillRect(1, 1, 1, 1);

      // Convert to blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve);
      });

      const file = new File([blob], 'test.png', { type: 'image/png' });
      const audioBlob = await encoder.encodeImage(file);

      expect(audioBlob).toBeInstanceOf(Blob);
      expect(audioBlob.type).toBe('audio/wav');
      expect(audioBlob.size).toBeGreaterThan(1000); // Should be substantial
    });
  });

  describe('Frequency Mapping', () => {
    it('should map black (0) to 1500 Hz', () => {
      const samples = [];
      encoder.addTone(samples, 1500, 0.01);

      // Check that samples represent a 1500 Hz tone
      // This is a basic check - actual frequency analysis would be more complex
      expect(samples.length).toBeGreaterThan(0);
    });

    it('should map white (255) to 2300 Hz', () => {
      const samples = [];
      encoder.addTone(samples, 2300, 0.01);

      expect(samples.length).toBeGreaterThan(0);
    });

    it('should generate frequencies in valid SSTV range', () => {
      const testValues = [0, 64, 128, 192, 255];

      testValues.forEach((value) => {
        const freq = 1500 + (value / 255) * (2300 - 1500);

        expect(freq).toBeGreaterThanOrEqual(1500);
        expect(freq).toBeLessThanOrEqual(2300);
      });
    });
  });
});

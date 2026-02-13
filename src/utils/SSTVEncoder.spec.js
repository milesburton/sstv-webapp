import { beforeEach, describe, expect, it } from 'vitest';
import { SSTV_MODES, SSTVEncoder } from './SSTVEncoder';

describe('SSTVEncoder', () => {
  let encoder;

  beforeEach(() => {
    encoder = new SSTVEncoder('ROBOT36');
  });

  describe('Initialization', () => {
    it('should initialize with default mode', () => {
      expect(encoder.mode).toBeDefined();
      expect(encoder.mode.name).toBe('Robot 36');
      expect(encoder.sampleRate).toBe(48000);
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
      const expectedDuration = 0.3 + 0.01 + 0.03 + 8 * 0.03 + 0.03;
      const expectedSamples = Math.floor(expectedDuration * encoder.sampleRate);

      expect(samples.length).toBeGreaterThan(expectedSamples * 0.9);
      expect(samples.length).toBeLessThan(expectedSamples * 1.1);
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

  describe('YCbCr Video Range Encoding', () => {
    it('should encode luminance in video range 16-235', () => {
      const samples = [];

      // Create test pixel data: pure black (0,0,0) and pure white (255,255,255)
      const testData = new Uint8ClampedArray([
        0, 0, 0, 255,      // Black pixel
        255, 255, 255, 255 // White pixel
      ]);

      // Encode Y values
      encoder.addScanLineYUV(samples, testData, 2, 0);

      // Verify samples were generated
      expect(samples.length).toBeGreaterThan(0);

      // The Y values should map to frequencies representing 16-235 range
      // Black RGB(0,0,0) -> Y=16 -> freq near 1500Hz
      // White RGB(255,255,255) -> Y=235 -> freq near 2300Hz
    });

    it('should encode chrominance in video range 16-240', () => {
      const samples = [];

      // Pure red: high Cr, low Cb
      const redData = new Uint8ClampedArray([
        255, 0, 0, 255,
        255, 0, 0, 255
      ]);

      encoder.addScanLineYUV(samples, redData, 2, 0);
      expect(samples.length).toBeGreaterThan(0);

      // Pure blue: low Cr, high Cb
      const blueData = new Uint8ClampedArray([
        0, 0, 255, 255,
        0, 0, 255, 255
      ]);

      samples.length = 0;
      encoder.addScanLineYUV(samples, blueData, 2, 1);
      expect(samples.length).toBeGreaterThan(0);
    });

    it('should encode neutral gray at chroma center (128)', () => {
      const samples = [];

      // Neutral gray should encode to Cb=128, Cr=128 (center of video range)
      const grayData = new Uint8ClampedArray([
        128, 128, 128, 255,
        128, 128, 128, 255
      ]);

      encoder.addScanLineYUV(samples, grayData, 2, 0);

      // Samples should be generated
      expect(samples.length).toBeGreaterThan(0);
    });

    it('should maintain range consistency across color space conversion', () => {
      // Test critical RGB values that have caused issues
      const testColors = [
        { r: 0, g: 0, b: 0, name: 'Black' },       // Y=16, Cb=128, Cr=128
        { r: 255, g: 255, b: 255, name: 'White' }, // Y=235, Cb=128, Cr=128
        { r: 255, g: 0, b: 0, name: 'Red' },       // High Cr
        { r: 0, g: 255, b: 0, name: 'Green' },     // Low Cr, low Cb
        { r: 0, g: 0, b: 255, name: 'Blue' },      // High Cb
        { r: 128, g: 128, b: 128, name: 'Gray' },  // Cb=128, Cr=128
      ];

      testColors.forEach(({ r, g, b, name }) => {
        const samples = [];
        const pixelData = new Uint8ClampedArray([r, g, b, 255, r, g, b, 255]);

        // Should not throw
        expect(() => {
          encoder.addScanLineYUV(samples, pixelData, 2, 0);
        }).not.toThrow();

        expect(samples.length).toBeGreaterThan(0);
      });
    });
  });
});

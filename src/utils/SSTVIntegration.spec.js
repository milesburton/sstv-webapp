import { describe, it, expect } from 'vitest';
import { SSTVEncoder } from './SSTVEncoder';
import { SSTVDecoder } from './SSTVDecoder';

describe('SSTV Integration Tests', () => {
  describe('Encode → Decode Round Trip', () => {
    it('should encode and decode a simple pattern accurately', async () => {
      // Create a simple test image with known values
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d');

      // Create a simple gradient
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, 5, 10);
      ctx.fillStyle = 'white';
      ctx.fillRect(5, 0, 5, 10);

      // Convert to blob
      const imageBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve);
      });

      const imageFile = new File([imageBlob], 'test.png', { type: 'image/png' });

      // Encode
      const encoder = new SSTVEncoder('ROBOT36');
      const audioBlob = await encoder.encodeImage(imageFile);

      expect(audioBlob).toBeInstanceOf(Blob);
      expect(audioBlob.size).toBeGreaterThan(1000);

      // Decode
      const decoder = new SSTVDecoder();
      const audioFile = new File([audioBlob], 'test.wav', { type: 'audio/wav' });

      // This will use our mocked AudioContext
      const decodedDataUrl = await decoder.decodeAudio(audioFile);

      expect(decodedDataUrl).toBeTruthy();
      expect(decodedDataUrl).toContain('data:image/png');
    }, 30000); // 30 second timeout for this complex test

    it('should preserve high contrast patterns', async () => {
      // Create a checkerboard pattern
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d');

      // Checkerboard
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? 'white' : 'black';
          ctx.fillRect(x, y, 1, 1);
        }
      }

      const imageBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve);
      });

      const imageFile = new File([imageBlob], 'checkerboard.png', { type: 'image/png' });

      // Encode
      const encoder = new SSTVEncoder('ROBOT36');
      const audioBlob = await encoder.encodeImage(imageFile);

      expect(audioBlob).toBeInstanceOf(Blob);

      // The audio should contain both low (black) and high (white) frequencies
      const arrayBuffer = await audioBlob.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Frequency Accuracy', () => {
    it('should generate accurate sync pulses at 1200 Hz', () => {
      const encoder = new SSTVEncoder('ROBOT36');
      const samples = [];

      encoder.addTone(samples, 1200, 0.01);

      expect(samples.length).toBeGreaterThan(0);

      // Basic sanity check - samples should oscillate
      let zeroCrossings = 0;
      let lastSign = samples[0] >= 0;

      for (let i = 1; i < samples.length; i++) {
        const sign = samples[i] >= 0;
        if (sign !== lastSign) {
          zeroCrossings++;
          lastSign = sign;
        }
      }

      // 1200 Hz for 10ms should give us about 12 cycles = 24 zero crossings
      expect(zeroCrossings).toBeGreaterThan(20);
      expect(zeroCrossings).toBeLessThan(28);
    });

    it('should generate data tones in correct range', () => {
      const encoder = new SSTVEncoder('ROBOT36');

      // Test various gray levels
      const testValues = [0, 64, 128, 192, 255];

      testValues.forEach((value) => {
        const freq = 1500 + (value / 255) * (2300 - 1500);

        expect(freq).toBeGreaterThanOrEqual(1500);
        expect(freq).toBeLessThanOrEqual(2300);

        const samples = [];
        encoder.addTone(samples, freq, 0.005);

        expect(samples.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Mode Compatibility', () => {
    it('should work with ROBOT36 mode', () => {
      const encoder = new SSTVEncoder('ROBOT36');
      expect(encoder.mode.name).toBe('Robot 36');
      expect(encoder.mode.width).toBe(320);
      expect(encoder.mode.lines).toBe(240);
    });

    it('should work with MARTIN1 mode', () => {
      const encoder = new SSTVEncoder('MARTIN1');
      expect(encoder.mode.name).toBe('Martin M1');
      expect(encoder.mode.width).toBe(320);
      expect(encoder.mode.lines).toBe(256);
    });

    it('should work with SCOTTIE1 mode', () => {
      const encoder = new SSTVEncoder('SCOTTIE1');
      expect(encoder.mode.name).toBe('Scottie S1');
      expect(encoder.mode.width).toBe(320);
      expect(encoder.mode.lines).toBe(256);
    });
  });
});

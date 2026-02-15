import { describe, expect, it } from 'vitest';
import { FMDemodulator } from '../src/utils/FMDemodulator.js';

/**
 * Integration tests for FM demodulation pipeline
 * Tests the complete encode → FM demod → decode workflow
 */
describe('FM Demodulation Integration', () => {
  it('should demodulate SSTV-like signal pattern', () => {
    // Simulate SSTV line structure without full encode
    const sampleRate = 48000;
    const samples = [];

    // Sync pulse: 1200 Hz for 9ms
    for (let i = 0; i < 432; i++) {
      samples.push(Math.sin((2 * Math.PI * 1200 * i) / sampleRate));
    }

    // Porch: 1500 Hz for 3ms
    for (let i = 0; i < 144; i++) {
      samples.push(Math.sin((2 * Math.PI * 1500 * (432 + i)) / sampleRate));
    }

    // Data: sweep from 1500 to 2300 Hz over 88ms (Y scan)
    let phase = 0;
    for (let i = 0; i < 4224; i++) {
      const freq = 1500 + (800 * i) / 4224;
      phase += (2 * Math.PI * freq) / sampleRate;
      samples.push(Math.sin(phase));
    }

    // Test FM demodulation
    const fmDemod = new FMDemodulator(1900, 800, sampleRate);
    const demodulated = fmDemod.demodulateAll(new Float32Array(samples));

    expect(demodulated.length).toBe(samples.length);

    // Check sync detection region (should be very negative)
    // Note: FM demod clamps to ±1 to handle noisy signals
    const syncRegion = demodulated.slice(200, 400);
    const syncAvg = syncRegion.reduce((a, b) => a + b, 0) / syncRegion.length;
    expect(syncAvg).toBeLessThan(-0.9); // Sync at 1200 Hz is -700 Hz from center (clamped to -1)

    // Check data region (should show sweep from -1 to +1)
    const dataStart = demodulated.slice(600, 800);
    const dataEnd = demodulated.slice(4400, 4600);

    const startAvg = dataStart.reduce((a, b) => a + b, 0) / dataStart.length;
    const endAvg = dataEnd.reduce((a, b) => a + b, 0) / dataEnd.length;

    expect(startAvg).toBeLessThan(-0.7); // Should be near -1 (1500 Hz)
    expect(endAvg).toBeGreaterThan(0.7); // Should be near +1 (2300 Hz)
  });

  it('should handle frequency drift simulation', () => {
    const sampleRate = 48000;
    const duration = 0.1; // 100ms
    const numSamples = Math.floor(duration * sampleRate);

    // Generate signal with frequency drift (simulating Doppler)
    const samples = [];
    let phase = 0;

    for (let i = 0; i < numSamples; i++) {
      // Base frequency 1900 Hz with ±100 Hz drift
      const drift = 100 * Math.sin((2 * Math.PI * i) / numSamples);
      const freq = 1900 + drift;

      phase += (2 * Math.PI * freq) / sampleRate;
      samples.push(Math.sin(phase));
    }

    // Demodulate
    const fmDemod = new FMDemodulator(1900, 800, sampleRate);
    const output = fmDemod.demodulateAll(new Float32Array(samples));

    // Should track the frequency drift
    expect(output.length).toBe(numSamples);

    // Average output should be near 0 (centered on 1900 Hz)
    let avg = 0;
    for (let i = Math.floor(numSamples * 0.3); i < Math.floor(numSamples * 0.7); i++) {
      avg += output[i];
    }
    avg /= Math.floor(numSamples * 0.4);

    expect(Math.abs(avg)).toBeLessThan(0.3); // Should average near center
  });

  it('should decode SSTV data frequencies correctly', () => {
    const sampleRate = 48000;
    const fmDemod = new FMDemodulator(1900, 800, sampleRate);

    // Test black level (1500 Hz)
    const blackSamples = [];
    for (let i = 0; i < 480; i++) {
      blackSamples.push(Math.sin((2 * Math.PI * 1500 * i) / sampleRate));
    }
    const blackOutput = fmDemod.demodulateAll(new Float32Array(blackSamples));

    // After filter settling, should be around -1 (400 Hz below center)
    const blackAvg = blackOutput.slice(200).reduce((a, b) => a + b, 0) / 280;
    expect(blackAvg).toBeLessThan(-0.8);
    expect(blackAvg).toBeGreaterThan(-1.2);

    fmDemod.reset();

    // Test white level (2300 Hz)
    const whiteSamples = [];
    for (let i = 0; i < 480; i++) {
      whiteSamples.push(Math.sin((2 * Math.PI * 2300 * i) / sampleRate));
    }
    const whiteOutput = fmDemod.demodulateAll(new Float32Array(whiteSamples));

    // Should be around +1 (400 Hz above center)
    const whiteAvg = whiteOutput.slice(200).reduce((a, b) => a + b, 0) / 280;
    expect(whiteAvg).toBeGreaterThan(0.8);
    expect(whiteAvg).toBeLessThan(1.2);
  });

  it('should maintain accuracy across long signals', () => {
    const sampleRate = 48000;
    const fmDemod = new FMDemodulator(1900, 800, sampleRate);

    // 1 second of 2100 Hz (200 Hz above center)
    const samples = [];
    for (let i = 0; i < sampleRate; i++) {
      samples.push(Math.sin((2 * Math.PI * 2100 * i) / sampleRate));
    }

    const output = fmDemod.demodulateAll(new Float32Array(samples));

    // Check multiple segments for consistency
    const segments = 10;
    const segmentSize = Math.floor(sampleRate / segments);

    for (let seg = 1; seg < segments; seg++) {
      const start = seg * segmentSize;
      const end = start + Math.floor(segmentSize * 0.8);

      let avg = 0;
      for (let i = start; i < end; i++) {
        avg += output[i];
      }
      avg /= end - start;

      // Expected: (2100 - 1900) / 400 = 0.5
      expect(avg).toBeGreaterThan(0.4);
      expect(avg).toBeLessThan(0.6);
    }
  });

  it('should handle noisy signals', () => {
    const sampleRate = 48000;
    const fmDemod = new FMDemodulator(1900, 800, sampleRate);

    // Generate 1900 Hz signal with 10% noise
    const samples = [];
    for (let i = 0; i < 4800; i++) {
      const signal = Math.sin((2 * Math.PI * 1900 * i) / sampleRate);
      const noise = (Math.random() - 0.5) * 0.2; // ±10% noise
      samples.push(signal + noise);
    }

    const output = fmDemod.demodulateAll(new Float32Array(samples));

    // Despite noise, should still average near 0 (center freq)
    let avg = 0;
    for (let i = 1000; i < 4000; i++) {
      avg += output[i];
    }
    avg /= 3000;

    expect(Math.abs(avg)).toBeLessThan(0.2); // Kaiser filter should reduce noise
  });
});

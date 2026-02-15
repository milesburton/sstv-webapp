import { describe, expect, it } from 'vitest';
import { Complex } from '../src/utils/Complex.js';
import { FMDemodulator } from '../src/utils/FMDemodulator.js';
import { KaiserFIR } from '../src/utils/KaiserFIR.js';
import { Phasor } from '../src/utils/Phasor.js';

describe('FM Demodulation Components', () => {
  describe('Complex', () => {
    it('should perform complex multiplication correctly', () => {
      const a = new Complex(3, 4); // 3 + 4i
      const b = new Complex(1, 2); // 1 + 2i
      const result = a.mul(b); // (3 + 4i)(1 + 2i) = 3 + 6i + 4i + 8i² = 3 + 10i - 8 = -5 + 10i

      expect(result.real).toBeCloseTo(-5, 10);
      expect(result.imag).toBeCloseTo(10, 10);
    });

    it('should calculate magnitude correctly', () => {
      const c = new Complex(3, 4);
      expect(c.abs()).toBeCloseTo(5, 10); // sqrt(3² + 4²) = 5
    });

    it('should calculate phase correctly', () => {
      const c = new Complex(1, 1);
      expect(c.arg()).toBeCloseTo(Math.PI / 4, 10); // 45 degrees

      const c2 = new Complex(-1, 0);
      expect(c2.arg()).toBeCloseTo(Math.PI, 10); // 180 degrees
    });

    it('should create from polar coordinates', () => {
      const c = Complex.fromPolar(5, Math.PI / 4);
      expect(c.real).toBeCloseTo(5 * Math.cos(Math.PI / 4), 10);
      expect(c.imag).toBeCloseTo(5 * Math.sin(Math.PI / 4), 10);
    });
  });

  describe('Phasor', () => {
    it('should generate complex oscillation at correct frequency', () => {
      const sampleRate = 48000;
      const frequency = 1000; // 1 kHz
      const phasor = new Phasor(frequency, sampleRate);

      // After one full period (48 samples at 48kHz for 1kHz), phase should wrap back
      const samples = [];
      for (let i = 0; i < 48; i++) {
        samples.push(phasor.rotate());
      }

      // First sample should be at phase 0 (1 + 0i)
      expect(samples[0].real).toBeCloseTo(1, 5);
      expect(samples[0].imag).toBeCloseTo(0, 5);

      // After one period, should be back near start
      const lastSample = samples[samples.length - 1];
      expect(lastSample.abs()).toBeCloseTo(1, 5); // Magnitude should stay 1
    });

    it('should maintain unit magnitude', () => {
      const phasor = new Phasor(1900, 48000);

      for (let i = 0; i < 1000; i++) {
        const value = phasor.rotate();
        expect(value.abs()).toBeCloseTo(1, 10);
      }
    });

    it('should wrap phase correctly', () => {
      const phasor = new Phasor(10000, 48000); // High frequency for fast phase wrapping

      for (let i = 0; i < 100; i++) {
        phasor.rotate();
        // Phase should always be in [-π, π]
        expect(phasor.phase).toBeGreaterThanOrEqual(-Math.PI);
        expect(phasor.phase).toBeLessThanOrEqual(Math.PI);
      }
    });
  });

  describe('KaiserFIR', () => {
    it('should pass DC (0 Hz) for lowpass filter', () => {
      const sampleRate = 48000;
      const cutoff = 1000; // 1 kHz cutoff
      const filter = new KaiserFIR(cutoff, sampleRate, 0.002);

      // Feed constant DC signal
      const dcValue = new Complex(1, 0);
      let output;
      for (let i = 0; i < 100; i++) {
        output = filter.push(dcValue);
      }

      // After convergence, DC should pass through (gain ≈ 1)
      expect(output.real).toBeCloseTo(1, 1);
      expect(output.imag).toBeCloseTo(0, 1);
    });

    it('should attenuate high frequencies', () => {
      const sampleRate = 48000;
      const cutoff = 400; // 400 Hz cutoff (for SSTV)
      const filter = new KaiserFIR(cutoff, sampleRate, 0.002);

      // Generate high-frequency signal (well above cutoff)
      const highFreq = 2000; // 2 kHz
      const phasor = new Phasor(highFreq, sampleRate);

      let output;
      for (let i = 0; i < 200; i++) {
        output = filter.push(phasor.rotate());
      }

      // High frequency should be attenuated significantly
      expect(output.abs()).toBeLessThan(0.1);
    });

    it('should have normalized DC gain', () => {
      const filter = new KaiserFIR(1000, 48000, 0.002);

      // Sum of taps should be 1 (normalized)
      const sum = filter.taps.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('FMDemodulator', () => {
    it('should demodulate constant frequency signal', () => {
      const sampleRate = 48000;
      const centerFreq = 1900; // SSTV center
      const bandwidth = 800;
      const demod = new FMDemodulator(centerFreq, bandwidth, sampleRate);

      // Generate signal at center frequency (1900 Hz)
      const samples = [];
      for (let i = 0; i < sampleRate; i++) {
        // 1 second of 1900 Hz tone
        samples.push(Math.sin((2 * Math.PI * centerFreq * i) / sampleRate));
      }

      const output = demod.demodulateAll(new Float32Array(samples));

      // After initial convergence, output should be near 0 (center freq)
      let avgOutput = 0;
      for (let i = Math.floor(sampleRate * 0.1); i < sampleRate; i++) {
        avgOutput += output[i];
      }
      avgOutput /= sampleRate * 0.9;

      expect(avgOutput).toBeCloseTo(0, 1);
    });

    it('should track frequency changes', () => {
      const sampleRate = 48000;
      const centerFreq = 1900;
      const bandwidth = 800;
      const demod = new FMDemodulator(centerFreq, bandwidth, sampleRate);

      // Generate signal that sweeps from 1500 Hz to 2300 Hz
      const samples = [];
      const duration = 0.1; // 100ms
      const numSamples = Math.floor(duration * sampleRate);

      let phase = 0;
      for (let i = 0; i < numSamples; i++) {
        // Linear frequency sweep from 1500 to 2300 Hz
        const freq = 1500 + (800 * i) / numSamples;
        // Integrate frequency to get phase
        phase += (2 * Math.PI * freq) / sampleRate;
        samples.push(Math.sin(phase));
      }

      const output = demod.demodulateAll(new Float32Array(samples));

      // First quarter should be negative (below center, around 1500-1700 Hz)
      const firstQuarter = output.slice(
        Math.floor(numSamples * 0.15),
        Math.floor(numSamples * 0.35)
      );
      const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      expect(avgFirst).toBeLessThan(-0.2);

      // Last quarter should be positive (above center, around 2100-2300 Hz)
      const lastQuarter = output.slice(
        Math.floor(numSamples * 0.65),
        Math.floor(numSamples * 0.85)
      );
      const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      expect(avgLast).toBeGreaterThan(0.2);
    });

    it('should handle SSTV frequency range', () => {
      const sampleRate = 48000;
      const demod = new FMDemodulator(1900, 800, sampleRate);

      // Test black frequency (1500 Hz) - should give negative output
      const blackSamples = [];
      for (let i = 0; i < 1000; i++) {
        blackSamples.push(Math.sin((2 * Math.PI * 1500 * i) / sampleRate));
      }
      const blackOutput = demod.demodulateAll(new Float32Array(blackSamples));
      const avgBlack = blackOutput.slice(500).reduce((a, b) => a + b, 0) / 500;
      expect(avgBlack).toBeLessThan(-0.5); // Significantly below center

      demod.reset();

      // Test white frequency (2300 Hz) - should give positive output
      const whiteSamples = [];
      for (let i = 0; i < 1000; i++) {
        whiteSamples.push(Math.sin((2 * Math.PI * 2300 * i) / sampleRate));
      }
      const whiteOutput = demod.demodulateAll(new Float32Array(whiteSamples));
      const avgWhite = whiteOutput.slice(500).reduce((a, b) => a + b, 0) / 500;
      expect(avgWhite).toBeGreaterThan(0.5); // Significantly above center
    });

    it('should reset state correctly', () => {
      const demod = new FMDemodulator(1900, 800, 48000);

      // Process some samples
      const samples = new Float32Array(100).fill(0.5);
      demod.demodulateAll(samples);

      // Reset
      demod.reset();

      // Previous phase should be reset
      expect(demod.prevPhase).toBe(0);
    });
  });
});

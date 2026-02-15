import { Complex } from './Complex.js';
import { KaiserFIR } from './KaiserFIR.js';
import { Phasor } from './Phasor.js';

/**
 * FM Demodulator using phase-difference method
 * Converts audio samples to instantaneous frequency values
 * Based on smolgroot/sstv-decoder and xdsopl/robot36
 */
export class FMDemodulator {
  /**
   * @param {number} centerFreq - Center frequency in Hz (1900 Hz for SSTV)
   * @param {number} bandwidth - Signal bandwidth in Hz (800 Hz for SSTV: 1500-2300 Hz)
   * @param {number} sampleRate - Audio sample rate in Hz
   */
  constructor(centerFreq, bandwidth, sampleRate) {
    this.sampleRate = sampleRate;
    this.bandwidth = bandwidth;

    // Phasor for baseband conversion (shifts center freq to 0)
    this.phasor = new Phasor(centerFreq, sampleRate);

    // Kaiser-windowed FIR lowpass filter
    // Cutoff at bandwidth/2 to suppress out-of-band noise
    // Duration: 2ms (enough for ~4 cycles at 1900 Hz)
    const filterDuration = 0.002;
    const cutoffFreq = bandwidth / 2; // 400 Hz for SSTV
    this.lowpass = new KaiserFIR(cutoffFreq, sampleRate, filterDuration, 8.0);

    // Phase difference demodulation state
    this.prevPhase = 0;

    // Scale factor: converts phase difference to normalized frequency
    // Phase difference per sample for a frequency deviation Δf from center:
    // Δφ = 2π * Δf / sampleRate
    // We want output of ±1 for Δf = ±bandwidth/2 (e.g., ±400 Hz for 800 Hz BW)
    // At Δf = bandwidth/2: Δφ = 2π * (bandwidth/2) / sampleRate
    // To normalize: scale = 1 / Δφ = sampleRate / (2π * bandwidth/2) = sampleRate / (π * bandwidth)
    // But this gives huge values, so we need: 1 / (Δφ_max) where Δφ_max = 2π*(BW/2)/SR
    // Simpler: to map Δf to [-1, +1], use: output = Δf / (bandwidth/2)
    // Since Δφ = 2π*Δf/SR, then Δf = Δφ*SR/(2π)
    // So: output = (Δφ*SR/(2π)) / (bandwidth/2) = Δφ * SR / (π * bandwidth)
    this.scale = sampleRate / (Math.PI * bandwidth);
  }

  /**
   * Demodulate single audio sample
   * @param {number} sample - Real audio sample
   * @returns {number} - Normalized frequency (-1 to +1, where ±1 = ±bandwidth/2)
   */
  demodulate(sample) {
    // 1. Convert to complex baseband (shift center frequency to DC)
    const basebandSample = new Complex(sample, 0).mul(this.phasor.rotate());

    // 2. Apply lowpass filter to remove high-frequency components
    const filtered = this.lowpass.push(basebandSample);

    // 3. FM demodulation: phase difference
    const phase = filtered.arg(); // Get phase angle [-π, π]
    let delta = phase - this.prevPhase;

    // Wrap phase difference to [-π, π]
    if (delta > Math.PI) {
      delta -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
      delta += 2 * Math.PI;
    }

    this.prevPhase = phase;

    // 4. Scale phase difference to frequency
    // Output range: -1 to +1 for ±bandwidth/2
    let normalized = this.scale * delta;

    // Clamp to expected range to handle noisy signals
    normalized = Math.max(-1, Math.min(1, normalized));

    return normalized;
  }

  /**
   * Demodulate array of samples
   * @param {Float32Array|Array} samples - Audio samples
   * @returns {Float32Array} - Demodulated frequency values
   */
  demodulateAll(samples) {
    const output = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      output[i] = this.demodulate(samples[i]);
    }
    return output;
  }

  /**
   * Reset demodulator state
   */
  reset() {
    this.phasor.reset();
    this.lowpass.reset();
    this.prevPhase = 0;
  }
}

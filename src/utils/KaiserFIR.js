import { Complex } from './Complex.js';

/**
 * Kaiser-windowed FIR lowpass filter for complex signals
 * Based on smolgroot/sstv-decoder and xdsopl/robot36
 */
export class KaiserFIR {
  /**
   * @param {number} cutoffFreq - Cutoff frequency in Hz
   * @param {number} sampleRate - Sample rate in Hz
   * @param {number} duration - Filter duration in seconds
   * @param {number} beta - Kaiser window beta parameter (controls stopband attenuation)
   */
  constructor(cutoffFreq, sampleRate, duration, beta = 8.0) {
    // Calculate number of taps (must be odd for symmetric filter)
    const numTaps = Math.floor(duration * sampleRate) | 1; // Ensure odd
    this.taps = new Array(numTaps);

    // Normalized cutoff frequency (0 to 1, where 1 = Nyquist)
    const normalizedCutoff = (2 * cutoffFreq) / sampleRate;

    // Generate Kaiser-windowed sinc filter
    const center = (numTaps - 1) / 2;
    for (let i = 0; i < numTaps; i++) {
      const x = i - center;

      // Sinc function: sin(π*x*fc) / (π*x*fc)
      let sinc;
      if (x === 0) {
        sinc = normalizedCutoff; // lim x→0 of sinc(x) = 1, scaled by cutoff
      } else {
        const arg = Math.PI * x * normalizedCutoff;
        sinc = Math.sin(arg) / arg;
      }

      // Kaiser window
      const kaiserWindow = this.kaiser(i, numTaps, beta);

      // Windowed sinc
      this.taps[i] = sinc * kaiserWindow;
    }

    // Normalize taps so DC gain = 1
    const sum = this.taps.reduce((a, b) => a + b, 0);
    for (let i = 0; i < numTaps; i++) {
      this.taps[i] /= sum;
    }

    // Delay line for convolution (circular buffer)
    this.buffer = new Array(numTaps).fill(null).map(() => new Complex(0, 0));
    this.bufferIndex = 0;
  }

  /**
   * Kaiser window function
   * w(n) = I₀(β * sqrt(1 - ((n - N/2) / (N/2))²)) / I₀(β)
   */
  kaiser(n, N, beta) {
    const alpha = (N - 1) / 2;
    const arg = beta * Math.sqrt(1 - ((n - alpha) / alpha) ** 2);
    return this.besselI0(arg) / this.besselI0(beta);
  }

  /**
   * Modified Bessel function of the first kind, order 0
   * I₀(x) approximation using series expansion
   */
  besselI0(x) {
    let sum = 1.0;
    let term = 1.0;
    const threshold = 1e-12;

    for (let k = 1; k < 50; k++) {
      term *= (x / (2 * k)) * (x / (2 * k));
      sum += term;
      if (term < threshold * sum) break;
    }

    return sum;
  }

  /**
   * Push new complex sample through filter
   * @param {Complex} sample - Input complex sample
   * @returns {Complex} - Filtered output
   */
  push(sample) {
    // Add sample to circular buffer
    this.buffer[this.bufferIndex] = sample;
    this.bufferIndex = (this.bufferIndex + 1) % this.buffer.length;

    // Convolve: output = sum(buffer[i] * taps[i])
    let real = 0;
    let imag = 0;

    for (let i = 0; i < this.taps.length; i++) {
      // Access buffer in correct order (oldest to newest)
      const bufIdx = (this.bufferIndex + i) % this.buffer.length;
      const bufSample = this.buffer[bufIdx];
      const tap = this.taps[i];

      real += bufSample.real * tap;
      imag += bufSample.imag * tap;
    }

    return new Complex(real, imag);
  }

  /**
   * Reset filter state
   */
  reset() {
    this.buffer.fill(new Complex(0, 0));
    this.bufferIndex = 0;
  }
}

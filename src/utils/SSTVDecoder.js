// SSTV Decoder - Converts SSTV audio signals to images

import { SSTV_MODES } from './SSTVEncoder';

const FREQ_SYNC = 1200;
const FREQ_BLACK = 1500;
const FREQ_WHITE = 2300;

export class SSTVDecoder {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.mode = null;
  }

  async decodeAudio(audioFile) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get audio samples
    const samples = audioBuffer.getChannelData(0);
    this.sampleRate = audioBuffer.sampleRate;

    // Detect VIS code to determine mode
    this.mode = this.detectMode(samples);

    if (!this.mode) {
      throw new Error('Could not detect SSTV mode. Try manually selecting a mode.');
    }

    // Decode image
    return this.decodeImage(samples);
  }

  detectMode(samples) {
    // Look for VIS code in first 2 seconds
    const searchSamples = Math.min(samples.length, this.sampleRate * 2);

    // Find VIS start bit (1900 Hz for ~30ms)
    for (let i = 0; i < searchSamples - 1000; i++) {
      const freq = this.detectFrequency(samples, i, 0.03);

      if (Math.abs(freq - 1900) < 50) {
        // Found potential VIS start, decode the mode bits
        const visCode = this.decodeVIS(samples, i);

        // Find matching mode
        for (const [key, mode] of Object.entries(SSTV_MODES)) {
          if (mode.visCode === visCode) {
            console.log(`Detected SSTV mode: ${mode.name}`);
            return mode;
          }
        }
      }
    }

    // Default to Robot 36 if not detected
    console.log('Mode detection failed, defaulting to Robot 36');
    return SSTV_MODES.ROBOT36;
  }

  decodeVIS(samples, startIdx) {
    let idx = startIdx + Math.floor(0.03 * this.sampleRate); // Skip start bit
    let visCode = 0;

    for (let bit = 0; bit < 7; bit++) {
      const freq = this.detectFrequency(samples, idx, 0.03);
      const bitValue = freq < 1200 ? 1 : 0; // 1100 Hz = 1, 1300 Hz = 0

      if (bitValue) {
        visCode |= (1 << bit);
      }

      idx += Math.floor(0.03 * this.sampleRate);
    }

    return visCode;
  }

  decodeImage(samples) {
    const canvas = document.createElement('canvas');
    canvas.width = this.mode.width;
    canvas.height = this.mode.lines;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(canvas.width, canvas.height);

    // Initialize all pixels to black with full opacity
    // This ensures pixels that don't get decoded are opaque rather than transparent
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 0;     // R
      imageData.data[i + 1] = 0; // G
      imageData.data[i + 2] = 0; // B
      imageData.data[i + 3] = 255; // A - critical for visibility
    }

    // Find first sync pulse to align - skip VIS code area
    // VIS code: leader(300ms) + break(10ms) + start(30ms) + 8bits(240ms) + stop(30ms) = ~610ms
    const visCodeDuration = 0.7; // Skip past VIS code with margin
    const searchStart = Math.floor(visCodeDuration * this.sampleRate);
    let position = this.findSyncPulse(samples, searchStart);

    if (position === -1) {
      console.warn('Could not find first sync pulse, trying from beginning...');
      position = this.findSyncPulse(samples, 0);
      if (position === -1) {
        throw new Error('Could not find sync pulse. Make sure this is a valid SSTV transmission.');
      }
    }

    console.log(`Starting decode at position ${position}, sample rate: ${this.sampleRate}`);

    // Decode each line
    for (let y = 0; y < this.mode.lines && position < samples.length; y++) {
      // Skip sync pulse and porch
      position += Math.floor((this.mode.syncPulse + this.mode.syncPorch) * this.sampleRate);

      if (this.mode.colorFormat === 'RGB') {
        // Decode Green
        position = this.decodeScanLine(samples, position, imageData, y, 1);

        // Skip separator
        if (this.mode.separatorPulse) {
          position += Math.floor(this.mode.separatorPulse * this.sampleRate);
        }

        // Decode Blue
        position = this.decodeScanLine(samples, position, imageData, y, 2);

        // Skip separator
        if (this.mode.separatorPulse) {
          position += Math.floor(this.mode.separatorPulse * this.sampleRate);
        }

        // Decode Red
        position = this.decodeScanLine(samples, position, imageData, y, 0);
      } else {
        // Decode Y (luminance) for Robot modes
        position = this.decodeScanLineY(samples, position, imageData, y);
      }

      // Find next sync pulse
      const nextSync = this.findSyncPulse(samples, position);
      if (nextSync !== -1) {
        position = nextSync;
      }

      // Progress callback could go here
      if (y % 10 === 0) {
        console.log(`Decoding: ${Math.floor((y / this.mode.lines) * 100)}%`);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
  }

  decodeScanLine(samples, startPos, imageData, y, channel) {
    const samplesPerPixel = Math.floor((this.mode.scanTime * this.sampleRate) / this.mode.width);

    for (let x = 0; x < this.mode.width; x++) {
      const pos = startPos + x * samplesPerPixel;

      if (pos >= samples.length) break;

      // Use a wider frequency sweep for more accuracy
      const freq = this.detectFrequencyRange(samples, pos, this.mode.scanTime / this.mode.width);

      // Map frequency to pixel value with clamping
      let value = ((freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK)) * 255;
      value = Math.max(0, Math.min(255, Math.round(value)));

      // Debug logging for first few pixels
      if (y < 3 && x < 5) {
        console.log(`RGB Pixel [${x},${y}] ch${channel}: freq=${freq.toFixed(0)}Hz → value=${value}`);
      }

      const idx = (y * this.mode.width + x) * 4;
      imageData.data[idx + channel] = value;
      imageData.data[idx + 3] = 255; // Alpha
    }

    return startPos + Math.floor(this.mode.scanTime * this.sampleRate);
  }

  // Detect frequency across the full SSTV range
  detectFrequencyRange(samples, startIdx, duration) {
    const numSamples = Math.floor(duration * this.sampleRate);
    const endIdx = Math.min(startIdx + numSamples, samples.length);

    if (endIdx - startIdx < 10) return FREQ_BLACK;

    // Sweep through the SSTV frequency range in steps
    let maxMag = 0;
    let detectedFreq = FREQ_BLACK;

    // Coarse sweep first (every 100 Hz)
    for (let freq = FREQ_BLACK - 200; freq <= FREQ_WHITE + 200; freq += 100) {
      const magnitude = this.goertzel(samples, startIdx, endIdx, freq);
      if (magnitude > maxMag) {
        maxMag = magnitude;
        detectedFreq = freq;
      }
    }

    // Fine sweep around the detected frequency (every 20 Hz)
    const fineStart = Math.max(FREQ_BLACK - 200, detectedFreq - 100);
    const fineEnd = Math.min(FREQ_WHITE + 200, detectedFreq + 100);

    for (let freq = fineStart; freq <= fineEnd; freq += 20) {
      const magnitude = this.goertzel(samples, startIdx, endIdx, freq);
      if (magnitude > maxMag) {
        maxMag = magnitude;
        detectedFreq = freq;
      }
    }

    return detectedFreq;
  }

  decodeScanLineY(samples, startPos, imageData, y) {
    const samplesPerPixel = Math.floor((this.mode.scanTime * this.sampleRate) / this.mode.width);

    for (let x = 0; x < this.mode.width; x++) {
      const pos = startPos + x * samplesPerPixel;

      if (pos >= samples.length) break;

      const freq = this.detectFrequencyRange(samples, pos, this.mode.scanTime / this.mode.width);

      // Map frequency to luminance
      let Y = ((freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK)) * 255;
      Y = Math.max(0, Math.min(255, Math.round(Y)));

      // Debug logging for first few pixels
      if (y < 3 && x < 5) {
        console.log(`YUV Pixel [${x},${y}]: freq=${freq.toFixed(0)}Hz → Y=${Y}, pos=${pos}`);
      }

      // For now, use Y for all RGB channels (grayscale)
      // Full color Robot decoding would need separate Y, R-Y, B-Y scans
      const idx = (y * this.mode.width + x) * 4;
      imageData.data[idx] = Y;     // R
      imageData.data[idx + 1] = Y; // G
      imageData.data[idx + 2] = Y; // B
      imageData.data[idx + 3] = 255; // Alpha
    }

    return startPos + Math.floor(this.mode.scanTime * this.sampleRate);
  }

  findSyncPulse(samples, startPos) {
    const syncDuration = Math.max(0.004, this.mode?.syncPulse || 0.005);
    const samplesPerCheck = Math.floor(this.sampleRate * 0.001); // Check every 1ms

    for (let i = startPos; i < samples.length - Math.floor(syncDuration * this.sampleRate); i += samplesPerCheck) {
      const freq = this.detectFrequency(samples, i, syncDuration);

      // More lenient sync detection - allow 100 Hz tolerance
      if (Math.abs(freq - FREQ_SYNC) < 100) {
        // Verify it's actually a sync by checking duration
        let syncValid = true;

        // Sample a few points through the sync pulse
        for (let j = 0; j < 3; j++) {
          const checkPos = i + Math.floor((syncDuration * this.sampleRate * j) / 3);
          const checkFreq = this.detectFrequency(samples, checkPos, syncDuration / 3);
          if (Math.abs(checkFreq - FREQ_SYNC) > 150) {
            syncValid = false;
            break;
          }
        }

        if (syncValid) {
          return i;
        }
      }
    }

    return -1;
  }

  detectFrequency(samples, startIdx, duration) {
    const numSamples = Math.floor(duration * this.sampleRate);
    const endIdx = Math.min(startIdx + numSamples, samples.length);

    if (endIdx - startIdx < 10) return 0;

    // Use Goertzel algorithm for more accurate frequency detection
    // Test for common SSTV frequencies
    const testFreqs = [1200, 1500, 1900, 2300];
    let maxMag = 0;
    let detectedFreq = 1500;

    for (const freq of testFreqs) {
      const magnitude = this.goertzel(samples, startIdx, endIdx, freq);
      if (magnitude > maxMag) {
        maxMag = magnitude;
        detectedFreq = freq;
      }
    }

    // If we have a strong signal, interpolate for more accuracy
    if (maxMag > 0.1) {
      // Fine-tune around the detected frequency
      const step = 50;
      for (let f = detectedFreq - step; f <= detectedFreq + step; f += 10) {
        const magnitude = this.goertzel(samples, startIdx, endIdx, f);
        if (magnitude > maxMag) {
          maxMag = magnitude;
          detectedFreq = f;
        }
      }
    }

    return detectedFreq;
  }

  // Goertzel algorithm for single-frequency DFT
  goertzel(samples, startIdx, endIdx, targetFreq) {
    const N = endIdx - startIdx;
    const k = Math.round(N * targetFreq / this.sampleRate);
    const omega = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(omega);

    let s1 = 0;
    let s2 = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    const realPart = s1 - s2 * Math.cos(omega);
    const imagPart = s2 * Math.sin(omega);

    return Math.sqrt(realPart * realPart + imagPart * imagPart) / N;
  }

  async decodeWithMode(audioFile, modeName) {
    this.mode = SSTV_MODES[modeName];

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const samples = audioBuffer.getChannelData(0);
    this.sampleRate = audioBuffer.sampleRate;

    return this.decodeImage(samples);
  }
}

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

    // Find first sync pulse to align
    let position = this.findSyncPulse(samples, 0);

    if (position === -1) {
      throw new Error('Could not find sync pulse');
    }

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

      const freq = this.detectFrequency(samples, pos, this.mode.scanTime / this.mode.width);

      // Map frequency to pixel value
      const value = Math.max(0, Math.min(255,
        ((freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK)) * 255
      ));

      const idx = (y * this.mode.width + x) * 4;
      imageData.data[idx + channel] = value;
      imageData.data[idx + 3] = 255; // Alpha
    }

    return startPos + Math.floor(this.mode.scanTime * this.sampleRate);
  }

  decodeScanLineY(samples, startPos, imageData, y) {
    const samplesPerPixel = Math.floor((this.mode.scanTime * this.sampleRate) / this.mode.width);

    for (let x = 0; x < this.mode.width; x++) {
      const pos = startPos + x * samplesPerPixel;

      if (pos >= samples.length) break;

      const freq = this.detectFrequency(samples, pos, this.mode.scanTime / this.mode.width);

      // Map frequency to luminance
      const Y = Math.max(0, Math.min(255,
        ((freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK)) * 255
      ));

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
    const syncDuration = 0.005; // ~5ms
    const samplesPerCheck = Math.floor(syncDuration * this.sampleRate);

    for (let i = startPos; i < samples.length - samplesPerCheck; i += samplesPerCheck) {
      const freq = this.detectFrequency(samples, i, syncDuration);

      if (Math.abs(freq - FREQ_SYNC) < 50) {
        return i;
      }
    }

    return -1;
  }

  detectFrequency(samples, startIdx, duration) {
    const numSamples = Math.floor(duration * this.sampleRate);
    const endIdx = Math.min(startIdx + numSamples, samples.length);

    if (endIdx - startIdx < 10) return 0;

    // Simple zero-crossing frequency detection
    let crossings = 0;
    let lastSign = samples[startIdx] >= 0;

    for (let i = startIdx + 1; i < endIdx; i++) {
      const sign = samples[i] >= 0;
      if (sign !== lastSign) {
        crossings++;
        lastSign = sign;
      }
    }

    const actualDuration = (endIdx - startIdx) / this.sampleRate;
    const frequency = (crossings / 2) / actualDuration;

    return frequency;
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

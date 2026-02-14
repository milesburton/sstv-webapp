// SSTV Decoder - Converts SSTV audio signals to images

import { SSTV_MODES } from './SSTVEncoder.js';

const FREQ_SYNC = 1200;
const FREQ_BLACK = 1500;
const FREQ_WHITE = 2300;

export class SSTVDecoder {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.mode = null;
  }

  async decodeAudio(audioFile) {
    // CRITICAL: Force AudioContext to use 48kHz to match encoder
    // Browser default is often 44.1kHz which causes timing mismatch
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000,
    });
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get audio samples
    const samples = audioBuffer.getChannelData(0);
    this.sampleRate = audioBuffer.sampleRate;
    // audioContext can be closed after decoding
    audioContext.close();

    // Detect VIS code to determine mode
    this.mode = this.detectMode(samples);

    if (!this.mode) {
      throw new Error('Could not detect SSTV mode. Try manually selecting a mode.');
    }

    if (typeof window !== 'undefined') {
      console.log('📡 SSTV Mode detected:', this.mode.name);
    }

    // Decode image
    return this.decodeImage(samples);
  }

  detectMode(samples) {
    // Look for VIS code in first 2 seconds
    const searchSamples = Math.min(samples.length, this.sampleRate * 2);

    // Find VIS start bit (1900 Hz for ~30ms)
    // Step by ~0.5ms for better resolution to catch VIS start
    const step = Math.floor(this.sampleRate * 0.0005);
    for (let i = 0; i < searchSamples - 1000; i += step) {
      const freq = this.detectFrequency(samples, i, 0.03);

      // More lenient VIS start detection (1900 Hz ± 75 Hz)
      if (Math.abs(freq - 1900) < 75) {
        // Found potential VIS start, decode the mode bits
        const visCode = this.decodeVIS(samples, i);

        // Find matching mode
        for (const [_key, mode] of Object.entries(SSTV_MODES)) {
          if (mode.visCode === visCode) {
            return mode;
          }
        }
      }
    }

    return SSTV_MODES.ROBOT36;
  }

  decodeVIS(samples, startIdx) {
    let idx = startIdx + Math.floor(0.03 * this.sampleRate); // Skip start bit
    let visCode = 0;
    const frequenciesDetected = [];

    for (let bit = 0; bit < 7; bit++) {
      const freq = this.detectFrequency(samples, idx, 0.03);
      frequenciesDetected.push(freq);
      const bitValue = freq < 1200 ? 1 : 0; // 1100 Hz = 1, 1300 Hz = 0

      if (bitValue) {
        visCode |= 1 << bit;
      }

      idx += Math.floor(0.03 * this.sampleRate);
    }

    // Log VIS frequencies for debugging (only in development)
    if (typeof window !== 'undefined') {
      console.log('📡 VIS Frequencies detected:', frequenciesDetected);
      console.log(
        '📡 VIS Code decoded:',
        visCode,
        '(binary:',
        visCode.toString(2).padStart(7, '0'),
        ')'
      );
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
      imageData.data[i] = 0; // R
      imageData.data[i + 1] = 0; // G
      imageData.data[i + 2] = 0; // B
      imageData.data[i + 3] = 255; // A - critical for visibility
    }

    // For YUV modes, we need temporary storage for chrominance
    // Initialize to 128 (neutral gray) instead of 0 to prevent green tint if decoding fails
    let chromaU = null;
    let chromaV = null;
    if (this.mode.colorFormat === 'YUV') {
      chromaU = new Array(this.mode.width * this.mode.lines).fill(128);
      chromaV = new Array(this.mode.width * this.mode.lines).fill(128);
    }

    // Find first sync pulse to align - search from multiple positions
    // Try starting from several positions to find the first real line sync
    const searchPositions = [
      Math.floor(0.61 * this.sampleRate), // Standard VIS duration
      Math.floor(0.5 * this.sampleRate), // Earlier position
      Math.floor(0.8 * this.sampleRate), // Later position
      0, // From beginning if all else fails
    ];

    let position = -1;
    for (const startPos of searchPositions) {
      position = this.findSyncPulse(samples, startPos);
      if (position !== -1) {
        break;
      }
    }

    if (position === -1) {
      throw new Error('Could not find sync pulse. Make sure this is a valid SSTV transmission.');
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
        // YUV mode (Robot): Each line has Y + separator + porch + chrominance
        // Robot36 timing: Y=88ms, separator=4.5ms, porch=1.5ms, chroma=44ms

        // Step 1: Decode Y (luminance) for this line (88ms)
        position = this.decodeScanLineYUV(samples, position, imageData, y);

        // Step 2: Skip separator and determine chroma type (4.5ms)
        if (position < samples.length) {
          const sepDuration = 0.0045;

          // Use line number to determine chroma type
          // Separator: Even lines = 1500Hz (V/R-Y), Odd lines = 2300Hz (U/B-Y)
          // Note: Separator frequency is unreliable in real-world signals
          const isEvenLine = y % 2 === 0;
          this.currentChromaType = isEvenLine ? 'V' : 'U';

          position += Math.floor(sepDuration * this.sampleRate);

          // Step 3: Skip porch (1.5ms)
          position += Math.floor(0.0015 * this.sampleRate);

          // Step 4: Decode chrominance at half resolution (44ms)
          if (position < samples.length) {
            position = this.decodeScanLineChroma(
              samples,
              position,
              chromaU,
              chromaV,
              y,
              this.currentChromaType
            );
          }
        }
      }

      // Find next sync pulse within a reasonable window (2x line duration)
      const maxLineDuration =
        (this.mode.syncPulse + this.mode.syncPorch + this.mode.scanTime * 3) * 2;
      const searchLimit = position + Math.floor(maxLineDuration * this.sampleRate);
      const nextSync = this.findSyncPulse(samples, position, searchLimit);
      if (nextSync !== -1) {
        position = nextSync;
      } else {
        // If sync not found, advance by expected line duration
        // This helps maintain alignment even if sync detection is weak
        const expectedLinePosition =
          position + Math.floor(this.mode.scanTime * this.sampleRate * 0.5);
        if (expectedLinePosition < samples.length) {
          // Try to find sync in an expanded window
          const expandedSync = this.findSyncPulse(
            samples,
            expectedLinePosition,
            expectedLinePosition + Math.floor(maxLineDuration * this.sampleRate)
          );
          position = expandedSync !== -1 ? expandedSync : expectedLinePosition;
        }
      }
    }

    // After decoding all lines, convert YUV to RGB if needed
    if (this.mode.colorFormat === 'YUV') {
      this.convertYUVtoRGB(imageData, chromaU, chromaV);
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
  }

  decodeScanLine(samples, startPos, imageData, y, channel) {
    const samplesPerPixel = Math.floor((this.mode.scanTime * this.sampleRate) / this.mode.width);

    // Use multi-pixel window for better frequency resolution
    // Single pixel has insufficient resolution for Goertzel
    // Use 4-pixel window for improved frequency discrimination
    const pixelGroupSize = 4;

    for (let x = 0; x < this.mode.width; x++) {
      const pos = startPos + x * samplesPerPixel;

      if (pos >= samples.length) break;

      // Use wider analysis window for better frequency discrimination
      let freq;
      if (pos + pixelGroupSize * samplesPerPixel <= samples.length) {
        // Enough samples for multi-pixel analysis
        freq = this.detectFrequencyRange(
          samples,
          pos,
          (this.mode.scanTime / this.mode.width) * pixelGroupSize
        );
      } else {
        // Fall back to shorter window at end of data
        const availableTime = (samples.length - pos) / this.sampleRate;
        freq = this.detectFrequencyRange(samples, pos, availableTime);
      }

      // Map frequency to pixel value with clamping
      let value = ((freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK)) * 255;
      value = Math.max(0, Math.min(255, Math.round(value)));

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

    // Coarse sweep (every 25 Hz for better initial detection)
    for (let freq = FREQ_SYNC - 100; freq <= FREQ_WHITE + 200; freq += 25) {
      const magnitude = this.goertzel(samples, startIdx, endIdx, freq);
      if (magnitude > maxMag) {
        maxMag = magnitude;
        detectedFreq = freq;
      }
    }

    // Fine sweep around the detected frequency (every 1 Hz for accuracy)
    // Narrower search range since coarse is more accurate now
    const fineStart = Math.max(FREQ_SYNC - 100, detectedFreq - 30);
    const fineEnd = Math.min(FREQ_WHITE + 200, detectedFreq + 30);

    for (let freq = fineStart; freq <= fineEnd; freq += 1) {
      const magnitude = this.goertzel(samples, startIdx, endIdx, freq);
      if (magnitude > maxMag) {
        maxMag = magnitude;
        detectedFreq = freq;
      }
    }

    return detectedFreq;
  }

  decodeScanLineYUV(samples, startPos, imageData, y) {
    // Robot36: Y scan is 88ms for full width
    const Y_SCAN_TIME = 0.088;
    const samplesPerPixel = Math.floor((Y_SCAN_TIME * this.sampleRate) / this.mode.width);

    // Use larger pixel group for better frequency resolution
    // At 48kHz, 13.2 samples/pixel * 8 pixels = ~106 samples ≈ 2.2ms window
    const pixelGroupSize = 8;
    const groupSamples = samplesPerPixel * pixelGroupSize;

    for (let x = 0; x < this.mode.width; x++) {
      const pos = startPos + x * samplesPerPixel;

      if (pos >= samples.length) break;

      // Use wider analysis window for better frequency discrimination
      let freq;
      if (pos + groupSamples <= samples.length) {
        freq = this.detectFrequencyRange(
          samples,
          pos,
          (Y_SCAN_TIME / this.mode.width) * pixelGroupSize
        );
      } else {
        const availableTime = (samples.length - pos) / this.sampleRate;
        freq = this.detectFrequencyRange(samples, pos, availableTime);
      }

      // Map frequency to Y value (video range: 16-235)
      const normalized = (freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK);
      let value = 16 + normalized * (235 - 16);
      value = Math.max(16, Math.min(235, Math.round(value)));

      // Store Y directly in image data as grayscale (will be corrected later)
      const pixelIdx = (y * this.mode.width + x) * 4;
      imageData.data[pixelIdx] = value; // R
      imageData.data[pixelIdx + 1] = value; // G
      imageData.data[pixelIdx + 2] = value; // B
      imageData.data[pixelIdx + 3] = 255; // Alpha
    }

    return startPos + Math.floor(Y_SCAN_TIME * this.sampleRate);
  }

  decodeScanLineChroma(samples, startPos, chromaU, chromaV, y, componentType) {
    // Robot36: Chrominance scan is 44ms at half horizontal resolution
    const CHROMA_SCAN_TIME = 0.044;
    const halfWidth = Math.floor(this.mode.width / 2);
    const samplesPerPixel = Math.floor((CHROMA_SCAN_TIME * this.sampleRate) / halfWidth);

    // Chroma scan is 44ms for 160 pixels = 0.275ms per pixel
    // Reference implementation uses WINDOW_FACTOR = 0.98 for Robot modes
    // window = pixel_time * 0.98 = 0.000275 * 0.98 = 0.0002695s ≈ 0.27ms
    const pixelTime = CHROMA_SCAN_TIME / halfWidth;
    const windowDuration = pixelTime * 0.98;
    const windowSamples = Math.floor(windowDuration * this.sampleRate);

    for (let x = 0; x < halfWidth; x++) {
      const pixelPos = startPos + x * samplesPerPixel;

      // Center the window on the MIDDLE of the pixel, not the start
      const pixelCenter = pixelPos + Math.floor(samplesPerPixel / 2);
      const windowStart = Math.max(0, Math.floor(pixelCenter - windowSamples / 2));
      const windowEnd = windowStart + windowSamples;

      // Make sure we have enough samples for the window
      if (windowEnd >= samples.length) break;

      // Detect frequency at this pixel position (using centered window)
      const freq = this.detectFrequencyRange(samples, windowStart, windowDuration);

      // Map frequency to component value (video range: 16-240)
      const normalized = (freq - FREQ_BLACK) / (FREQ_WHITE - FREQ_BLACK);
      let value = 16 + normalized * (240 - 16);
      value = Math.max(16, Math.min(240, Math.round(value)));

      const chromaValue = value;

      // Store chrominance for two pixels (expanding from half resolution)
      const idx1 = y * this.mode.width + x * 2;
      const idx2 = y * this.mode.width + x * 2 + 1;

      if (componentType === 'U') {
        chromaU[idx1] = chromaValue;
        if (idx2 < this.mode.width * this.mode.lines) {
          chromaU[idx2] = chromaValue;
        }
      } else if (componentType === 'V') {
        chromaV[idx1] = chromaValue;
        if (idx2 < this.mode.width * this.mode.lines) {
          chromaV[idx2] = chromaValue;
        }
      }
    }

    return startPos + Math.floor(CHROMA_SCAN_TIME * this.sampleRate);
  }

  convertYUVtoRGB(imageData, chromaU, chromaV) {
    // Convert YUV to RGB using ITU-R BT.601 standard
    // Process line pairs: even line has V (R-Y), odd line has U (B-Y)
    // Both lines in a pair use the same chrominance values
    for (let y = 0; y < this.mode.lines; y += 2) {
      // For this line pair, get V from even line and U from odd line
      const evenLine = y;
      const oddLine = Math.min(y + 1, this.mode.lines - 1);

      for (let x = 0; x < this.mode.width; x++) {
        // CRITICAL FIX: Chroma is stored at x*2 indices (half resolution expanded to full)
        // When we stored chroma for pixel x, we put it at indices x*2 and x*2+1
        // So when retrieving for pixel x, we need to read from index x (which maps to x/2 chroma pixel)
        const evenChromaIdx = evenLine * this.mode.width + x;
        const oddChromaIdx = oddLine * this.mode.width + x;

        const V = chromaV[evenChromaIdx] || 128; // V from even line (default to neutral 128, not 0!)
        const U = chromaU[oddChromaIdx] || 128; // U from odd line (default to neutral 128, not 0!)

        // Apply to both lines in the pair
        for (let ly = evenLine; ly <= oddLine && ly < this.mode.lines; ly++) {
          const idx = (ly * this.mode.width + x) * 4;

          // Get Y (already stored in imageData as R component)
          const Y = imageData.data[idx];

          // ITU-R BT.601 YCbCr to RGB conversion (video range)
          // Matching the C reference implementation
          const yTerm = 298.082 * (Y - 16.0);
          let R = 0.003906 * (yTerm + 408.583 * (V - 128));
          let G = 0.003906 * (yTerm - 100.291 * (U - 128) - 208.12 * (V - 128));
          let B = 0.003906 * (yTerm + 516.411 * (U - 128));

          // Clamp to valid range
          R = Math.max(0, Math.min(255, Math.round(R)));
          G = Math.max(0, Math.min(255, Math.round(G)));
          B = Math.max(0, Math.min(255, Math.round(B)));

          // Update pixel
          imageData.data[idx] = R;
          imageData.data[idx + 1] = G;
          imageData.data[idx + 2] = B;
        }
      }
    }
  }

  findSyncPulse(samples, startPos, endPos = samples.length) {
    const syncDuration = Math.max(0.004, this.mode?.syncPulse || 0.005);
    const samplesPerCheck = Math.floor(this.sampleRate * 0.0002); // Check every 0.2ms for finer resolution
    const searchEnd = Math.min(endPos, samples.length - Math.floor(syncDuration * this.sampleRate));

    for (let i = startPos; i < searchEnd; i += samplesPerCheck) {
      const freq = this.detectFrequency(samples, i, syncDuration);

      // More lenient sync detection - allow 200 Hz tolerance for real-world signals
      if (Math.abs(freq - FREQ_SYNC) < 200) {
        // Verify it's actually a sync by checking duration
        let syncValid = true;

        // Sample a few points through the sync pulse
        for (let j = 0; j < 3; j++) {
          const checkPos = i + Math.floor((syncDuration * this.sampleRate * j) / 3);
          const checkFreq = this.detectFrequency(samples, checkPos, syncDuration / 3);
          if (Math.abs(checkFreq - FREQ_SYNC) > 200) {
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
    // Test for common SSTV frequencies with extended range
    const testFreqs = [
      1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300,
    ];
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
    if (maxMag > 0.05) {
      // Fine-tune around the detected frequency with wider range for noisy signals
      const step = 100;
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
    // Use exact frequency, not rounded to nearest bin
    // This allows fractional bins for better accuracy
    const k = (N * targetFreq) / this.sampleRate;
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

    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000,
    });
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const samples = audioBuffer.getChannelData(0);
    this.sampleRate = audioBuffer.sampleRate;

    return this.decodeImage(samples);
  }
}

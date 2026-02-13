// SSTV Encoder - Converts images to SSTV audio signals

const SSTV_MODES = {
  ROBOT36: {
    name: 'Robot 36',
    visCode: 0x08,
    scanTime: 0.15, // seconds per line
    lines: 240,
    width: 320,
    colorScan: true,
    syncPulse: 0.009,
    syncPorch: 0.003,
    colorFormat: 'YUV',
  },
  MARTIN1: {
    name: 'Martin M1',
    visCode: 0x2c,
    scanTime: 0.146, // seconds per line
    lines: 256,
    width: 320,
    colorScan: false,
    syncPulse: 0.004862,
    syncPorch: 0.000572,
    separatorPulse: 0.000572,
    colorFormat: 'RGB',
  },
  SCOTTIE1: {
    name: 'Scottie S1',
    visCode: 0x3c,
    scanTime: 0.138,
    lines: 256,
    width: 320,
    colorScan: false,
    syncPulse: 0.009,
    syncPorch: 0.0015,
    separatorPulse: 0.0015,
    colorFormat: 'RGB',
  },
};

const FREQ_SYNC = 1200; // Hz - sync pulse
const FREQ_BLACK = 1500; // Hz - black level
const FREQ_WHITE = 2300; // Hz - white level
const FREQ_VIS_BIT1 = 1100; // Hz - VIS bit 1
const FREQ_VIS_BIT0 = 1300; // Hz - VIS bit 0
const FREQ_VIS_START = 1900; // Hz - VIS start bit
const FREQ_VIS_STOP = 1200; // Hz - VIS stop bit

export class SSTVEncoder {
  constructor(mode = 'ROBOT36', sampleRate = 48000) {
    this.mode = SSTV_MODES[mode];
    this.sampleRate = sampleRate;
    this.phase = 0; // Continuous phase across tone boundaries
  }

  async encodeImage(imageFile) {
    const img = await this.loadImage(imageFile);
    const canvas = document.createElement('canvas');
    canvas.width = this.mode.width;
    canvas.height = this.mode.lines;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return this.generateAudio(imageData);
  }

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    });
  }

  generateAudio(imageData) {
    const samples = [];

    this.addVISCode(samples);
    this.addImageData(samples, imageData);

    return this.createWAV(samples);
  }

  addVISCode(samples) {
    // VIS code structure: Leader tone → Start bit → Mode bits → Parity → Stop bit

    // Leader tone (300ms of 1900 Hz)
    this.addTone(samples, 1900, 0.3);

    // Break (10ms of 1200 Hz)
    this.addTone(samples, 1200, 0.01);

    // VIS start bit (30ms of 1900 Hz)
    this.addTone(samples, FREQ_VIS_START, 0.03);

    // 7 data bits (LSB first) + parity bit
    const visCode = this.mode.visCode;
    let parity = 0;

    for (let i = 0; i < 7; i++) {
      const bit = (visCode >> i) & 1;
      parity ^= bit;
      const freq = bit ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0;
      this.addTone(samples, freq, 0.03);
    }

    // Parity bit
    const freq = parity ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0;
    this.addTone(samples, freq, 0.03);

    // Stop bit (30ms of 1200 Hz)
    this.addTone(samples, FREQ_VIS_STOP, 0.03);
  }

  addImageData(samples, imageData) {
    const { data, width, height } = imageData;

    for (let y = 0; y < height; y++) {
      // Sync pulse
      this.addTone(samples, FREQ_SYNC, this.mode.syncPulse);

      // Sync porch
      this.addTone(samples, FREQ_BLACK, this.mode.syncPorch);

      if (this.mode.colorFormat === 'RGB') {
        // RGB scan (separate scans for each color)
        // Green scan
        this.addScanLine(samples, data, width, y, 1); // G channel

        if (this.mode.separatorPulse) {
          this.addTone(samples, FREQ_SYNC, this.mode.separatorPulse);
        }

        // Blue scan
        this.addScanLine(samples, data, width, y, 2); // B channel

        if (this.mode.separatorPulse) {
          this.addTone(samples, FREQ_SYNC, this.mode.separatorPulse);
        }

        // Red scan
        this.addScanLine(samples, data, width, y, 0); // R channel
      } else {
        // YUV scan (Robot modes): Each line has Y + separator + chrominance
        this.addScanLineYUV(samples, data, width, y);
      }
    }
  }

  addScanLine(samples, data, width, y, channel) {
    const timePerPixel = this.mode.scanTime / width;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const value = data[idx + channel]; // R=0, G=1, B=2

      // Map 0-255 to FREQ_BLACK-FREQ_WHITE
      const freq = FREQ_BLACK + (value / 255) * (FREQ_WHITE - FREQ_BLACK);

      this.addTone(samples, freq, timePerPixel);
    }
  }

  addScanLineYUV(samples, data, width, y) {
    // Robot36 timing constants (from reference implementation)
    const Y_SCAN_TIME = 0.088; // 88ms for Y scan
    const SEPARATOR_TIME = 0.0045; // 4.5ms separator
    const PORCH_TIME = 0.0015; // 1.5ms porch
    const CHROMA_SCAN_TIME = 0.044; // 44ms for chrominance

    const timePerYPixel = Y_SCAN_TIME / width;
    const timePerChromaPixel = CHROMA_SCAN_TIME / (width / 2);

    // Robot modes: Each line contains Y (luminance) + separator + porch + chrominance
    // Step 1: Send Y (luminance) for full width (88ms total)
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // ITU-R BT.601 Y calculation
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const freq = FREQ_BLACK + (Y / 255) * (FREQ_WHITE - FREQ_BLACK);

      this.addTone(samples, freq, timePerYPixel);
    }

    // Step 2: Separator pulse (4.5ms) - alternates between lines
    // Even lines: 1500Hz (U follows), Odd lines: 2300Hz (V follows)
    const sepFreq = y % 2 === 0 ? FREQ_BLACK : FREQ_WHITE;
    this.addTone(samples, sepFreq, SEPARATOR_TIME);

    // Step 3: Porch (1.5ms)
    this.addTone(samples, FREQ_BLACK, PORCH_TIME);

    // Step 4: Send chrominance at half horizontal resolution (44ms total)
    // Even lines: U (B-Y), Odd lines: V (R-Y)
    const isULine = y % 2 === 0;

    for (let x = 0; x < width; x += 2) {
      // Average two adjacent pixels for chroma
      const idx1 = (y * width + x) * 4;
      const idx2 = (y * width + Math.min(x + 1, width - 1)) * 4;

      const r = (data[idx1] + data[idx2]) / 2;
      const g = (data[idx1 + 1] + data[idx2 + 1]) / 2;
      const b = (data[idx1 + 2] + data[idx2 + 2]) / 2;

      // ITU-R BT.601 chrominance calculation
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const U = 0.492 * (b - Y); // B-Y component
      const V = 0.877 * (r - Y); // R-Y component

      const chromaValue = isULine ? U : V;

      // Map chrominance to frequency range
      // Chrominance ranges from approximately -111 to +111 for U, -156 to +156 for V
      // Map to 0-255 range, then to frequency
      const normalizedChroma = ((chromaValue + 156) / 312) * 255;
      const clampedChroma = Math.max(0, Math.min(255, normalizedChroma));
      const freq = FREQ_BLACK + (clampedChroma / 255) * (FREQ_WHITE - FREQ_BLACK);

      this.addTone(samples, freq, timePerChromaPixel);
    }
  }

  addTone(samples, frequency, duration) {
    const numSamples = Math.floor(duration * this.sampleRate);
    const phaseIncrement = (2 * Math.PI * frequency) / this.sampleRate;

    for (let i = 0; i < numSamples; i++) {
      samples.push(Math.sin(this.phase));
      this.phase += phaseIncrement;
    }

    // Keep phase in [0, 2π) to avoid floating point drift
    this.phase %= 2 * Math.PI;
  }

  createWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export { SSTV_MODES };

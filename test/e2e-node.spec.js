/**
 * End-to-End Node.js Integration Test
 * Tests the complete encode→decode workflow WITHOUT requiring a browser
 * This catches bugs BEFORE deployment
 */

import { createCanvas } from 'canvas';
import { describe, expect, it } from 'vitest';
import { SSTVEncoder } from '../src/utils/SSTVEncoder.js';

// Mock AudioContext for Node.js environment
class MockAudioContext {
  constructor() {
    this.sampleRate = 48000;
  }

  decodeAudioData(arrayBuffer) {
    // Parse WAV file header to extract PCM samples
    const view = new DataView(arrayBuffer);

    // Skip WAV header (44 bytes)
    const numSamples = (arrayBuffer.byteLength - 44) / 2;
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const sample = view.getInt16(44 + i * 2, true);
      samples[i] = sample / 32768.0; // Convert to -1.0 to 1.0
    }

    return Promise.resolve({
      sampleRate: this.sampleRate,
      getChannelData: () => samples,
    });
  }

  close() {
    return Promise.resolve();
  }
}

// Import decoder with mocked AudioContext
let SSTVDecoder;
beforeAll(async () => {
  global.window = { AudioContext: MockAudioContext };
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvas(320, 240);
      }
      return {};
    },
  };

  const module = await import('../src/utils/SSTVDecoder.js');
  SSTVDecoder = module.SSTVDecoder;
});

afterAll(() => {
  delete global.window;
  delete global.document;
});

describe('E2E: Encode → Decode Integration', () => {
  it('should encode and decode a test pattern maintaining colors', async () => {
    // Create test image: Red | Green | Blue sections
    const width = 320;
    const height = 240;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw RGB test pattern
    ctx.fillStyle = '#FF0000'; // Red
    ctx.fillRect(0, 0, width / 3, height);
    ctx.fillStyle = '#00FF00'; // Green
    ctx.fillRect(width / 3, 0, width / 3, height);
    ctx.fillStyle = '#0000FF'; // Blue
    ctx.fillRect((2 * width) / 3, 0, width / 3, height);

    const imageData = ctx.getImageData(0, 0, width, height);

    // Step 1: Encode
    const encoder = new SSTVEncoder('ROBOT36');
    const audioBlob = encoder.generateAudio(imageData);

    expect(audioBlob).toBeInstanceOf(Blob);
    expect(audioBlob.type).toBe('audio/wav');
    expect(audioBlob.size).toBeGreaterThan(10000);

    // Step 2: Decode
    const decoder = new SSTVDecoder(48000);
    const decodedDataUrl = await decoder.decodeAudio(audioBlob);

    expect(decodedDataUrl).toBeDefined();
    expect(decodedDataUrl).toMatch(/^data:image\/png;base64,/);

    // Step 3: Analyze decoded image
    const base64Data = decodedDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    // Load decoded image
    const { Image } = await import('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgBuffer;
    });

    const verifyCanvas = createCanvas(img.width, img.height);
    const verifyCtx = verifyCanvas.getContext('2d');
    verifyCtx.drawImage(img, 0, 0);
    const decodedData = verifyCtx.getImageData(0, 0, img.width, img.height);

    // Step 4: Verify decoded image has actual color data
    const pixels = decodedData.data;
    let redPixels = 0;
    let greenPixels = 0;
    let bluePixels = 0;
    let blackPixels = 0;
    const totalPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Check for dominant color
      if (r > 150 && g < 100 && b < 100) redPixels++;
      else if (g > 150 && r < 100 && b < 100) greenPixels++;
      else if (b > 150 && r < 100 && g < 100) bluePixels++;
      else if (r < 50 && g < 50 && b < 50) blackPixels++;
    }

    // Log results BEFORE assertions
    console.log('✅ E2E Test Results:');
    console.log(`   Red pixels: ${redPixels} (${((redPixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Green pixels: ${greenPixels} (${((greenPixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Blue pixels: ${bluePixels} (${((bluePixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Black pixels: ${blackPixels} (${((blackPixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Total pixels: ${totalPixels}`);

    // CRITICAL VALIDATIONS
    // At least 5% of pixels should be red (left section)
    expect(redPixels).toBeGreaterThan(totalPixels * 0.05);

    // At least 5% of pixels should be green (middle section)
    expect(greenPixels).toBeGreaterThan(totalPixels * 0.05);

    // At least 5% of pixels should be blue (right section)
    expect(bluePixels).toBeGreaterThan(totalPixels * 0.05);

    // NOT mostly black (indicates decoding failure)
    expect(blackPixels).toBeLessThan(totalPixels * 0.5);

    console.log('✅ E2E Test Results:');
    console.log(`   Red pixels: ${redPixels} (${((redPixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Green pixels: ${greenPixels} (${((greenPixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Blue pixels: ${bluePixels} (${((bluePixels / totalPixels) * 100).toFixed(1)}%)`);
    console.log(`   Total pixels: ${totalPixels}`);
  }, 30000); // 30 second timeout

  it('should decode neutral gray without color shift to green', async () => {
    // Create solid gray image
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080'; // Mid gray
    ctx.fillRect(0, 0, 320, 240);

    const imageData = ctx.getImageData(0, 0, 320, 240);

    // Encode
    const encoder = new SSTVEncoder('ROBOT36');
    const audioBlob = encoder.generateAudio(imageData);

    // Decode
    const decoder = new SSTVDecoder(48000);
    const decodedDataUrl = await decoder.decodeAudio(audioBlob);

    // Analyze
    const base64Data = decodedDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    const { Image } = await import('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgBuffer;
    });

    const verifyCanvas = createCanvas(img.width, img.height);
    const verifyCtx = verifyCanvas.getContext('2d');
    verifyCtx.drawImage(img, 0, 0);
    const decodedData = verifyCtx.getImageData(0, 0, img.width, img.height);

    // Calculate average color
    const pixels = decodedData.data;
    let totalR = 0, totalG = 0, totalB = 0;
    const numPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
      totalR += pixels[i];
      totalG += pixels[i + 1];
      totalB += pixels[i + 2];
    }

    const avgR = totalR / numPixels;
    const avgG = totalG / numPixels;
    const avgB = totalB / numPixels;

    // Gray should have balanced RGB (all channels similar)
    const colorBalance = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);

    // Log BEFORE assertions
    console.log('✅ Gray Test Results:');
    console.log(`   Avg R: ${avgR.toFixed(1)}, G: ${avgG.toFixed(1)}, B: ${avgB.toFixed(1)}`);
    console.log(`   Balance: ${colorBalance.toFixed(1)} (should be < 80)`);

    // CRITICAL: Should NOT be heavily green-shifted
    // If green is dominant, this test will fail
    expect(avgG).toBeLessThan(avgR * 2); // Green should not be 2x red
    expect(avgG).toBeLessThan(avgB * 2); // Green should not be 2x blue
    expect(colorBalance).toBeLessThan(80); // Channels should be within 80 of each other

    console.log('✅ Gray Test Results:');
    console.log(`   Avg R: ${avgR.toFixed(1)}, G: ${avgG.toFixed(1)}, B: ${avgB.toFixed(1)}`);
    console.log(`   Balance: ${colorBalance.toFixed(1)} (should be < 80)`);
  }, 30000);
});

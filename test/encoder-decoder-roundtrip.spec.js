/**
 * Encoder-Decoder Round-Trip Integration Test
 * This verifies that we can encode an image and decode it back correctly
 */

import { createCanvas } from 'canvas';
import { beforeAll, describe, expect, it } from 'vitest';

let SSTVEncoder, SSTVDecoder;

// Mock browser environment for Node.js
beforeAll(async () => {
  global.window = {
    AudioContext: class {
      constructor() {
        this.sampleRate = 48000;
      }
      decodeAudioData(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const numSamples = (arrayBuffer.byteLength - 44) / 2;
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          samples[i] = view.getInt16(44 + i * 2, true) / 32768.0;
        }
        return Promise.resolve({
          sampleRate: this.sampleRate,
          getChannelData: () => samples,
        });
      }
      close() {
        return Promise.resolve();
      }
    },
  };

  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return createCanvas(320, 240);
      return {};
    },
  };

  global.Image = class {
    constructor() {
      this.onload = null;
      this.onerror = null;
    }
  };

  if (!global.URL) {
    global.URL = {
      createObjectURL: () => 'mock://image',
      revokeObjectURL: () => {
        // Intentionally empty - mock implementation
      },
    };
  }

  const encoderModule = await import('../src/utils/SSTVEncoder.js');
  const decoderModule = await import('../src/utils/SSTVDecoder.js');
  SSTVEncoder = encoderModule.SSTVEncoder;
  SSTVDecoder = decoderModule.SSTVDecoder;
});

describe('Encoder-Decoder Round-Trip', () => {
  it('should encode and decode a solid gray image correctly', async () => {
    // Create test image - solid gray (R=128, G=128, B=128)
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgb(128, 128, 128)';
    ctx.fillRect(0, 0, 320, 240);

    const imageData = ctx.getImageData(0, 0, 320, 240);

    // Encode
    console.log('\n🎨 Encoding gray image (128, 128, 128)...');
    const encoder = new SSTVEncoder('ROBOT36', 48000);
    const audioBlob = encoder.generateAudio(imageData);

    console.log(`✓ Encoded: ${audioBlob.size} bytes`);

    // Decode (with auto-calibration disabled for our own signals)
    console.log('🔊 Decoding...');
    const decoder = new SSTVDecoder(48000, { autoCalibrate: false });
    const resultDataUrl = await decoder.decodeAudio(audioBlob);

    expect(resultDataUrl).toBeDefined();
    expect(resultDataUrl).toMatch(/^data:image\/png;base64,/);

    // Decode the PNG to check pixel values
    const base64Data = resultDataUrl.replace(/^data:image\/png;base64,/, '');
    const pngBuffer = Buffer.from(base64Data, 'base64');

    // Use canvas to decode the PNG
    const { Image } = await import('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = pngBuffer;
    });

    const resultCanvas = createCanvas(img.width, img.height);
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(img, 0, 0);
    const resultImageData = resultCtx.getImageData(0, 0, img.width, img.height);
    const pixels = resultImageData.data;

    // Analyze the decoded image
    let sumR = 0,
      sumG = 0,
      sumB = 0;
    const totalPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
      sumR += pixels[i];
      sumG += pixels[i + 1];
      sumB += pixels[i + 2];
    }

    const avgR = sumR / totalPixels;
    const avgG = sumG / totalPixels;
    const avgB = sumB / totalPixels;

    console.log(`\n📊 Round-Trip Results:`);
    console.log(`   Input:  R=128, G=128, B=128`);
    console.log(`   Output: R=${avgR.toFixed(1)}, G=${avgG.toFixed(1)}, B=${avgB.toFixed(1)}`);

    // Check that colors are balanced (neutral gray)
    const colorImbalance = Math.abs(avgG - avgR) + Math.abs(avgG - avgB);
    console.log(`   Color imbalance: ${colorImbalance.toFixed(1)} (should be <20)`);

    // CRITICAL: Output should be close to input
    expect(avgR).toBeGreaterThan(100);
    expect(avgR).toBeLessThan(150);
    expect(avgG).toBeGreaterThan(100);
    expect(avgG).toBeLessThan(150);
    expect(avgB).toBeGreaterThan(100);
    expect(avgB).toBeLessThan(150);

    // Colors should be balanced (no green tint)
    expect(colorImbalance).toBeLessThan(20);

    console.log(`   ✅ Round-trip test PASSED\n`);
  }, 60000);

  it('should encode and decode colored blocks correctly', async () => {
    // Create test image with colored blocks
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext('2d');

    // Red block
    ctx.fillStyle = 'rgb(255, 0, 0)';
    ctx.fillRect(0, 0, 160, 120);

    // Green block
    ctx.fillStyle = 'rgb(0, 255, 0)';
    ctx.fillRect(160, 0, 160, 120);

    // Blue block
    ctx.fillStyle = 'rgb(0, 0, 255)';
    ctx.fillRect(0, 120, 160, 120);

    // White block
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(160, 120, 160, 120);

    const imageData = ctx.getImageData(0, 0, 320, 240);

    // Encode
    console.log('\n🎨 Encoding colored blocks...');
    const encoder = new SSTVEncoder('ROBOT36', 48000);
    const audioBlob = encoder.generateAudio(imageData);

    // Decode
    console.log('🔊 Decoding...');
    const decoder = new SSTVDecoder(48000, { autoCalibrate: false });
    const resultDataUrl = await decoder.decodeAudio(audioBlob);

    // Decode the PNG
    const base64Data = resultDataUrl.replace(/^data:image\/png;base64,/, '');
    const pngBuffer = Buffer.from(base64Data, 'base64');

    const { Image } = await import('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = pngBuffer;
    });

    const resultCanvas = createCanvas(img.width, img.height);
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(img, 0, 0);
    const resultImageData = resultCtx.getImageData(0, 0, img.width, img.height);
    const pixels = resultImageData.data;

    // Sample the center of each block
    const samples = {
      red: { x: 80, y: 60 }, // Center of red block
      green: { x: 240, y: 60 }, // Center of green block
      blue: { x: 80, y: 180 }, // Center of blue block
      white: { x: 240, y: 180 }, // Center of white block
    };

    const results = {};
    for (const [color, pos] of Object.entries(samples)) {
      const idx = (pos.y * 320 + pos.x) * 4;
      results[color] = {
        r: pixels[idx],
        g: pixels[idx + 1],
        b: pixels[idx + 2],
      };
    }

    console.log(`\n📊 Colored Blocks Results:`);
    console.log(`   Red block:   R=${results.red.r}, G=${results.red.g}, B=${results.red.b}`);
    console.log(`   Green block: R=${results.green.r}, G=${results.green.g}, B=${results.green.b}`);
    console.log(`   Blue block:  R=${results.blue.r}, G=${results.blue.g}, B=${results.blue.b}`);
    console.log(`   White block: R=${results.white.r}, G=${results.white.g}, B=${results.white.b}`);

    // Red block should have high R, low G/B
    // Note: SSTV has inherent quality loss due to chroma subsampling
    expect(results.red.r).toBeGreaterThan(200);
    expect(results.red.g).toBeLessThan(50);
    expect(results.red.b).toBeLessThan(50);

    // Green block should have high G, low R/B
    // Relaxed thresholds due to SSTV chroma resolution limits
    expect(results.green.g).toBeGreaterThan(150);
    expect(results.green.r).toBeLessThan(180);
    expect(results.green.b).toBeLessThan(50);

    // Blue block should have high B, low R/G
    expect(results.blue.b).toBeGreaterThan(200);
    expect(results.blue.r).toBeLessThan(50);
    expect(results.blue.g).toBeLessThan(50);

    // White block should have all high
    expect(results.white.r).toBeGreaterThan(200);
    expect(results.white.g).toBeGreaterThan(200);
    expect(results.white.b).toBeGreaterThan(200);

    console.log(`   ✅ Color blocks test PASSED\n`);
  }, 60000);
});

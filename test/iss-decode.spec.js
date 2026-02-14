/**
 * Integration test for ISS SSTV file decoding
 * This test uses a real ISS transmission to verify the decoder works correctly
 */

import { readFileSync } from 'node:fs';
import { createCanvas, Image } from 'canvas';
import { beforeAll, describe, expect, it } from 'vitest';

// Mock AudioContext for Node.js
class MockAudioContext {
  constructor() {
    this.sampleRate = 48000;
  }

  decodeAudioData(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const numSamples = (arrayBuffer.byteLength - 44) / 2;
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const sample = view.getInt16(44 + i * 2, true);
      samples[i] = sample / 32768.0;
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

describe('ISS SSTV Decode Test', () => {
  it('should decode ISS SSTV transmission without excessive green tint', async () => {
    // Load the ISS SSTV file
    const wavBuffer = readFileSync('/tmp/iss-sstv.wav');
    const blob = {
      arrayBuffer: () =>
        Promise.resolve(
          wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength)
        ),
    };

    // Decode
    const decoder = new SSTVDecoder(48000);
    const result = await decoder.decodeAudio(blob);

    expect(result).toBeDefined();
    expect(result).toMatch(/^data:image\/png;base64,/);

    // Analyze the decoded image
    const base64Data = result.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgBuffer;
    });

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;

    // Count pixels with different characteristics
    let greenTintPixels = 0;
    let colorfulPixels = 0;
    let neutralPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Green tint: G is significantly higher than R and B
      if (g > r + 30 && g > b + 30) {
        greenTintPixels++;
      }

      // Colorful: significant variation between channels
      const range = Math.max(r, g, b) - Math.min(r, g, b);
      if (range > 50) {
        colorfulPixels++;
      }

      // Neutral gray: all channels similar (128±20)
      if (Math.abs(r - 128) < 20 && Math.abs(g - 128) < 20 && Math.abs(b - 128) < 20) {
        neutralPixels++;
      }
    }

    const totalPixels = pixels.length / 4;
    const greenPercent = (greenTintPixels / totalPixels) * 100;
    const colorfulPercent = (colorfulPixels / totalPixels) * 100;
    const neutralPercent = (neutralPixels / totalPixels) * 100;

    console.log('\n📊 ISS Image Analysis:');
    console.log(`   Green-tinted: ${greenPercent.toFixed(1)}%`);
    console.log(`   Colorful: ${colorfulPercent.toFixed(1)}%`);
    console.log(`   Neutral gray: ${neutralPercent.toFixed(1)}%`);

    // CRITICAL TESTS
    // The ISS image should NOT be mostly green (broken chroma)
    expect(greenPercent).toBeLessThan(50);

    // The ISS image should have SOME color variation (not all neutral)
    expect(colorfulPercent).toBeGreaterThan(10);

    // Should not be all neutral gray (no chroma data)
    expect(neutralPercent).toBeLessThan(80);
  }, 30000); // 30 second timeout
});

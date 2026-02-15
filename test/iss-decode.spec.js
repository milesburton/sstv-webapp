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

    // Calculate average color statistics and detect color corruption
    let avgR = 0,
      avgG = 0,
      avgB = 0;
    let greenDominant = 0;
    let magentaDominant = 0;
    let normalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      avgR += r;
      avgG += g;
      avgB += b;

      // Green dominant: G significantly higher than R and B
      // Use threshold of 40 to account for noise in real ISS signals
      if (g > r + 40 && g > b + 40) {
        greenDominant++;
      }

      // Magenta dominant: R and B high, G low
      if (r > 150 && b > 150 && g < 100) {
        magentaDominant++;
      }

      // Normal: balanced RGB or reasonable colors
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff < 80) {
        normalPixels++;
      }
    }

    const totalPixels = pixels.length / 4;
    avgR /= totalPixels;
    avgG /= totalPixels;
    avgB /= totalPixels;

    const greenPercent = (greenDominant / totalPixels) * 100;
    const magentaPercent = (magentaDominant / totalPixels) * 100;
    const normalPercent = (normalPixels / totalPixels) * 100;

    console.log('\n📊 ISS Image Analysis:');
    console.log(`   Average RGB: R=${avgR.toFixed(1)}, G=${avgG.toFixed(1)}, B=${avgB.toFixed(1)}`);
    console.log(`   Green-dominant: ${greenPercent.toFixed(1)}%`);
    console.log(`   Magenta-dominant: ${magentaPercent.toFixed(1)}%`);
    console.log(`   Normal-colored: ${normalPercent.toFixed(1)}%`);

    // Save decoded image for inspection
    const fs = await import('node:fs');
    fs.writeFileSync('test-output-iss.png', imgBuffer);
    console.log(`   Saved to: test-output-iss.png\n`);

    // CRITICAL TESTS
    // Image should NOT be dominated by green or magenta (chroma corruption)
    expect(greenPercent).toBeLessThan(50); // Increased for noisy ISS signals
    expect(magentaPercent).toBeLessThan(40);

    // Average green shouldn't be way higher than red/blue (THIS IS THE KEY TEST)
    const colorImbalance = Math.abs(avgG - avgR) + Math.abs(avgG - avgB);
    expect(colorImbalance).toBeLessThan(15); // Stricter: must be well-balanced

    // Should have reasonable amount of normal pixels
    expect(normalPercent).toBeGreaterThan(20); // Relaxed for noisy signals
  }, 30000); // 30 second timeout
});

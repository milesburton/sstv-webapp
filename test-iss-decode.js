import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from 'canvas';

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

global.window = { AudioContext: MockAudioContext };
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      return createCanvas(320, 240);
    }
    return {};
  },
};

// Import decoder
const { SSTVDecoder } = await import('./src/utils/SSTVDecoder.js');

console.log('🔍 Testing ISS SSTV decode...\n');

// Read the ISS SSTV file
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

if (!result || !result.startsWith('data:image/png;base64,')) {
  console.error('❌ Decode failed - invalid result');
  process.exit(1);
}

// Save the decoded image
const base64Data = result.replace(/^data:image\/png;base64,/, '');
const imgBuffer = Buffer.from(base64Data, 'base64');
writeFileSync('decoded-iss.png', imgBuffer);

console.log('✅ Decoded image saved to: decoded-iss.png');
console.log('\nTo view: open decoded-iss.png');
console.log('Compare with reference at: https://m7smu.org.uk/post/more-sstv-iss/');

// Analyze the image
const img = await loadImage('decoded-iss.png');
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);
const imageData = ctx.getImageData(0, 0, img.width, img.height);
const pixels = imageData.data;

// Sample some pixels and check colors
let greenCount = 0;
let colorfulCount = 0;

for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];

  // Check if mostly green (bad)
  if (g > r + 30 && g > b + 30) {
    greenCount++;
  }

  // Check if has color variation (good)
  const range = Math.max(r, g, b) - Math.min(r, g, b);
  if (range > 50) {
    colorfulCount++;
  }
}

const totalPixels = pixels.length / 4;
const greenPercent = ((greenCount / totalPixels) * 100).toFixed(1);
const colorfulPercent = ((colorfulCount / totalPixels) * 100).toFixed(1);

console.log(`\n📊 Image Analysis:`);
console.log(`   Green-tinted pixels: ${greenPercent}% (should be low)`);
console.log(`   Colorful pixels: ${colorfulPercent}% (should be high)`);

if (greenPercent > 50) {
  console.log('\n❌ FAIL: Image is too green - chroma decoding is broken');
  process.exit(1);
}

if (colorfulPercent < 20) {
  console.log('\n❌ FAIL: Image lacks color variation - decoding is incorrect');
  process.exit(1);
}

console.log('\n✅ PASS: Image has reasonable color distribution');

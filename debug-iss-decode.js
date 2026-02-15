import { readFileSync } from 'node:fs';
import { createCanvas } from 'canvas';

// Mock AudioContext for Node.js
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

// Set up global mocks
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

// Read the ISS SSTV file
const wavBuffer = readFileSync('/tmp/iss-sstv.wav');

// Create a Blob-like object
const blob = {
  arrayBuffer: () =>
    Promise.resolve(
      wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength)
    ),
};

// Decode
console.log('🔍 Decoding ISS SSTV file...');
const decoder = new SSTVDecoder(48000);

try {
  const result = await decoder.decodeAudio(blob);
  console.log('✅ Decoded successfully!');
  console.log('📊 Result length:', result?.length || 'N/A');

  // Check if we got a valid image
  if (result && result.startsWith('data:image/png;base64,')) {
    console.log('✅ Got valid PNG data URL');
  } else {
    console.log('❌ Invalid result format');
  }
} catch (error) {
  console.error('❌ Decode failed:', error.message);
  console.error(error.stack);
}

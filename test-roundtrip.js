#!/usr/bin/env node
/**
 * Quick round-trip test for SSTV encoding/decoding
 * Tests that we can encode and decode our own images correctly
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

// Create a simple test pattern
const width = 320;
const height = 240;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Create a recognizable pattern:
// Left = Red, Middle = Green, Right = Blue
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, width / 3, height);
ctx.fillStyle = 'green';
ctx.fillRect(width / 3, 0, width / 3, height);
ctx.fillStyle = 'blue';
ctx.fillRect((2 * width) / 3, 0, width / 3, height);

// Add some white text for verification
ctx.fillStyle = 'white';
ctx.font = 'bold 48px sans-serif';
ctx.fillText('RGB TEST', 50, 120);

// Save test image
const buffer = canvas.toBuffer('image/png');
writeFileSync('test-pattern.png', buffer);

console.log('✓ Created test pattern: test-pattern.png');
console.log('  Please encode this image using the web UI, then decode it.');
console.log('  The decoded image should show red, green, and blue sections.');
console.log('  If it appears mostly green or has wrong colors, the bug is still present.');

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createCanvas } from 'canvas';

/**
 * End-to-End Integration Tests for SSTV Toolkit
 * These tests verify the complete encode→decode workflow in a real browser
 * and validate that decoded images contain actual pixel data (not black).
 */

/**
 * Helper: Encode an image file through the UI and return the downloaded audio path.
 */
async function encodeImage(page, testImagePath) {
  const encodeInput = page.locator('input[type="file"]').first();
  await encodeInput.setInputFiles(testImagePath);

  await expect(page.locator('text=Encoded Successfully')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('audio')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('button:has-text("Download WAV")').click();
  const download = await downloadPromise;

  const audioPath = join(tmpdir(), `sstv-test-audio-${Date.now()}.wav`);
  await download.saveAs(audioPath);

  const audioBuffer = readFileSync(audioPath);
  expect(audioBuffer.length).toBeGreaterThan(10000);

  return audioPath;
}

/**
 * Helper: Decode an audio file through the UI and return decoded image pixel stats.
 * Returns { avgBrightness, maxBrightness, nonBlackPixels, totalPixels }
 */
async function decodeAndValidate(page, audioPath) {
  // Reset encoder if needed, then decode
  const encodeAnother = page.locator('button:has-text("Encode Another")');
  if (await encodeAnother.isVisible()) {
    await encodeAnother.click();
  }

  const decodeInput = page.locator('input[type="file"]').last();
  await decodeInput.setInputFiles(audioPath);

  await expect(page.locator('text=Decoded Successfully')).toBeVisible({ timeout: 60000 });

  const decodedImage = page.locator('img[alt="Decoded SSTV"]');
  await expect(decodedImage).toBeVisible();

  const imageSrc = await decodedImage.getAttribute('src');
  expect(imageSrc).toMatch(/^data:image\/png;base64,/);
  expect(imageSrc.length).toBeGreaterThan(1000);

  // Extract pixel data from the decoded image in the browser
  const pixelStats = await page.evaluate(async (src) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let totalBrightness = 0;
        let maxBrightness = 0;
        let nonBlackPixels = 0;
        const totalPixels = canvas.width * canvas.height;

        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          totalBrightness += brightness;
          if (brightness > maxBrightness) maxBrightness = brightness;
          if (brightness > 10) nonBlackPixels++;
        }

        resolve({
          avgBrightness: totalBrightness / totalPixels,
          maxBrightness,
          nonBlackPixels,
          totalPixels,
          width: canvas.width,
          height: canvas.height,
        });
      };
      img.src = src;
    });
  }, imageSrc);

  return pixelStats;
}

test.describe('SSTV Encode → Decode Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sstv-toolkit/');
    await expect(page.locator('h1')).toContainText('SSTV Toolkit');
  });

  test('should encode and decode a black/white test pattern with visible pixels', async ({
    page,
  }) => {
    // Create a high-contrast test image: left half black, right half white
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 160, 240);
    ctx.fillStyle = 'white';
    ctx.fillRect(160, 0, 160, 240);

    const testImagePath = join(tmpdir(), 'sstv-test-pattern.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    // Encode
    const audioPath = await encodeImage(page, testImagePath);

    // Decode and validate pixel data
    const stats = await decodeAndValidate(page, audioPath);

    // The decoded image MUST have non-black pixels
    // A black/white pattern should decode to at least some bright pixels
    expect(stats.nonBlackPixels).toBeGreaterThan(stats.totalPixels * 0.1);
    expect(stats.maxBrightness).toBeGreaterThan(50);
    expect(stats.avgBrightness).toBeGreaterThan(10);
  });

  test('should decode a bright image with substantial brightness', async ({ page }) => {
    // Create a fully white image - decoded version should be bright
    const canvas = createCanvas(320, 240);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 320, 240);

    const testImagePath = join(tmpdir(), 'sstv-white-square.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    const audioPath = await encodeImage(page, testImagePath);
    const stats = await decodeAndValidate(page, audioPath);

    // A white image should decode to mostly bright pixels
    expect(stats.nonBlackPixels).toBeGreaterThan(stats.totalPixels * 0.5);
    expect(stats.avgBrightness).toBeGreaterThan(50);
  });

  test('should work with Robot 36 mode', async ({ page }) => {
    const modeSelect = page.locator('select').first();
    await expect(modeSelect).toHaveValue('ROBOT36');

    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 100, 100);

    const testImagePath = join(tmpdir(), 'sstv-red-square.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    const encodeInput = page.locator('input[type="file"]').first();
    await encodeInput.setInputFiles(testImagePath);

    await expect(page.locator('text=Encoded Successfully')).toBeVisible({ timeout: 30000 });
  });

  test('should work with Martin M1 mode', async ({ page }) => {
    const modeSelect = page.locator('select').first();
    await modeSelect.selectOption('MARTIN1');

    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 100, 100);

    const testImagePath = join(tmpdir(), 'sstv-blue-square.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    const encodeInput = page.locator('input[type="file"]').first();
    await encodeInput.setInputFiles(testImagePath);

    await expect(page.locator('text=Encoded Successfully')).toBeVisible({ timeout: 30000 });
  });

  test('should work with Scottie S1 mode', async ({ page }) => {
    const modeSelect = page.locator('select').first();
    await modeSelect.selectOption('SCOTTIE1');

    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, 100, 100);

    const testImagePath = join(tmpdir(), 'sstv-green-square.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    const encodeInput = page.locator('input[type="file"]').first();
    await encodeInput.setInputFiles(testImagePath);

    await expect(page.locator('text=Encoded Successfully')).toBeVisible({ timeout: 30000 });
  });

  test('should handle file upload via input', async ({ page }) => {
    const canvas = createCanvas(50, 50);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'yellow';
    ctx.fillRect(0, 0, 50, 50);

    const testImagePath = join(tmpdir(), 'sstv-upload-test.png');
    writeFileSync(testImagePath, canvas.toBuffer('image/png'));

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(testImagePath);

    await expect(page.locator('text=Encoded Successfully')).toBeVisible({ timeout: 30000 });
  });
});

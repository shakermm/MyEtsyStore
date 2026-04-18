#!/usr/bin/env node
/**
 * Convert white/near-white backgrounds in PNG images to transparent.
 * Usage:
 *   node scripts/make-transparent.mjs <inputPath> [outputPath] [--threshold=240] [--inplace]
 *
 * Defaults:
 *   - outputPath: adds "new idea-transparent" before the extension
 *   - threshold: 240 (any pixel where R,G,B are all >= 240 becomes transparent)
 *   - --inplace: overwrite the input file instead of creating a -transparent copy
 *
 * Example:
 *   node scripts/make-transparent.mjs designs/foo/foo-light.png --inplace
 */

import sharp from 'sharp';
import { resolve, dirname, basename, extname, join } from 'path';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/make-transparent.mjs <inputPath> [outputPath] [--threshold=240] [--inplace]');
  process.exit(1);
}

let threshold = 240;
let inplace = false;
let inputPath = null;
let outputPath = null;

for (const arg of args) {
  if (arg.startsWith('--threshold=')) {
    threshold = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--inplace') {
    inplace = true;
  } else if (!inputPath) {
    inputPath = arg;
  } else if (!outputPath) {
    outputPath = arg;
  }
}

inputPath = resolve(inputPath);

if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

if (!outputPath) {
  if (inplace) {
    outputPath = inputPath;
  } else {
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    outputPath = join(dir, `${name}-transparent.png`);
  }
} else {
  outputPath = resolve(outputPath);
}

console.log(`Processing: ${inputPath}`);
console.log(`Output:     ${outputPath}`);
console.log(`Threshold:  ${threshold} (pixels with R,G,B all >= ${threshold} become transparent)`);

try {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = new Uint8ClampedArray(data);

  let madeTransparent = 0;
  const totalPixels = width * height;

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    if (r >= threshold && g >= threshold && b >= threshold) {
      pixels[i + 3] = 0;
      madeTransparent++;
    } else if (r >= threshold - 20 && g >= threshold - 20 && b >= threshold - 20) {
      const distance = Math.max(0, (r + g + b) / 3 - (threshold - 30));
      const range = threshold - (threshold - 30);
      const alpha = Math.max(0, Math.min(255, Math.round(255 * (1 - distance / range))));
      pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    }
  }

  await sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels }
  })
    .png()
    .toFile(outputPath);

  const pct = ((madeTransparent / totalPixels) * 100).toFixed(1);
  console.log(`✅ Done! Made ${madeTransparent.toLocaleString()} / ${totalPixels.toLocaleString()} pixels transparent (${pct}%)`);
  console.log(`Saved: ${outputPath}`);
} catch (err) {
  console.error('Error processing image:', err);
  process.exit(1);
}

import 'server-only';
import sharp from 'sharp';

export interface AlphaInfo {
  channels: number;
  hasMeaningfulAlpha: boolean;
  width: number;
  height: number;
}

/**
 * Inspect a PNG buffer for alpha channel + a non-trivial transparent area.
 * "Meaningful alpha" means at least 5% of pixels are below 50% alpha.
 */
export async function inspectAlpha(buffer: Buffer): Promise<AlphaInfo> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const channels = meta.channels ?? 0;
  if (channels < 4) {
    return {
      channels,
      hasMeaningfulAlpha: false,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  }

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const stride = info.channels;
  let transparentish = 0;
  let total = 0;
  for (let i = 3; i < data.length; i += stride) {
    total++;
    if (data[i] < 128) transparentish++;
  }
  return {
    channels,
    hasMeaningfulAlpha: total > 0 && transparentish / total > 0.05,
    width: info.width,
    height: info.height,
  };
}

/**
 * Knock out a near-white background from an opaque PNG by mapping luminance >= threshold to alpha=0.
 * Conservative: doesn't touch interior pixels darker than threshold. Threshold default 240 (per project rules).
 */
export async function keyOutWhiteBackground(
  buffer: Buffer,
  threshold = 240
): Promise<Buffer> {
  const img = sharp(buffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const stride = info.channels;
  for (let i = 0; i < data.length; i += stride) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: stride as 1 | 2 | 3 | 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Flood-fill transparency from the 4 image corners, keying out any contiguous region
 * whose color is within `tolerance` (Euclidean RGB distance) of the sampled corner color.
 *
 * This handles dark-colored backgrounds that FLUX occasionally returns for dark-palette
 * prompts, while preserving intended dark pixels inside the artwork (they're not
 * reachable from the border).
 */
export async function floodKeyBackground(buffer: Buffer, tolerance = 32): Promise<Buffer> {
  const img = sharp(buffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels; // should be 4 after ensureAlpha
  const buf = Buffer.from(data); // mutable copy

  const idx = (x: number, y: number) => (y * width + x) * stride;
  const visited = new Uint8Array(width * height);
  const tolSq = tolerance * tolerance;

  const seeds: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  // Use an average of the 4 corners as the reference color if they're similar.
  // Otherwise flood each corner independently with its own reference.
  for (const [sx, sy] of seeds) {
    const si = idx(sx, sy);
    // Skip if the seed already transparent.
    if (buf[si + 3] === 0) continue;
    const rr = buf[si];
    const gg = buf[si + 1];
    const bb = buf[si + 2];

    // Iterative stack flood fill (4-connectivity).
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const vIdx = y * width + x;
      if (visited[vIdx]) continue;
      const i = idx(x, y);
      const dr = buf[i] - rr;
      const dg = buf[i + 1] - gg;
      const db = buf[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > tolSq) continue;
      visited[vIdx] = 1;
      buf[i + 3] = 0; // knock out alpha
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  return sharp(buf, {
    raw: { width, height, channels: stride as 1 | 2 | 3 | 4 },
  })
    .png()
    .toBuffer();
}

/**
 * If the input PNG already has meaningful alpha, return it unchanged.
 * Otherwise:
 *   1. Try flood-filling transparency from the 4 corners (handles any uniform bg color).
 *   2. If the result still lacks meaningful alpha, fall back to near-white key-out.
 */
export async function ensureTransparentPng(buffer: Buffer, threshold = 240): Promise<Buffer> {
  const info = await inspectAlpha(buffer);
  if (info.hasMeaningfulAlpha) return buffer;

  const flooded = await floodKeyBackground(buffer, 32);
  const floodedInfo = await inspectAlpha(flooded);
  if (floodedInfo.hasMeaningfulAlpha) return flooded;

  return keyOutWhiteBackground(buffer, threshold);
}

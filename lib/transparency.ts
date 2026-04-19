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
export async function floodKeyBackground(buffer: Buffer, tolerance = 60): Promise<Buffer> {
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
 * Sample the dominant background color by taking the mode of pixels along the 4 edges.
 * More robust than using a single corner when FLUX adds noise.
 */
async function sampleBorderColor(
  buffer: Buffer
): Promise<{ r: number; g: number; b: number } | null> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const counts = new Map<string, number>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * stride;
    // Round to nearest 8 to group near-identical colors for mode detection.
    const r = data[i] & 0xf8;
    const g = data[i + 1] & 0xf8;
    const b = data[i + 2] & 0xf8;
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const step = 4;
  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  if (!best) return null;
  const [r, g, b] = best.key.split(',').map(Number);
  return { r, g, b };
}

/**
 * Edge-band soft chroma-key: only pixels within `radius` pixels of an already-transparent
 * pixel get re-evaluated. Interior opaque artwork is preserved even if its color happens
 * to match the background (e.g. cream skin tones on a white background).
 *
 *   dist(color, bg) <= hardThreshold   -> alpha = 0
 *   hardThreshold..softThreshold       -> alpha scaled linearly down
 *   dist >  softThreshold              -> alpha unchanged
 */
export async function softChromaKey(
  buffer: Buffer,
  bg: { r: number; g: number; b: number },
  hardThreshold = 30,
  softThreshold = 90,
  radius = 3
): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const buf = Buffer.from(data);
  const hardSq = hardThreshold * hardThreshold;
  const softSq = softThreshold * softThreshold;

  // BFS from every transparent pixel out to `radius`. Only pixels visited in that
  // band are eligible for chroma keying — interior opaque pixels are left alone.
  const dist = new Int16Array(width * height);
  dist.fill(-1);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      if (buf[pi * stride + 3] === 0) {
        dist[pi] = 0;
        queue.push(x, y);
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    const d = dist[y * width + x];
    if (d >= radius) continue;
    const nd = d + 1;
    const neigh = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = nd;
      queue.push(nx, ny);
    }
  }

  for (let pi = 0; pi < width * height; pi++) {
    const d = dist[pi];
    if (d <= 0) continue; // untouched (d=-1) OR already transparent (d=0)
    const i = pi * stride;
    if (buf[i + 3] === 0) continue;
    const dr = buf[i] - bg.r;
    const dg = buf[i + 1] - bg.g;
    const db = buf[i + 2] - bg.b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq <= hardSq) {
      buf[i + 3] = 0;
    } else if (distSq < softSq) {
      const t = (Math.sqrt(distSq) - hardThreshold) / (softThreshold - hardThreshold);
      buf[i + 3] = Math.round(buf[i + 3] * t);
    }
  }

  return sharp(buf, { raw: { width, height, channels: stride as 1 | 2 | 3 | 4 } })
    .png()
    .toBuffer();
}

/**
 * Full background removal pipeline — designed to produce clean cutouts 100% of the time
 * regardless of whether FLUX returns transparent, solid white, or a noisy colored bg.
 *
 *   1. If the image already has meaningful alpha, return unchanged.
 *   2. Sample the dominant border color (mode over all 4 edges).
 *   3. Flood-fill from the corners with generous tolerance to nuke the bulk bg.
 *   4. Soft chroma-key against the sampled bg color to kill anti-aliased halos.
 *   5. Fall back to pure-white keyer if the sampled bg was near-white and flood missed.
 */
export async function ensureTransparentPng(buffer: Buffer, threshold = 240): Promise<Buffer> {
  const info = await inspectAlpha(buffer);
  if (info.hasMeaningfulAlpha) return buffer;

  const bg = (await sampleBorderColor(buffer)) ?? { r: 255, g: 255, b: 255 };

  // Stage 1: flood fill from corners — kills connected background.
  let out = await floodKeyBackground(buffer, 60);

  // Stage 2: edge-band soft chroma-key — removes anti-aliased halos.
  out = await softChromaKey(out, bg, 30, 90);

  // Stage 3: GLOBAL near-bg color key, but ONLY if the sampled background is
  // near-white. The LLM system prompt forbids pure-white artwork fills, so any
  // remaining near-white pixel is almost certainly an enclosed bg pocket (inside
  // letter shapes like D, O, A). For darker backgrounds we skip this pass to
  // avoid erasing intentional light highlights on dark garments.
  const bgIsNearWhite = bg.r >= 230 && bg.g >= 230 && bg.b >= 230;
  if (bgIsNearWhite) {
    out = await keyOutWhiteBackground(out, threshold);
  }

  const postInfo = await inspectAlpha(out);
  if (postInfo.hasMeaningfulAlpha) return out;

  // Last-resort safety net.
  return keyOutWhiteBackground(buffer, threshold);
}

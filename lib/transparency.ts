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
 * If the input PNG already has meaningful alpha, return it unchanged.
 * Otherwise, key out the near-white background and return the resulting PNG.
 */
export async function ensureTransparentPng(buffer: Buffer, threshold = 240): Promise<Buffer> {
  const info = await inspectAlpha(buffer);
  if (info.hasMeaningfulAlpha) return buffer;
  return keyOutWhiteBackground(buffer, threshold);
}

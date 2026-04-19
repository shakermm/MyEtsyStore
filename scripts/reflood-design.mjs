// Re-apply flood-fill background removal to an existing design's PNGs.
// Usage: node scripts/reflood-design.mjs <slug> [tolerance]
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';

const [, , slug, tolArg] = process.argv;
if (!slug) {
  console.error('Usage: node scripts/reflood-design.mjs <slug> [tolerance]');
  process.exit(1);
}
const tolerance = Number(tolArg || 32);

async function floodKey(buffer, tol) {
  const img = sharp(buffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const buf = Buffer.from(data);
  const idx = (x, y) => (y * width + x) * stride;
  const visited = new Uint8Array(width * height);
  const tolSq = tol * tol;
  const seeds = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ];
  for (const [sx, sy] of seeds) {
    const si = idx(sx, sy);
    if (buf[si + 3] === 0) continue;
    const rr = buf[si], gg = buf[si + 1], bb = buf[si + 2];
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const v = y * width + x;
      if (visited[v]) continue;
      const i = idx(x, y);
      const dr = buf[i] - rr, dg = buf[i + 1] - gg, db = buf[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > tolSq) continue;
      visited[v] = 1;
      buf[i + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  return sharp(buf, { raw: { width, height, channels: stride } }).png().toBuffer();
}

const dir = path.join(process.cwd(), 'designs', slug);
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8'));

for (const variant of ['light', 'dark']) {
  const filename = manifest.files?.[variant];
  if (!filename) { console.log(`skip ${variant}: no file`); continue; }
  const file = path.join(dir, filename);
  const input = await fs.readFile(file);
  const { info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const backup = file.replace(/\.png$/, '.orig.png');
  try { await fs.access(backup); } catch { await fs.writeFile(backup, input); }
  const output = await floodKey(input, tolerance);
  await fs.writeFile(file, output);
  console.log(`${variant}: ${info.width}x${info.height} -> keyed (backup: ${path.basename(backup)})`);
}

// Re-apply the full background removal pipeline (flood + soft chroma key) to an
// existing design's PNG. Works from the .orig.png backup if present.
// Usage: node scripts/reflood-design.mjs <slug> [floodTol=60] [hard=30] [soft=90]
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';

const [, , slug, floodArg, hardArg, softArg] = process.argv;
if (!slug) {
  console.error('Usage: node scripts/reflood-design.mjs <slug> [floodTol=60] [hard=30] [soft=90]');
  process.exit(1);
}
const floodTol = Number(floodArg || 60);
const hard = Number(hardArg || 30);
const soft = Number(softArg || 90);

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

async function keyOutWhite(buffer, threshold = 240) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const buf = Buffer.from(data);
  for (let i = 0; i < buf.length; i += stride) {
    if (buf[i] >= threshold && buf[i + 1] >= threshold && buf[i + 2] >= threshold) {
      buf[i + 3] = 0;
    }
  }
  return sharp(buf, { raw: { width, height, channels: stride } }).png().toBuffer();
}

async function sampleBorderColor(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const counts = new Map();
  const sample = (x, y) => {
    const i = (y * width + x) * stride;
    const r = data[i] & 0xf8, g = data[i + 1] & 0xf8, b = data[i + 2] & 0xf8;
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 4) { sample(x, 0); sample(x, height - 1); }
  for (let y = 0; y < height; y += 4) { sample(0, y); sample(width - 1, y); }
  let best = null;
  for (const [k, c] of counts) if (!best || c > best.count) best = { key: k, count: c };
  if (!best) return { r: 255, g: 255, b: 255 };
  const [r, g, b] = best.key.split(',').map(Number);
  return { r, g, b };
}

async function softChromaKey(buffer, bg, hard, soft, radius = 3) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = info.channels;
  const buf = Buffer.from(data);
  const hardSq = hard * hard, softSq = soft * soft;
  const dist = new Int16Array(width * height).fill(-1);
  const queue = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pi = y * width + x;
    if (buf[pi * stride + 3] === 0) { dist[pi] = 0; queue.push(x, y); }
  }
  let head = 0;
  while (head < queue.length) {
    const x = queue[head++], y = queue[head++];
    const d = dist[y * width + x];
    if (d >= radius) continue;
    const nd = d + 1;
    for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = nd; queue.push(nx, ny);
    }
  }
  for (let pi = 0; pi < width * height; pi++) {
    const d = dist[pi];
    if (d <= 0) continue;
    const i = pi * stride;
    if (buf[i + 3] === 0) continue;
    const dr = buf[i] - bg.r, dg = buf[i + 1] - bg.g, db = buf[i + 2] - bg.b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq <= hardSq) buf[i + 3] = 0;
    else if (distSq < softSq) {
      const t = (Math.sqrt(distSq) - hard) / (soft - hard);
      buf[i + 3] = Math.round(buf[i + 3] * t);
    }
  }
  return sharp(buf, { raw: { width, height, channels: stride } }).png().toBuffer();
}

const dir = path.join(process.cwd(), 'designs', slug);
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8'));

// Handle both new ({image}) and legacy ({light, dark}) manifest shapes.
const filenames = [];
if (manifest.files?.image) filenames.push(manifest.files.image);
if (manifest.files?.light && manifest.files.light !== manifest.files?.image) filenames.push(manifest.files.light);
if (manifest.files?.dark && manifest.files.dark !== manifest.files?.image) filenames.push(manifest.files.dark);

for (const filename of filenames) {
  const file = path.join(dir, filename);
  const backup = file.replace(/\.png$/, '.orig.png');
  let source;
  try {
    source = await fs.readFile(backup);
  } catch {
    source = await fs.readFile(file);
    await fs.writeFile(backup, source);
  }
  const bg = await sampleBorderColor(source);
  let out = await floodKey(source, floodTol);
  out = await softChromaKey(out, bg, hard, soft);
  const bgIsNearWhite = bg.r >= 230 && bg.g >= 230 && bg.b >= 230;
  if (bgIsNearWhite) out = await keyOutWhite(out, 240);
  await fs.writeFile(file, out);
  console.log(`${filename}: bg=rgb(${bg.r},${bg.g},${bg.b}) flood=${floodTol} soft=${hard}..${soft} whiteKey=${bgIsNearWhite} (backup: ${path.basename(backup)})`);
}

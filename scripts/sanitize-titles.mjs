// Rewrite manifest.json titles using the same sanitizer as the runtime.
// Usage: node scripts/sanitize-titles.mjs
import path from 'path';
import { promises as fs } from 'fs';

function sanitize(raw) {
  return raw
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€"/g, '-')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/â€¦/g, '...')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[`$^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

const designsRoot = path.join(process.cwd(), 'designs');
const entries = await fs.readdir(designsRoot, { withFileTypes: true });
let changed = 0;
for (const e of entries) {
  if (!e.isDirectory()) continue;
  const manifestPath = path.join(designsRoot, e.name, 'manifest.json');
  let raw;
  try { raw = await fs.readFile(manifestPath, 'utf-8'); } catch { continue; }
  const m = JSON.parse(raw);
  const orig = m.title ?? '';
  const fixed = sanitize(orig);
  if (fixed !== orig) {
    m.title = fixed;
    await fs.writeFile(manifestPath, JSON.stringify(m, null, 2), 'utf-8');
    console.log(`${e.name}:\n  - old: ${JSON.stringify(orig)}\n  + new: ${JSON.stringify(fixed)}`);
    changed++;
  }
}
console.log(`done · ${changed} manifest(s) updated`);

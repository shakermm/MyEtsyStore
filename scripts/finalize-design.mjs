#!/usr/bin/env node
/**
 * Finalize a BanterWearCo design.
 *
 * Given a concept slug, this script:
 *   1. Creates designs/<slug>/ if missing
 *   2. Copies every matching PNG from the Cursor assets dir to designs/<slug>/
 *      - <slug>-light.png      -> flat design for light shirts (will be made transparent)
 *      - <slug>-dark.png       -> flat design for dark shirts (will be made transparent)
 *      - <slug>-mockup-1.png   -> lifestyle mockup (copied as-is, NOT made transparent)
 *      - <slug>-mockup-2.png   -> lifestyle mockup
 *      - <slug>-mockup-3.png   -> lifestyle mockup
 *   3. Runs make-transparent.mjs --inplace on the -light and -dark PNGs
 *   4. Scaffolds a designs/<slug>/manifest.json if one does not exist yet (includes
 *      product_features + care_instructions + listing_footer from data/listing-standard.json)
 *   5. If manifest already exists, backfills missing product_features / care_instructions /
 *      listing_footer from the same standard file without overwriting custom text
 *   6. Prints a summary of everything it did (and what is still missing)
 *
 * Usage:
 *   node scripts/finalize-design.mjs <slug> [--assets-dir <path>] [--title "..."] [--concept "..."] [--threshold=240]
 *
 * Flags:
 *   --assets-dir   override source dir (default: Cursor assets for this project)
 *   --title        pre-fill manifest.title
 *   --concept      pre-fill manifest.concept
 *   --threshold    pass through to make-transparent.mjs (default 240)
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/finalize-design.mjs <slug> [--assets-dir <path>] [--title "..."] [--concept "..."] [--threshold=240]');
  process.exit(1);
}

const defaultAssetsDir =
  'C:\\Users\\mikes\\.cursor\\projects\\c-Users-mikes-MyEtsyStore\\assets';

let slug = null;
let assetsDir = defaultAssetsDir;
let title = null;
let concept = null;
let threshold = 240;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--assets-dir') {
    assetsDir = args[++i];
  } else if (a === '--title') {
    title = args[++i];
  } else if (a === '--concept') {
    concept = args[++i];
  } else if (a.startsWith('--threshold=')) {
    threshold = parseInt(a.split('=')[1], 10);
  } else if (!slug) {
    slug = a;
  }
}

if (!slug) {
  console.error('ERROR: <slug> is required.');
  process.exit(1);
}

const designDir = join(repoRoot, 'designs', slug);
if (!existsSync(designDir)) {
  mkdirSync(designDir, { recursive: true });
  console.log(`[mkdir] ${designDir}`);
}

const suffixes = {
  design: [`${slug}-light.png`, `${slug}-dark.png`],
  mockup: [`${slug}-mockup-1.png`, `${slug}-mockup-2.png`, `${slug}-mockup-3.png`],
};

const report = {
  copiedDesigns: [],
  copiedMockups: [],
  missingDesigns: [],
  missingMockups: [],
  transparencyRuns: [],
};

const listingStandardPath = join(repoRoot, 'data', 'listing-standard.json');
function loadListingStandard() {
  try {
    if (!existsSync(listingStandardPath)) return null;
    return JSON.parse(readFileSync(listingStandardPath, 'utf8'));
  } catch {
    return null;
  }
}
const listingStandard = loadListingStandard();

function copyIfExists(filename, kind) {
  const src = join(assetsDir, filename);
  const dst = join(designDir, filename);
  if (!existsSync(src)) {
    if (kind === 'design') report.missingDesigns.push(filename);
    else report.missingMockups.push(filename);
    return false;
  }
  copyFileSync(src, dst);
  if (kind === 'design') report.copiedDesigns.push(filename);
  else report.copiedMockups.push(filename);
  console.log(`[copy] ${filename}`);
  return true;
}

for (const f of suffixes.design) copyIfExists(f, 'design');
for (const f of suffixes.mockup) copyIfExists(f, 'mockup');

const transparentScript = join(repoRoot, 'scripts', 'make-transparent.mjs');
for (const f of report.copiedDesigns) {
  const target = join(designDir, f);
  const result = spawnSync(
    process.execPath,
    [transparentScript, target, '--inplace', `--threshold=${threshold}`],
    { stdio: 'inherit' }
  );
  report.transparencyRuns.push({ file: f, code: result.status });
}

const manifestPath = join(designDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  const manifest = {
    slug,
    concept: concept || '',
    title: title || '',
    description: '',
    tags: [],
    keywords: [],
    recommended_shirt_colors: [],
    ...(listingStandard
      ? {
          product_features: listingStandard.product_features,
          care_instructions: listingStandard.care_instructions,
          listing_footer: listingStandard.listing_footer,
        }
      : {}),
    files: {
      light: report.copiedDesigns.includes(`${slug}-light.png`) ? `${slug}-light.png` : null,
      dark: report.copiedDesigns.includes(`${slug}-dark.png`) ? `${slug}-dark.png` : null,
    },
    mockups: report.copiedMockups,
    created_at: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[manifest] wrote ${manifestPath}`);
} else {
  console.log(`[manifest] exists: ${manifestPath}`);
  try {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const changed = {};
    if (listingStandard) {
      if (!Array.isArray(existing.product_features) || existing.product_features.length === 0) {
        existing.product_features = listingStandard.product_features;
        changed.product_features = true;
      }
      if (!Array.isArray(existing.care_instructions) || existing.care_instructions.length === 0) {
        existing.care_instructions = listingStandard.care_instructions;
        changed.care_instructions = true;
      }
      if (existing.listing_footer == null || String(existing.listing_footer).trim() === '') {
        existing.listing_footer = listingStandard.listing_footer;
        changed.listing_footer = true;
      }
    }
    if (report.copiedDesigns.includes(`${slug}-light.png`)) {
      existing.files = existing.files || {};
      if (existing.files.light !== `${slug}-light.png`) {
        existing.files.light = `${slug}-light.png`;
        changed.light = true;
      }
    }
    if (report.copiedDesigns.includes(`${slug}-dark.png`)) {
      existing.files = existing.files || {};
      if (existing.files.dark !== `${slug}-dark.png`) {
        existing.files.dark = `${slug}-dark.png`;
        changed.dark = true;
      }
    }
    if (report.copiedMockups.length) {
      const before = JSON.stringify(existing.mockups || []);
      existing.mockups = Array.from(
        new Set([...(existing.mockups || []), ...report.copiedMockups])
      );
      if (JSON.stringify(existing.mockups) !== before) changed.mockups = true;
    }
    if (Object.keys(changed).length) {
      writeFileSync(manifestPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
      console.log(`[manifest] updated fields: ${Object.keys(changed).join(', ')}`);
    }
  } catch (e) {
    console.warn(`[manifest] could not merge into existing manifest: ${e.message}`);
  }
}

console.log('\n=== Finalize Summary ===');
console.log(`slug:              ${slug}`);
console.log(`design dir:        ${designDir}`);
console.log(`designs copied:    ${report.copiedDesigns.length ? report.copiedDesigns.join(', ') : '(none)'}`);
console.log(`mockups copied:    ${report.copiedMockups.length ? report.copiedMockups.join(', ') : '(none)'}`);
if (report.missingDesigns.length) {
  console.log(`missing designs:   ${report.missingDesigns.join(', ')}`);
}
if (report.missingMockups.length) {
  console.log(`missing mockups:   ${report.missingMockups.join(', ')}`);
}
console.log(`manifest:          ${manifestPath}`);

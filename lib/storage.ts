import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import type { DesignManifest } from '@/src/types';

const DESIGNS_ROOT = path.join(process.cwd(), 'designs');
const DATA_DIR = path.join(process.cwd(), 'data');

export function designsRoot(): string {
  return DESIGNS_ROOT;
}

export function designDir(slug: string): string {
  return path.join(DESIGNS_ROOT, slug);
}

export async function ensureDesignDir(slug: string): Promise<string> {
  const dir = designDir(slug);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listManifests(): Promise<DesignManifest[]> {
  try {
    const entries = await fs.readdir(DESIGNS_ROOT, { withFileTypes: true });
    const manifests: DesignManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(DESIGNS_ROOT, entry.name, 'manifest.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        manifests.push(normalizeManifest(JSON.parse(raw)));
      } catch {
        // Folder exists but no manifest yet (mid-pipeline). Skip.
      }
    }
    manifests.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return manifests;
  } catch {
    return [];
  }
}

export async function readManifest(slug: string): Promise<DesignManifest | null> {
  try {
    const raw = await fs.readFile(path.join(designDir(slug), 'manifest.json'), 'utf-8');
    return normalizeManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Pre-overhaul manifests don't have printify_image_ids / printify_mockups, and some
 * have recommended_shirt_colors as an empty array instead of an object. This shim
 * makes legacy data renderable by the new UI without touching the source files.
 */
// Duplicated here (rather than importing from src/ai) to keep storage free of LLM deps.
function sanitizeTitleInline(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[`$^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function normalizeManifest(raw: any): DesignManifest {
  const rsc = raw.recommended_shirt_colors || raw.recommended_product_colors;
  const recommended_product_colors =
    rsc && typeof rsc === 'object' && !Array.isArray(rsc)
      ? {
          light_variant: rsc.light_variant ?? [],
          dark_variant: rsc.dark_variant ?? [],
        }
      : { light_variant: [], dark_variant: [] };

  // Migrate legacy two-image manifests to the new single-image shape.
  const image =
    raw.files?.image ??
    raw.files?.light ??
    raw.files?.dark ??
    '';
  const printifyImageId =
    raw.printify_image_id ??
    raw.printify_image_ids?.image ??
    raw.printify_image_ids?.light ??
    raw.printify_image_ids?.dark ??
    undefined;

  const rawTitle: string = raw.title ?? raw.slug ?? '';
  const title = sanitizeTitleInline(rawTitle);

  return {
    slug: raw.slug ?? '',
    concept: raw.concept ?? '',
    title,
    description: raw.description ?? '',
    product_features: Array.isArray(raw.product_features) ? raw.product_features : [],
    care_instructions: Array.isArray(raw.care_instructions) ? raw.care_instructions : [],
    listing_footer: raw.listing_footer ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    recommended_product_colors,
    files: { image },
    mockups: Array.isArray(raw.mockups) ? raw.mockups : [],
    printify_image_id: printifyImageId,
    printify_mockups: Array.isArray(raw.printify_mockups) ? raw.printify_mockups : [],
    printify_products: Array.isArray(raw.printify_products) ? raw.printify_products : [],
    qa_reviews: raw.qa_reviews,
    created_at: raw.created_at ?? new Date(0).toISOString(),
  };
}

export async function deleteDesign(slug: string): Promise<boolean> {
  const dir = designDir(slug);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function writeManifest(manifest: DesignManifest): Promise<void> {
  await ensureDesignDir(manifest.slug);
  await fs.writeFile(
    path.join(designDir(manifest.slug), 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

export async function writeDesignFile(slug: string, filename: string, buffer: Buffer): Promise<string> {
  await ensureDesignDir(slug);
  const full = path.join(designDir(slug), filename);
  await fs.writeFile(full, buffer);
  return full;
}

export async function readDesignBuffer(slug: string, filename: string): Promise<Buffer> {
  const full = path.join(designDir(slug), filename);
  return await fs.readFile(full);
}

export interface ListingStandard {
  product_features: string[];
  care_instructions: string[];
  listing_footer: string;
}

let cachedStandard: ListingStandard | null = null;
export async function loadListingStandard(): Promise<ListingStandard> {
  if (cachedStandard) return cachedStandard;
  const raw = await fs.readFile(path.join(DATA_DIR, 'listing-standard.json'), 'utf-8');
  cachedStandard = JSON.parse(raw) as ListingStandard;
  return cachedStandard;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function uniqueSlug(base: string): Promise<string> {
  const slug = slugify(base);
  if (!slug) return `design-${Date.now()}`;
  try {
    await fs.access(designDir(slug));
    let i = 2;
    while (true) {
      const candidate = `${slug}-${i}`;
      try {
        await fs.access(designDir(candidate));
        i++;
      } catch {
        return candidate;
      }
    }
  } catch {
    return slug;
  }
}

export interface UsageRecord {
  date: string;
  fluxCalls: number;
}

const USAGE_PATH = path.join(DATA_DIR, 'usage.json');

export async function readUsage(): Promise<UsageRecord> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = await fs.readFile(USAGE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.date !== today) return { date: today, fluxCalls: 0 };
    return parsed;
  } catch {
    return { date: today, fluxCalls: 0 };
  }
}

export async function bumpFluxCalls(n: number): Promise<UsageRecord> {
  const current = await readUsage();
  const next: UsageRecord = { date: current.date, fluxCalls: current.fluxCalls + n };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USAGE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

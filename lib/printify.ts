import 'server-only';
import { requirePrintify } from './env';
import type { PrintifyMockupImage, PrintifyMockupSet } from '@/src/types';

const BASE = 'https://api.printify.com/v1';

interface PrintifyError {
  status: number;
  message: string;
  body: string;
}

async function pf<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { token } = requirePrintify();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'MyEtsyStore/2.0',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    const err: PrintifyError = {
      status: res.status,
      message: `Printify ${method} ${path} -> ${res.status}`,
      body: text.slice(0, 1200),
    };
    throw Object.assign(new Error(err.message), err);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export interface PrintifyShop {
  id: number;
  title: string;
  sales_channel: string;
}

export async function listShops(): Promise<PrintifyShop[]> {
  return pf<PrintifyShop[]>('GET', '/shops.json');
}

export interface PrintifyImageUpload {
  id: string;
  file_name: string;
  height: number;
  width: number;
  size: number;
  mime_type: string;
  preview_url: string;
  upload_time: string;
}

export async function uploadImageBase64(
  fileName: string,
  buffer: Buffer
): Promise<PrintifyImageUpload> {
  return pf<PrintifyImageUpload>('POST', '/uploads/images.json', {
    file_name: fileName,
    contents: buffer.toString('base64'),
  });
}

export interface PrintifyBlueprint {
  id: number;
  title: string;
  brand: string;
  model: string;
}

export async function listBlueprints(): Promise<PrintifyBlueprint[]> {
  return pf<PrintifyBlueprint[]>('GET', '/catalog/blueprints.json');
}

export async function findBlueprintBy(predicate: (b: PrintifyBlueprint) => boolean): Promise<PrintifyBlueprint | undefined> {
  const all = await listBlueprints();
  return all.find(predicate);
}

export interface PrintifyPrintProvider {
  id: number;
  title: string;
}

export async function listPrintProviders(blueprintId: number): Promise<PrintifyPrintProvider[]> {
  return pf<PrintifyPrintProvider[]>('GET', `/catalog/blueprints/${blueprintId}/print_providers.json`);
}

export interface PrintifyVariantOption {
  color?: string;
  size?: string;
}

export interface PrintifyVariant {
  id: number;
  title: string;
  options: PrintifyVariantOption;
  placeholders: Array<{ position: string; height: number; width: number }>;
}

export interface PrintifyVariantsResponse {
  id: number;
  title: string;
  variants: PrintifyVariant[];
}

export async function listVariants(blueprintId: number, providerId: number): Promise<PrintifyVariantsResponse> {
  return pf<PrintifyVariantsResponse>(
    'GET',
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`
  );
}

const LIGHT_COLORS = ['white', 'natural', 'heather prism natural', 'ash', 'soft cream', 'heather dust'];
const DARK_COLORS = ['black', 'navy', 'asphalt', 'forest', 'true royal', 'dark heather'];

export function pickVariantByPalette(
  variants: PrintifyVariant[],
  palette: 'light' | 'dark',
  preferredSize = 'M'
): PrintifyVariant | undefined {
  const targets = palette === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const sized = variants.filter(v => (v.options.size || '').toLowerCase() === preferredSize.toLowerCase());
  const pool = sized.length ? sized : variants;
  for (const target of targets) {
    const hit = pool.find(v => (v.options.color || '').toLowerCase().includes(target));
    if (hit) return hit;
  }
  return pool[0];
}

interface CreateProductInput {
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{ id: number; price: number; is_enabled: boolean }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images: Array<{ id: string; x: number; y: number; scale: number; angle: number }>;
    }>;
  }>;
}

export interface PrintifyProductResponse {
  id: string;
  title: string;
  images: PrintifyMockupImage[];
}

export async function createDraftProduct(input: CreateProductInput): Promise<PrintifyProductResponse> {
  const { shopId } = requirePrintify();
  return pf<PrintifyProductResponse>('POST', `/shops/${shopId}/products.json`, input);
}

export async function deleteProduct(productId: string): Promise<void> {
  const { shopId } = requirePrintify();
  await pf('DELETE', `/shops/${shopId}/products/${productId}.json`);
}

/**
 * Generate Printify mockups for an uploaded image by spinning up a throwaway draft product
 * (no published listing), capturing the rendered mockup URLs, and deleting the product.
 */
export interface MockupGenInput {
  uploadedImageId: string;
  variant: 'light' | 'dark';
  title: string;
  description: string;
  blueprintIdOverride?: number;
  providerIdOverride?: number;
}

export async function generateMockups(input: MockupGenInput): Promise<PrintifyMockupSet> {
  const blueprintId = input.blueprintIdOverride ?? (await resolveBellaCanvas3001Id());
  const providerId = input.providerIdOverride ?? (await resolveDefaultProviderId(blueprintId));
  const variantsResp = await listVariants(blueprintId, providerId);
  const chosen = pickVariantByPalette(variantsResp.variants, input.variant);
  if (!chosen) throw new Error(`No suitable variant for palette ${input.variant}`);

  const product = await createDraftProduct({
    title: `[mockup] ${input.title}`.slice(0, 140),
    description: input.description.slice(0, 500),
    blueprint_id: blueprintId,
    print_provider_id: providerId,
    variants: [{ id: chosen.id, price: 2499, is_enabled: true }],
    print_areas: [
      {
        variant_ids: [chosen.id],
        placeholders: [
          {
            position: 'front',
            images: [{ id: input.uploadedImageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
          },
        ],
      },
    ],
  });

  // Best-effort cleanup; don't block on failure.
  try {
    await deleteProduct(product.id);
  } catch {
    // ignore
  }

  return {
    variant: input.variant,
    blueprint_id: blueprintId,
    print_provider_id: providerId,
    product_id: product.id,
    images: product.images || [],
  };
}

let cachedBlueprintId: number | null = null;
async function resolveBellaCanvas3001Id(): Promise<number> {
  if (cachedBlueprintId) return cachedBlueprintId;
  const blueprint = await findBlueprintBy(b =>
    /bella\s*\+?\s*canvas/i.test(`${b.brand} ${b.title}`) && /3001/.test(`${b.title} ${b.model}`)
  );
  if (blueprint) {
    cachedBlueprintId = blueprint.id;
    return blueprint.id;
  }
  // Fallback to commonly-known ID; user can override via env.
  const fallback = Number(process.env.PRINTIFY_BLUEPRINT_ID || 6);
  cachedBlueprintId = fallback;
  return fallback;
}

const cachedProviderByBlueprint = new Map<number, number>();
async function resolveDefaultProviderId(blueprintId: number): Promise<number> {
  if (cachedProviderByBlueprint.has(blueprintId)) return cachedProviderByBlueprint.get(blueprintId)!;
  const preferred = process.env.PRINTIFY_PRINT_PROVIDER_ID_PREFERRED?.trim();
  if (preferred) {
    const id = Number(preferred);
    cachedProviderByBlueprint.set(blueprintId, id);
    return id;
  }
  const providers = await listPrintProviders(blueprintId);
  if (!providers.length) throw new Error(`No print providers for blueprint ${blueprintId}`);
  cachedProviderByBlueprint.set(blueprintId, providers[0].id);
  return providers[0].id;
}

export async function downloadMockupImages(set: PrintifyMockupSet, max: number): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  // Prefer the default mockup first, then fill with the rest.
  const ordered = [...set.images].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  for (const img of ordered.slice(0, max)) {
    try {
      const res = await fetch(img.src, { cache: 'no-store' });
      if (res.ok) buffers.push(Buffer.from(await res.arrayBuffer()));
    } catch {
      // skip failed downloads
    }
  }
  return buffers;
}

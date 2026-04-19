import 'server-only';
import { requirePrintify } from './env';
import type { PrintifyMockupImage, PrintifyMockupSet, PrintifyProduct, ProductIdea } from '@/src/types';

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

// Product type to blueprint ID mappings
export const PRODUCT_BLUEPRINTS: Record<string, number> = {
  'tshirt': 12, // Bella+Canvas 3001 - Unisex Jersey Short Sleeve Tee (softer, better print, preferred over Gildan 5000)
  'hoodie': 8, // Gildan 18500 - Unisex Heavy Blend Hoodie
  'sweatshirt': 18, // Gildan 18000 - Unisex Heavy Blend Crewneck Sweatshirt
  'mug': 21, // Generic brand Ceramic Mug
  'poster': 1130, // Generic brand Framed Posters, Matte
  'shower-curtain': 4, // Shower Curtain
  'phone-case': 14, // Phone Case
  'tote-bag': 20, // Tote Bag
  'pillow': 16, // Throw Pillow
  'other': 6, // Default to tshirt
};

// Product-specific color palettes
const PRODUCT_COLORS = {
  'tshirt': {
    light: ['white', 'natural', 'heather prism natural', 'ash', 'soft cream', 'heather dust'],
    dark: ['black', 'navy', 'asphalt', 'forest', 'true royal', 'dark heather']
  },
  'hoodie': {
    light: ['white', 'sand', 'heather grey', 'light pink', 'light blue'],
    dark: ['black', 'navy', 'charcoal', 'forest green', 'burgundy']
  },
  'sweatshirt': {
    light: ['white', 'natural', 'heather grey', 'sand', 'cream'],
    dark: ['black', 'navy', 'forest', 'charcoal', 'maroon']
  },
  'mug': {
    light: ['white', 'cream', 'light gray'],
    dark: ['black', 'navy', 'dark blue', 'dark gray']
  },
  'poster': {
    light: ['white', 'cream', 'light gray'],
    dark: ['black', 'dark gray', 'navy']
  },
  'shower-curtain': {
    light: ['white', 'cream', 'light gray'],
    dark: ['black', 'navy', 'dark gray']
  },
  'phone-case': {
    light: ['white', 'clear', 'light gray'],
    dark: ['black', 'dark blue', 'dark gray']
  },
  'tote-bag': {
    light: ['natural', 'white', 'cream', 'light gray'],
    dark: ['black', 'navy', 'dark gray', 'forest']
  },
  'pillow': {
    light: ['white', 'cream', 'light gray', 'beige'],
    dark: ['black', 'navy', 'dark gray', 'burgundy']
  },
  'other': {
    light: ['white', 'natural', 'heather prism natural', 'ash'],
    dark: ['black', 'navy', 'asphalt', 'forest']
  }
};

const LIGHT_COLORS = PRODUCT_COLORS.tshirt.light;
const DARK_COLORS = PRODUCT_COLORS.tshirt.dark;

export function pickVariantByPalette(
  variants: PrintifyVariant[],
  palette: 'light' | 'dark',
  productType: string = 'tshirt',
  preferredSize = 'M'
): PrintifyVariant | undefined {
  const colors = PRODUCT_COLORS[productType as keyof typeof PRODUCT_COLORS] || PRODUCT_COLORS.other;
  const targets = palette === 'light' ? colors.light : colors.dark;
  const sized = variants.filter(v => (v.options.size || '').toLowerCase() === preferredSize.toLowerCase());
  const pool = sized.length ? sized : variants;
  for (const target of targets) {
    const hit = pool.find(v => (v.options.color || '').toLowerCase().includes(target));
    if (hit) return hit;
  }
  return pool[0];
}

/**
 * Pick all variants whose color matches the combined light + dark palette for the product
 * type, optionally filtered to a set of preferred sizes. Returns at most one variant per
 * (color, size) pair.
 */
export function pickUniversalVariants(
  variants: PrintifyVariant[],
  productType: string = 'tshirt',
  preferredSizes: string[] = ['S', 'M', 'L', 'XL', '2XL']
): PrintifyVariant[] {
  const colors = PRODUCT_COLORS[productType as keyof typeof PRODUCT_COLORS] || PRODUCT_COLORS.other;
  const targets = [...new Set([...colors.light, ...colors.dark])];
  const sizeSet = new Set(preferredSizes.map(s => s.toLowerCase()));
  const picked: PrintifyVariant[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const color = (v.options.color || '').toLowerCase();
    const size = (v.options.size || '').toLowerCase();
    if (!targets.some(t => color.includes(t))) continue;
    // Size filter only applies if the blueprint actually has sizes.
    if (size && sizeSet.size && !sizeSet.has(size)) continue;
    const key = `${color}|${size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(v);
  }
  return picked;
}

/**
 * After a product is created, patch it with:
 *   - tags (Printify sometimes ignores tags on POST / products.json)
 *   - every image marked `is_selected_for_publishing: true` (so size chart + lifestyle
 *     mockups are published, not just the default few).
 */
export async function finalizeProduct(
  product: PrintifyProduct,
  tags: string[] = []
): Promise<PrintifyProduct> {
  const { shopId } = requirePrintify();
  const payload: Record<string, unknown> = {};
  if (product.images?.length) {
    payload.images = product.images.map(img => ({ ...img, is_selected_for_publishing: true }));
  }
  if (tags.length) payload.tags = tags.slice(0, 13);
  if (!Object.keys(payload).length) return product;
  return pf<PrintifyProduct>('PUT', `/shops/${shopId}/products/${product.id}.json`, payload);
}

/** @deprecated — use finalizeProduct which also handles tags. */
export async function selectAllMockupsForPublishing(product: PrintifyProduct): Promise<void> {
  await finalizeProduct(product);
}

interface CreateProductInput {
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  tags?: string[];
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

/**
 * Create ONE Printify product using a single universal design image, enabling all
 * variants whose colors span the light + dark palettes for the product category.
 * Much cheaper than two separate products and keeps Etsy listings unified.
 */
export async function createUniversalProduct(
  idea: ProductIdea,
  imageId: string,
  options: {
    publish?: boolean;
    blueprintIdOverride?: number;
    providerIdOverride?: number;
  } = {}
): Promise<PrintifyProduct> {
  const { shopId } = requirePrintify();
  const blueprintId =
    options.blueprintIdOverride ??
    idea.printifyBlueprintId ??
    PRODUCT_BLUEPRINTS[idea.category] ??
    PRODUCT_BLUEPRINTS.tshirt;
  const providerId = options.providerIdOverride ?? (await resolveDefaultProviderId(blueprintId));
  const variantsResp = await listVariants(blueprintId, providerId);

  const chosen = pickUniversalVariants(variantsResp.variants, idea.category);
  if (!chosen.length) {
    throw new Error(
      `No matching variants for ${idea.category} (blueprint ${blueprintId}, provider ${providerId}).`
    );
  }

  const basePrice = getBasePriceForProduct(idea.category);
  const finalPrice = idea.targetPrice || basePrice;

  const productInput: CreateProductInput = {
    title: idea.title.slice(0, 140),
    description: idea.description, // Printify supports long HTML/plain-text descriptions; do not truncate.
    blueprint_id: blueprintId,
    print_provider_id: providerId,
    tags: (idea.tags ?? []).slice(0, 13), // Etsy / Printify tag cap.
    variants: chosen.map(v => ({ id: v.id, price: finalPrice, is_enabled: true })),
    print_areas: [
      {
        variant_ids: chosen.map(v => v.id),
        placeholders: [
          {
            position: getDefaultPrintPosition(idea.category),
            images: [{ id: imageId, x: 0.5, y: 0.5, scale: getScaleForProduct(idea.category), angle: 0 }],
          },
        ],
      },
    ],
  };

  let product = await pf<PrintifyProduct>('POST', `/shops/${shopId}/products.json`, productInput);

  // Patch the product: set tags (POST often drops them) + flag every mockup image
  // (including size chart + lifestyle shots) for publishing.
  try {
    product = await finalizeProduct(product, idea.tags ?? []);
  } catch (err) {
    console.warn(`Could not finalize product ${product.id}:`, err);
  }

  if (options.publish) {
    try {
      await pf('POST', `/shops/${shopId}/products/${product.id}/publish.json`, {
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
      });
      product.published_at = new Date().toISOString();
    } catch (error) {
      console.warn(`Failed to publish product ${product.id}:`, error);
    }
  }

  return product;
}

export async function createProduct(
  idea: ProductIdea,
  lightImageId: string,
  darkImageId: string,
  options: {
    publish?: boolean;
    blueprintIdOverride?: number;
    providerIdOverride?: number;
  } = {}
): Promise<PrintifyProduct[]> {
  const { shopId } = requirePrintify();
  const products: PrintifyProduct[] = [];
  
  // Get blueprint ID for the product category
  const blueprintId = options.blueprintIdOverride ?? idea.printifyBlueprintId ?? PRODUCT_BLUEPRINTS[idea.category] ?? PRODUCT_BLUEPRINTS.tshirt;
  const providerId = options.providerIdOverride ?? await resolveDefaultProviderId(blueprintId);
  
  // Get variants for this blueprint
  const variantsResp = await listVariants(blueprintId, providerId);
  
  // Create products for both light and dark variants
  for (const [imageKey, imageId] of Object.entries({ light: lightImageId, dark: darkImageId })) {
    const variant = pickVariantByPalette(variantsResp.variants, imageKey as 'light' | 'dark', idea.category);
    if (!variant) {
      console.warn(`No suitable variant found for ${imageKey} ${idea.category}`);
      continue;
    }

    // Calculate pricing based on product type and target price
    const basePrice = getBasePriceForProduct(idea.category);
    const finalPrice = idea.targetPrice || basePrice;

    const productInput: CreateProductInput = {
      title: idea.title.slice(0, 140),
      description: idea.description,
      tags: (idea.tags ?? []).slice(0, 13),
      blueprint_id: blueprintId,
      print_provider_id: providerId,
      variants: [{ id: variant.id, price: finalPrice, is_enabled: true }],
      print_areas: [
        {
          variant_ids: [variant.id],
          placeholders: [
            {
              position: getDefaultPrintPosition(idea.category),
              images: [{ id: imageId, x: 0.5, y: 0.5, scale: getScaleForProduct(idea.category), angle: 0 }],
            },
          ],
        },
      ],
    };

    const product = await pf<PrintifyProduct>('POST', `/shops/${shopId}/products.json`, productInput);
    
    // Publish if requested
    if (options.publish) {
      try {
        await pf('PUT', `/shops/${shopId}/products/${product.id}/publish.json`);
        product.published_at = new Date().toISOString();
      } catch (error) {
        console.warn(`Failed to publish product ${product.id}:`, error);
      }
    }
    
    products.push(product);
  }
  
  return products;
}

function getBasePriceForProduct(category: string): number {
  const basePrices: Record<string, number> = {
    'tshirt': 2499, // $24.99
    'hoodie': 4499, // $44.99
    'sweatshirt': 3999, // $39.99
    'mug': 1499, // $14.99
    'poster': 1999, // $19.99
    'shower-curtain': 3499, // $34.99
    'phone-case': 2499, // $24.99
    'tote-bag': 1999, // $19.99
    'pillow': 2499, // $24.99
    'other': 2499,
  };
  return basePrices[category] || basePrices.other;
}

function getDefaultPrintPosition(category: string): string {
  const positions: Record<string, string> = {
    'tshirt': 'front',
    'hoodie': 'front',
    'sweatshirt': 'front',
    'mug': 'center',
    'poster': 'center',
    'shower-curtain': 'center',
    'phone-case': 'back',
    'tote-bag': 'front',
    'pillow': 'front',
    'other': 'front',
  };
  return positions[category] || 'front';
}

function getScaleForProduct(category: string): number {
  const scales: Record<string, number> = {
    'tshirt': 1.0,
    'hoodie': 1.1,
    'sweatshirt': 1.1,
    'mug': 0.8,
    'poster': 1.2,
    'shower-curtain': 1.5,
    'phone-case': 0.9,
    'tote-bag': 1.0,
    'pillow': 1.3,
    'other': 1.0,
  };
  return scales[category] || 1.0;
}

/**
 * Fetch a Printify product and replace every image-id reference in its print_areas
 * with `newImageId`, preserving x/y/scale/angle/variant assignments. Used when a
 * design PNG is regenerated and re-uploaded — the product itself still points at
 * the OLD Printify image id until this runs.
 */
export async function replaceProductImage(
  productId: string,
  newImageId: string
): Promise<PrintifyProduct> {
  const product = await getProduct(productId);
  const printAreas = (product.print_areas ?? []).map(area => ({
    variant_ids: area.variant_ids,
    placeholders: (area.placeholders ?? []).map(ph => ({
      position: ph.position,
      images: (ph.images ?? []).map(img => ({
        id: newImageId,
        x: img.x,
        y: img.y,
        scale: img.scale,
        angle: img.angle,
      })),
    })),
  }));
  return updateProduct(productId, { print_areas: printAreas } as Partial<CreateProductInput>);
}

export async function updateProduct(productId: string, updates: Partial<CreateProductInput>): Promise<PrintifyProduct> {
  const { shopId } = requirePrintify();
  return pf<PrintifyProduct>('PUT', `/shops/${shopId}/products/${productId}.json`, updates);
}

export async function getProduct(productId: string): Promise<PrintifyProduct> {
  const { shopId } = requirePrintify();
  return pf<PrintifyProduct>('GET', `/shops/${shopId}/products/${productId}.json`);
}

export async function listProducts(limit = 20): Promise<PrintifyProduct[]> {
  const { shopId } = requirePrintify();
  return pf<PrintifyProduct[]>('GET', `/shops/${shopId}/products.json?limit=${limit}`);
}

export async function deleteProduct(productId: string): Promise<void> {
  const { shopId } = requirePrintify();
  await pf('DELETE', `/shops/${shopId}/products/${productId}.json`);
}

interface PrintifyProductWithPrintAreas extends PrintifyProduct {
  print_areas?: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images: Array<{ id: string; x: number; y: number; scale: number; angle: number; type?: string }>;
    }>;
  }>;
}

/**
 * Swap every image reference in an existing product's print_areas to a new image ID,
 * then re-publish the product so Etsy/sales-channel listings pick up the new artwork.
 * Required after re-uploading a regenerated PNG — Printify does NOT auto-update products
 * when the underlying upload changes; the product holds a fixed reference to the old
 * upload ID until you PUT new print_areas.
 */
export async function repointProductImage(
  productId: string,
  newImageId: string,
  options: { publish?: boolean } = {}
): Promise<PrintifyProduct> {
  const { shopId } = requirePrintify();
  const current = await pf<PrintifyProductWithPrintAreas>('GET', `/shops/${shopId}/products/${productId}.json`);

  const updatedPrintAreas = (current.print_areas ?? []).map(area => ({
    variant_ids: area.variant_ids,
    placeholders: area.placeholders.map(ph => ({
      position: ph.position,
      images: ph.images.map(img => ({ ...img, id: newImageId })),
    })),
  }));

  const updated = await pf<PrintifyProduct>('PUT', `/shops/${shopId}/products/${productId}.json`, {
    print_areas: updatedPrintAreas,
  });

  if (options.publish) {
    try {
      await pf('POST', `/shops/${shopId}/products/${productId}/publish.json`, {
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
      });
      updated.published_at = new Date().toISOString();
    } catch (err) {
      console.warn(`Failed to re-publish product ${productId} after image swap:`, err);
    }
  }

  return updated;
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

  const { shopId } = requirePrintify();
  const product = await pf<PrintifyProduct>('POST', `/shops/${shopId}/products.json`, {
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

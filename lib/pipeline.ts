import 'server-only';
import { BanterAI } from '@/src/ai';
import { generateFluxBuffer } from '@/src/flux';
import type { DesignManifest, GenerationOptions, ProductIdea } from '@/src/types';
import {
  bumpFluxCalls,
  ensureDesignDir,
  listManifests,
  loadListingStandard,
  readManifest,
  readUsage,
  uniqueSlug,
  writeDesignFile,
  writeManifest,
  readDesignBuffer,
} from './storage';
import { ensureTransparentPng } from './transparency';
import { envStatus } from './env';
import {
  createUniversalProduct,
  downloadMockupImages,
  replaceProductImage,
  uploadImageBase64,
} from './printify';

export type PipelineEvent =
  | { type: 'log'; message: string }
  | { type: 'idea.start' }
  | { type: 'idea.done'; slug: string; idea: ProductIdea }
  | { type: 'flux.start' }
  | { type: 'flux.done'; file: string }
  | { type: 'printify.upload.start' }
  | { type: 'printify.upload.done'; imageId: string }
  | { type: 'printify.products.start' }
  | { type: 'printify.products.done'; count: number; productIds: string[] }
  | { type: 'printify.mockups.start' }
  | { type: 'printify.mockups.done'; count: number }
  | { type: 'manifest.write'; slug: string }
  | { type: 'done'; slug: string }
  | { type: 'error'; step: string; message: string };

export interface RunPipelineInput {
  theme?: string;
  style?: GenerationOptions['style'];
  category?: ProductIdea['category'];
  /** Skip Printify upload + products entirely. */
  skipPrintify?: boolean;
  /** When true, create a draft Printify product (also gets us mockups). Default true. */
  createProducts?: boolean;
  /** When true, publish the created product to the connected sales channel. */
  publishProducts?: boolean;
  /** How many mockups to download. */
  mockupCount?: number;
}

const DEFAULT_MOCKUP_COUNT = 0;

export async function* runPipeline(input: RunPipelineInput): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.llm) {
    yield { type: 'error', step: 'env', message: 'LLM not configured (set Azure OpenAI or OPENAI_API_KEY)' };
    return;
  }
  if (!env.flux) {
    yield { type: 'error', step: 'env', message: 'FLUX not configured (set AZURE_FLUX_ENDPOINT + AZURE_FLUX_API_KEY)' };
    return;
  }

  const usage = await readUsage();
  if (usage.fluxCalls + 1 > env.fluxDailyCap) {
    yield {
      type: 'error',
      step: 'budget',
      message: `Daily FLUX cap reached: ${usage.fluxCalls}/${env.fluxDailyCap}. Resets tomorrow.`,
    };
    return;
  }

  // 1. LLM idea — pass existing concepts so it doesn't repeat the same persona.
  yield { type: 'idea.start' };
  let idea: ProductIdea;
  try {
    const existing = await listManifests();
    const avoid = existing
      .slice(0, 40)
      .map((m) => m.concept || m.title)
      .filter((s): s is string => Boolean(s && s.trim()));
    const ai = new BanterAI();
    idea = await ai.generateIdea({ theme: input.theme, style: input.style, avoid });
  } catch (err) {
    yield { type: 'error', step: 'idea', message: stringifyError(err) };
    return;
  }

  const slug = await uniqueSlug(idea.concept || idea.title || `idea-${Date.now()}`);
  await ensureDesignDir(slug);
  // Persist the prompt sidecar so regenerateImage works later.
  await writeDesignFile(slug, 'prompts.json', Buffer.from(
    JSON.stringify({ imagePrompt: idea.imagePrompt, printReadyPrompt: idea.printReadyPrompt }, null, 2)
  ));
  yield { type: 'idea.done', slug, idea };

  // 2. FLUX (single universal image)
  yield { type: 'flux.start' };
  let designFile: string | undefined;
  try {
    const result = await generateFluxBuffer(idea.imagePrompt, {
      printReadyPrompt: idea.printReadyPrompt,
      transparent: true,
    });
    await bumpFluxCalls(1);
    const transparent = await ensureTransparentPng(result.buffer);
    designFile = `${slug}.png`;
    await writeDesignFile(slug, designFile, transparent);
    yield { type: 'flux.done', file: designFile };
  } catch (err) {
    yield { type: 'error', step: 'flux', message: stringifyError(err) };
    return;
  }

  // 3. Printify upload + product + mockups
  let printifyImageId: string | undefined;
  const printifyProducts: DesignManifest['printify_products'] = [];
  const mockupFilenames: string[] = [];
  const shouldPrintify = !input.skipPrintify && env.printify;
  const createProducts = input.createProducts === true; // default false

  if (shouldPrintify) {
    yield { type: 'printify.upload.start' };
    try {
      const buffer = await readDesignBuffer(slug, designFile);
      const upload = await uploadImageBase64(designFile, buffer);
      printifyImageId = upload.id;
      yield { type: 'printify.upload.done', imageId: upload.id };
    } catch (err) {
      yield { type: 'error', step: 'printify.upload', message: stringifyError(err) };
    }

    if (printifyImageId && createProducts) {
      yield { type: 'printify.products.start' };
      try {
        // Assemble the full description (creative block + product features + care
        // + footer) BEFORE creating the product, so Printify gets the complete text.
        const standardEarly = await loadListingStandard();
        const ideaWithFullDesc: ProductIdea = {
          ...idea,
          description: assembleDescription(idea, standardEarly),
        };
        const product = await createUniversalProduct(ideaWithFullDesc, printifyImageId, {
          publish: input.publishProducts,
        });
        printifyProducts.push(product);
        yield { type: 'printify.products.done', count: 1, productIds: [product.id] };

        yield { type: 'printify.mockups.start' };
        const mockupCount = input.mockupCount ?? DEFAULT_MOCKUP_COUNT;
        const buffers = await downloadMockupImages(
          { variant: 'light', blueprint_id: product.blueprint_id, print_provider_id: product.print_provider_id, product_id: product.id, images: product.images },
          mockupCount
        );
        for (let i = 0; i < buffers.length; i++) {
          const name = `${slug}-mockup-${i + 1}.png`;
          await writeDesignFile(slug, name, buffers[i]);
          mockupFilenames.push(name);
        }
        yield { type: 'printify.mockups.done', count: buffers.length };
      } catch (err) {
        yield { type: 'error', step: 'printify.products', message: stringifyError(err) };
      }
    }
  } else if (!env.printify) {
    yield { type: 'log', message: 'Printify not configured — skipping upload.' };
  }

  // 4. Manifest
  const standard = await loadListingStandard();
  const manifest: DesignManifest = {
    slug,
    concept: idea.concept,
    title: idea.title,
    description: assembleDescription(idea, standard),
    product_features: standard.product_features,
    care_instructions: standard.care_instructions,
    listing_footer: standard.listing_footer,
    tags: idea.tags,
    keywords: idea.keywords,
    recommended_product_colors: {
      light_variant: idea.recommendedProductColors.light,
      dark_variant: idea.recommendedProductColors.dark,
    },
    files: { image: designFile! },
    mockups: mockupFilenames,
    printify_image_id: printifyImageId,
    printify_mockups: [],
    printify_products: printifyProducts,
    created_at: new Date().toISOString(),
  };
  await writeManifest(manifest);
  yield { type: 'manifest.write', slug };
  yield { type: 'done', slug };
}

function assembleDescription(
  idea: ProductIdea,
  standard: { product_features: string[]; care_instructions: string[]; listing_footer: string }
): string {
  return idea.description + '\n\n' +
         standard.product_features.join('\n') + '\n\n' +
         standard.care_instructions.join('\n') + '\n\n' +
         standard.listing_footer;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Per-design operations (used by /api/designs/[slug])
// ---------------------------------------------------------------------------

/** Upload (or re-upload) the design PNG to Printify and patch the manifest. */
export async function* uploadToPrintify(slug: string): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.printify) {
    yield { type: 'error', step: 'env', message: 'Printify not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for slug ${slug}` };
    return;
  }
  const filename = manifest.files.image;
  if (!filename) {
    yield { type: 'error', step: 'manifest', message: `Manifest has no image file.` };
    return;
  }

  yield { type: 'printify.upload.start' };
  try {
    // Use a unique file name per upload so Printify doesn't dedupe against a
    // previously-uploaded version (e.g. from before the user regenerated the art).
    const uploadName = `${slug}-${Date.now()}.png`;
    const buffer = await readDesignBuffer(slug, filename);
    const upload = await uploadImageBase64(uploadName, buffer);
    yield { type: 'printify.upload.done', imageId: upload.id };

    // Repoint every existing Printify product at the new image id — otherwise the
    // product on Printify keeps rendering the OLD design because its print_areas
    // still reference the old image id.
    const existing = manifest.printify_products ?? [];
    const updated = [] as typeof existing;
    for (const p of existing) {
      try {
        const refreshed = await replaceProductImage(p.id, upload.id);
        updated.push(refreshed);
        yield { type: 'log', message: `Updated Printify product ${p.id} with new image.` };
      } catch (err) {
        yield {
          type: 'log',
          message: `Failed to update product ${p.id}: ${stringifyError(err)}. Keeping old reference.`,
        };
        updated.push(p);
      }
    }

    await writeManifest({
      ...manifest,
      printify_image_id: upload.id,
      printify_products: updated,
    });
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: 'printify.upload', message: stringifyError(err) };
  }
}

/** Re-run FLUX for the single universal image using the saved prompt sidecar. */
export async function* regenerateImage(slug: string): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.flux) {
    yield { type: 'error', step: 'env', message: 'FLUX not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for slug ${slug}` };
    return;
  }
  const sidecar = await readPromptSidecar(slug);
  if (!sidecar?.imagePrompt) {
    yield {
      type: 'error',
      step: 'flux',
      message: `No saved imagePrompt for ${slug}. Create designs/${slug}/prompts.json with an "imagePrompt" key.`,
    };
    return;
  }

  const usage = await readUsage();
  if (usage.fluxCalls + 1 > env.fluxDailyCap) {
    yield {
      type: 'error',
      step: 'budget',
      message: `Daily FLUX cap reached: ${usage.fluxCalls}/${env.fluxDailyCap}.`,
    };
    return;
  }

  yield { type: 'flux.start' };
  try {
    const result = await generateFluxBuffer(sidecar.imagePrompt, {
      printReadyPrompt: sidecar.printReadyPrompt,
      transparent: true,
    });
    await bumpFluxCalls(1);
    const transparent = await ensureTransparentPng(result.buffer);
    const filename = `${slug}.png`;
    await writeDesignFile(slug, filename, transparent);
    await writeManifest({ ...manifest, files: { image: filename } });
    yield { type: 'flux.done', file: filename };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: 'flux', message: stringifyError(err) };
  }
}

/** Re-download mockups from the existing Printify product. */
export async function* regenerateMockups(
  slug: string,
  mockupCount = DEFAULT_MOCKUP_COUNT
): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.printify) {
    yield { type: 'error', step: 'env', message: 'Printify not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for slug ${slug}` };
    return;
  }
  const product = manifest.printify_products?.[0];
  if (!product) {
    yield {
      type: 'error',
      step: 'printify.mockups',
      message: 'No Printify product on this design. Run "Create products" first.',
    };
    return;
  }

  yield { type: 'printify.mockups.start' };
  try {
    const buffers = await downloadMockupImages(
      {
        variant: 'light',
        blueprint_id: product.blueprint_id,
        print_provider_id: product.print_provider_id,
        product_id: product.id,
        images: product.images,
      },
      mockupCount
    );
    const mockupFilenames: string[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const name = `${slug}-mockup-${i + 1}.png`;
      await writeDesignFile(slug, name, buffers[i]);
      mockupFilenames.push(name);
    }
    await writeManifest({ ...manifest, mockups: mockupFilenames });
    yield { type: 'printify.mockups.done', count: buffers.length };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: 'printify.mockups', message: stringifyError(err) };
  }
}

/** Create the universal Printify product from the uploaded image. */
export async function* createProductsForDesign(
  slug: string,
  opts: { publish?: boolean; category?: ProductIdea['category'] } = {}
): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.printify) {
    yield { type: 'error', step: 'env', message: 'Printify not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for slug ${slug}` };
    return;
  }
  const imageId = manifest.printify_image_id;
  if (!imageId) {
    yield {
      type: 'error',
      step: 'printify.products',
      message: 'No Printify image ID. Run "Upload to Printify" first.',
    };
    return;
  }

  const idea = {
    concept: manifest.concept,
    title: manifest.title,
    description: manifest.description,
    tags: manifest.tags,
    keywords: manifest.keywords,
    imagePrompt: '',
    printReadyPrompt: '',
    category: opts.category ?? 'tshirt',
    humorStyle: '',
    colorStrategy: '',
    recommendedProductColors: {
      light: manifest.recommended_product_colors.light_variant,
      dark: manifest.recommended_product_colors.dark_variant,
    },
  } as unknown as ProductIdea;

  yield { type: 'printify.products.start' };
  try {
    const product = await createUniversalProduct(idea, imageId, { publish: opts.publish });
    await writeManifest({
      ...manifest,
      printify_products: [...(manifest.printify_products ?? []), product],
    });
    yield { type: 'printify.products.done', count: 1, productIds: [product.id] };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: 'printify.products', message: stringifyError(err) };
  }
}

async function readPromptSidecar(
  slug: string
): Promise<{ imagePrompt?: string; printReadyPrompt?: string } | null> {
  try {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const file = path.join(process.cwd(), 'designs', slug, 'prompts.json');
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

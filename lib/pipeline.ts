import 'server-only';
import { BanterAI } from '@/src/ai';
import { generateFluxBuffer } from '@/src/flux';
import type { DesignManifest, GenerationOptions, ProductIdea } from '@/src/types';
import {
  bumpFluxCalls,
  ensureDesignDir,
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
  createProduct,
  downloadMockupImages,
  generateMockups,
  uploadImageBase64,
} from './printify';

export type PipelineEvent =
  | { type: 'log'; message: string }
  | { type: 'idea.start' }
  | { type: 'idea.done'; slug: string; idea: ProductIdea }
  | { type: 'flux.start'; variant: 'light' | 'dark' }
  | { type: 'flux.done'; variant: 'light' | 'dark'; file: string }
  | { type: 'printify.upload.start'; variant: 'light' | 'dark' }
  | { type: 'printify.upload.done'; variant: 'light' | 'dark'; imageId: string }
  | { type: 'printify.products.start' }
  | { type: 'printify.products.done'; count: number; productIds: string[] }
  | { type: 'printify.mockups.start'; variant: 'light' | 'dark' }
  | { type: 'printify.mockups.done'; variant: 'light' | 'dark'; count: number }
  | { type: 'manifest.write'; slug: string }
  | { type: 'done'; slug: string }
  | { type: 'error'; step: string; message: string };

export interface RunPipelineInput {
  theme?: string;
  style?: GenerationOptions['style'];
  category?: ProductIdea['category'];
  /** When true, skip Printify image upload + mockups (useful if Printify isn't configured yet). */
  skipPrintify?: boolean;
  /** When true, create actual Printify products instead of just mockups */
  createProducts?: boolean;
  /** When true, publish the created products */
  publishProducts?: boolean;
  /** Maximum mockups to download per variant. */
  mockupsPerVariant?: number;
}

const DEFAULT_MOCKUPS_PER_VARIANT = 2;

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
  if (usage.fluxCalls + 2 > env.fluxDailyCap) {
    yield {
      type: 'error',
      step: 'budget',
      message: `Daily FLUX cap reached: ${usage.fluxCalls}/${env.fluxDailyCap}. Resets tomorrow.`,
    };
    return;
  }

  // 1. Generate idea
  yield { type: 'idea.start' };
  let idea: ProductIdea;
  try {
    const ai = new BanterAI();
    idea = await ai.generateIdea({ theme: input.theme, style: input.style });
  } catch (err) {
    yield { type: 'error', step: 'idea', message: stringifyError(err) };
    return;
  }

  const slug = await uniqueSlug(idea.concept || idea.title || `idea-${Date.now()}`);
  await ensureDesignDir(slug);
  yield { type: 'idea.done', slug, idea };

  // 2. FLUX (parallel light + dark)
  const variants: Array<'light' | 'dark'> = ['light', 'dark'];
  for (const v of variants) yield { type: 'flux.start', variant: v };

  const fluxResults = await Promise.allSettled(
    variants.map(v =>
      generateFluxBuffer(v === 'light' ? idea.lightImagePrompt : idea.darkImagePrompt, {
        printReadyPrompt: idea.printReadyPrompt,
        transparent: true,
      })
    )
  );
  await bumpFluxCalls(2);

  const designFiles: { light?: string; dark?: string } = {};
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const r = fluxResults[i];
    if (r.status !== 'fulfilled') {
      yield { type: 'error', step: `flux.${v}`, message: stringifyError(r.reason) };
      continue;
    }
    try {
      const transparent = await ensureTransparentPng(r.value.buffer);
      const filename = `${slug}-${v}.png`;
      await writeDesignFile(slug, filename, transparent);
      designFiles[v] = filename;
      yield { type: 'flux.done', variant: v, file: filename };
    } catch (err) {
      yield { type: 'error', step: `flux.${v}.transparency`, message: stringifyError(err) };
    }
  }

  // 3. Printify upload + product creation + mockups
  const printifyImageIds: { light?: string; dark?: string } = {};
  const printifyProducts: DesignManifest['printify_products'] = [];
  const printifyMockups: DesignManifest['printify_mockups'] = [];
  const mockupFilenames: string[] = [];
  const mockupsPerVariant = input.mockupsPerVariant ?? DEFAULT_MOCKUPS_PER_VARIANT;

  if (!input.skipPrintify && env.printify) {
    // Upload images first
    for (const v of variants) {
      const filename = designFiles[v];
      if (!filename) continue;

      yield { type: 'printify.upload.start', variant: v };
      let imageId: string | undefined;
      try {
        const buffer = await readDesignBuffer(slug, filename);
        const upload = await uploadImageBase64(filename, buffer);
        imageId = upload.id;
        printifyImageIds[v] = imageId;
        yield { type: 'printify.upload.done', variant: v, imageId };
      } catch (err) {
        yield { type: 'error', step: `printify.upload.${v}`, message: stringifyError(err) };
        continue;
      }
    }

    // Create products if requested
    if (input.createProducts && printifyImageIds.light && printifyImageIds.dark) {
      yield { type: 'printify.products.start' };
      try {
        const products = await createProduct(idea, printifyImageIds.light, printifyImageIds.dark, {
          publish: input.publishProducts,
        });
        printifyProducts.push(...products);
        const productIds = products.map(p => p.id);
        yield { type: 'printify.products.done', count: products.length, productIds };
      } catch (err) {
        yield { type: 'error', step: 'printify.products', message: stringifyError(err) };
      }
    }

    // Generate mockups
    for (const v of variants) {
      const imageId = printifyImageIds[v];
      if (!imageId) continue;

      yield { type: 'printify.mockups.start', variant: v };
      try {
        const set = await generateMockups({
          uploadedImageId: imageId,
          variant: v,
          title: idea.title,
          description: idea.concept,
        });
        printifyMockups.push(set);
        const mockupBuffers = await downloadMockupImages(set, mockupsPerVariant);
        for (let mi = 0; mi < mockupBuffers.length; mi++) {
          const mockupFilename = `${slug}-mockup-${mockupFilenames.length + 1}.png`;
          await writeDesignFile(slug, mockupFilename, mockupBuffers[mi]);
          mockupFilenames.push(mockupFilename);
        }
        yield { type: 'printify.mockups.done', variant: v, count: mockupBuffers.length };
      } catch (err) {
        yield { type: 'error', step: `printify.mockups.${v}`, message: stringifyError(err) };
      }
    }
  } else if (!env.printify) {
    yield {
      type: 'log',
      message: 'Printify not configured — skipping upload and mockup steps.',
    };
  }

  // 4. Build + write manifest
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
    files: {
      light: designFiles.light ?? '',
      dark: designFiles.dark ?? '',
    },
    mockups: mockupFilenames,
    printify_image_ids: printifyImageIds,
    printify_mockups: printifyMockups,
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

/** Upload (or re-upload) the design PNGs for a slug to Printify and patch the manifest. */
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

  const variants: Array<'light' | 'dark'> = ['light', 'dark'];
  const imageIds: { light?: string; dark?: string } = { ...manifest.printify_image_ids };

  for (const v of variants) {
    const filename = manifest.files[v];
    if (!filename) {
      yield { type: 'log', message: `No ${v} file on disk — skipping.` };
      continue;
    }
    yield { type: 'printify.upload.start', variant: v };
    try {
      const buffer = await readDesignBuffer(slug, filename);
      const upload = await uploadImageBase64(filename, buffer);
      imageIds[v] = upload.id;
      yield { type: 'printify.upload.done', variant: v, imageId: upload.id };
    } catch (err) {
      yield { type: 'error', step: `printify.upload.${v}`, message: stringifyError(err) };
    }
  }

  await writeManifest({ ...manifest, printify_image_ids: imageIds });
  yield { type: 'manifest.write', slug };
  yield { type: 'done', slug };
}

/** Re-run FLUX for a single variant. Requires a `prompts` sidecar since manifests don't store prompts. */
export async function* regenerateVariant(
  slug: string,
  variant: 'light' | 'dark'
): AsyncGenerator<PipelineEvent> {
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

  const prompt = await readPromptSidecar(slug, variant);
  if (!prompt) {
    yield {
      type: 'error',
      step: `flux.${variant}`,
      message:
        `No saved prompt for ${variant}. This design was generated before prompts were persisted. ` +
        `Create designs/${slug}/prompts.json with keys "lightImagePrompt" and "darkImagePrompt".`,
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

  yield { type: 'flux.start', variant };
  try {
    const result = await generateFluxBuffer(prompt, { transparent: true });
    await bumpFluxCalls(1);
    const transparent = await ensureTransparentPng(result.buffer);
    const filename = `${slug}-${variant}.png`;
    await writeDesignFile(slug, filename, transparent);
    const updated = { ...manifest, files: { ...manifest.files, [variant]: filename } };
    await writeManifest(updated);
    yield { type: 'flux.done', variant, file: filename };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: `flux.${variant}`, message: stringifyError(err) };
  }
}

/** Re-generate Printify mockups from the already-uploaded image IDs. */
export async function* regenerateMockups(
  slug: string,
  mockupsPerVariant = DEFAULT_MOCKUPS_PER_VARIANT
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

  const variants: Array<'light' | 'dark'> = ['light', 'dark'];
  const mockupSets: DesignManifest['printify_mockups'] = [];
  const mockupFilenames: string[] = [];

  for (const v of variants) {
    const imageId = manifest.printify_image_ids[v];
    if (!imageId) {
      yield { type: 'log', message: `No Printify image ID for ${v} — run Upload first.` };
      continue;
    }
    yield { type: 'printify.mockups.start', variant: v };
    try {
      const set = await generateMockups({
        uploadedImageId: imageId,
        variant: v,
        title: manifest.title,
        description: manifest.concept,
      });
      mockupSets.push(set);
      const buffers = await downloadMockupImages(set, mockupsPerVariant);
      for (const buf of buffers) {
        const name = `${slug}-mockup-${mockupFilenames.length + 1}.png`;
        await writeDesignFile(slug, name, buf);
        mockupFilenames.push(name);
      }
      yield { type: 'printify.mockups.done', variant: v, count: buffers.length };
    } catch (err) {
      yield { type: 'error', step: `printify.mockups.${v}`, message: stringifyError(err) };
    }
  }

  await writeManifest({ ...manifest, printify_mockups: mockupSets, mockups: mockupFilenames });
  yield { type: 'manifest.write', slug };
  yield { type: 'done', slug };
}

/** Create real Printify draft products from the already-uploaded image IDs. */
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
  const { light, dark } = manifest.printify_image_ids;
  if (!light || !dark) {
    yield {
      type: 'error',
      step: 'printify.products',
      message: 'Both light and dark Printify image IDs required. Run "Upload to Printify" first.',
    };
    return;
  }

  // Build a minimal ProductIdea-shaped object for createProduct.
  const idea = {
    concept: manifest.concept,
    title: manifest.title,
    description: manifest.description,
    tags: manifest.tags,
    keywords: manifest.keywords,
    lightImagePrompt: '',
    darkImagePrompt: '',
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
    const products = await createProduct(idea, light, dark, { publish: opts.publish });
    const productIds = products.map(p => p.id);
    await writeManifest({ ...manifest, printify_products: [...(manifest.printify_products ?? []), ...products] });
    yield { type: 'printify.products.done', count: products.length, productIds };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: 'printify.products', message: stringifyError(err) };
  }
}

async function readPromptSidecar(
  slug: string,
  variant: 'light' | 'dark'
): Promise<string | null> {
  try {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const file = path.join(process.cwd(), 'designs', slug, 'prompts.json');
    const raw = await fs.readFile(file, 'utf-8');
    const p = JSON.parse(raw) as { lightImagePrompt?: string; darkImagePrompt?: string };
    const key = variant === 'light' ? 'lightImagePrompt' : 'darkImagePrompt';
    return p[key]?.trim() || null;
  } catch {
    return null;
  }
}

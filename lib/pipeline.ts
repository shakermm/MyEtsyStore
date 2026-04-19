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
} from './storage';
import { ensureTransparentPng } from './transparency';
import { envStatus } from './env';
import {
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
  | { type: 'printify.mockups.start'; variant: 'light' | 'dark' }
  | { type: 'printify.mockups.done'; variant: 'light' | 'dark'; count: number }
  | { type: 'manifest.write'; slug: string }
  | { type: 'done'; slug: string }
  | { type: 'error'; step: string; message: string };

export interface RunPipelineInput {
  theme?: string;
  style?: GenerationOptions['style'];
  /** When true, skip Printify image upload + mockups (useful if Printify isn't configured yet). */
  skipPrintify?: boolean;
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

  // 3. Printify upload + mockups (sequential per variant, but only if we have a file)
  const printifyImageIds: { light?: string; dark?: string } = {};
  const printifyMockups: DesignManifest['printify_mockups'] = [];
  const mockupFilenames: string[] = [];
  const mockupsPerVariant = input.mockupsPerVariant ?? DEFAULT_MOCKUPS_PER_VARIANT;

  if (!input.skipPrintify && env.printify) {
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
    recommended_shirt_colors: {
      light_variant: idea.recommendedShirtColors.light,
      dark_variant: idea.recommendedShirtColors.dark,
    },
    files: {
      light: designFiles.light ?? '',
      dark: designFiles.dark ?? '',
    },
    mockups: mockupFilenames,
    printify_image_ids: printifyImageIds,
    printify_mockups: printifyMockups,
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
  const parts: string[] = [idea.description.trim()];
  parts.push('');
  parts.push('Product features');
  parts.push(...standard.product_features.map(b => `• ${b}`));
  parts.push('');
  parts.push('Care instructions');
  parts.push(...standard.care_instructions.map(b => `• ${b}`));
  parts.push('');
  parts.push(standard.listing_footer);
  return parts.join('\n');
}

async function readDesignBuffer(slug: string, filename: string): Promise<Buffer> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  return fs.readFile(path.join(process.cwd(), 'designs', slug, filename));
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

// ---------- Per-step regenerate helpers (used by /api/designs/[slug]) ----------

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
    yield { type: 'error', step: 'manifest', message: `No manifest for ${slug}` };
    return;
  }

  const usage = await readUsage();
  if (usage.fluxCalls + 1 > env.fluxDailyCap) {
    yield { type: 'error', step: 'budget', message: `Daily FLUX cap reached.` };
    return;
  }

  // Reload the original idea-shaped fields from the manifest. We only have a partial
  // copy in the manifest (no light/dark prompts), so regeneration uses a synthetic
  // prompt built from the title + concept + colorway hint.
  yield { type: 'flux.start', variant };
  const palette =
    variant === 'light'
      ? 'dark inks (black, deep navy, maroon, forest green) on a transparent background, high contrast for white/cream/heather shirts'
      : 'bright saturated fills (hot pink, neon yellow, electric blue, mint teal, lime green, magenta) on a transparent background — NEVER cream/off-white inside the design — for black/navy/asphalt shirts';
  const prompt = `${manifest.concept}\n\nTitle: ${manifest.title}\n\nPalette: ${palette}\n\nVector style, premium humorous t-shirt graphic, isolated artwork only.`;

  try {
    const result = await generateFluxBuffer(prompt, { transparent: true });
    await bumpFluxCalls(1);
    const transparent = await ensureTransparentPng(result.buffer);
    const filename = `${slug}-${variant}.png`;
    await writeDesignFile(slug, filename, transparent);
    manifest.files[variant] = filename;
    await writeManifest(manifest);
    yield { type: 'flux.done', variant, file: filename };
    yield { type: 'manifest.write', slug };
    yield { type: 'done', slug };
  } catch (err) {
    yield { type: 'error', step: `flux.${variant}`, message: stringifyError(err) };
  }
}

export async function* regenerateMockups(slug: string): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.printify) {
    yield { type: 'error', step: 'env', message: 'Printify not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for ${slug}` };
    return;
  }

  manifest.mockups = [];
  manifest.printify_mockups = [];

  for (const variant of ['light', 'dark'] as const) {
    const filename = manifest.files[variant];
    const imageId = manifest.printify_image_ids[variant];
    if (!filename) continue;

    let id = imageId;
    if (!id) {
      yield { type: 'printify.upload.start', variant };
      try {
        const buffer = await readDesignBuffer(slug, filename);
        const upload = await uploadImageBase64(filename, buffer);
        id = upload.id;
        manifest.printify_image_ids[variant] = id;
        yield { type: 'printify.upload.done', variant, imageId: id };
      } catch (err) {
        yield { type: 'error', step: `printify.upload.${variant}`, message: stringifyError(err) };
        continue;
      }
    }

    yield { type: 'printify.mockups.start', variant };
    try {
      const set = await generateMockups({
        uploadedImageId: id!,
        variant,
        title: manifest.title,
        description: manifest.concept,
      });
      manifest.printify_mockups.push(set);
      const buffers = await downloadMockupImages(set, DEFAULT_MOCKUPS_PER_VARIANT);
      for (const buffer of buffers) {
        const mockupFilename = `${slug}-mockup-${manifest.mockups.length + 1}.png`;
        await writeDesignFile(slug, mockupFilename, buffer);
        manifest.mockups.push(mockupFilename);
      }
      yield { type: 'printify.mockups.done', variant, count: buffers.length };
    } catch (err) {
      yield { type: 'error', step: `printify.mockups.${variant}`, message: stringifyError(err) };
    }
  }

  await writeManifest(manifest);
  yield { type: 'manifest.write', slug };
  yield { type: 'done', slug };
}

export async function* uploadToPrintify(slug: string): AsyncGenerator<PipelineEvent> {
  const env = envStatus();
  if (!env.printify) {
    yield { type: 'error', step: 'env', message: 'Printify not configured' };
    return;
  }
  const manifest = await readManifest(slug);
  if (!manifest) {
    yield { type: 'error', step: 'manifest', message: `No manifest for ${slug}` };
    return;
  }
  for (const variant of ['light', 'dark'] as const) {
    const filename = manifest.files[variant];
    if (!filename) continue;
    yield { type: 'printify.upload.start', variant };
    try {
      const buffer = await readDesignBuffer(slug, filename);
      const upload = await uploadImageBase64(filename, buffer);
      manifest.printify_image_ids[variant] = upload.id;
      yield { type: 'printify.upload.done', variant, imageId: upload.id };
    } catch (err) {
      yield { type: 'error', step: `printify.upload.${variant}`, message: stringifyError(err) };
    }
  }
  await writeManifest(manifest);
  yield { type: 'manifest.write', slug };
  yield { type: 'done', slug };
}

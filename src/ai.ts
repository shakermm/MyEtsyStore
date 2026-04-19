import OpenAI from 'openai';
import { z } from 'zod';
import { ProductIdeaSchema, type ProductIdea, type GenerationOptions } from './types';
import {
  createAzureOpenAiResponsesClient,
  createIdeaChatClient,
  extractResponsesOutputText,
} from './llm';
import { sanitizeEtsyTitle } from './utils';
export { sanitizeEtsyTitle };

export class BanterAI {
  private systemPrompt: string;
  private readonly chat: OpenAI;
  private readonly chatModel: string;
  private readonly chatProvider: 'azure' | 'openai';

  constructor() {
    const { client, model, provider } = createIdeaChatClient();
    this.chat = client;
    this.chatModel = model;
    this.chatProvider = provider;
    this.systemPrompt = `You are the creative director for BanterWearCo, an Etsy Print-on-Demand store specializing in hilarious, sarcastic, and relatable apparel.

OUTPUT IS PRODUCTION-CRITICAL — every field is consumed by an automated pipeline (LLM -> FLUX.2-pro (single image) -> Printify upload -> mockup generation -> Etsy listing).

Brand Voice:
- Witty, irreverent, self-deprecating; relatable ADULT humor (millennial / Gen-X / parent / professional / gamer)
- Target audience: ADULTS 25-55. Themes: work burnout, marriage, parenting chaos, mortgages, midlife, dating, drinking (coffee/wine/beer), introvert life, bad sleep, social anxiety, overthinking, home ownership, anti-corporate sarcasm.
- Bestseller examples: "Nobody needs this much baby oil", "Therapy is cheaper than wine", "Dada Daddy Dad Bruh", "Fueled by spite and iced coffee"
- Clean bold typography + minimalist illustration. Strong central concept per design.

SUBJECT DIVERSITY RULES (very important — avoid one-trick designs):
- DO NOT default to cute animal mascots. Cats / dogs / generic mascot characters should appear in AT MOST 1 in 10 designs. The store is currently over-saturated with cat designs — actively avoid them.
- VARY the visual subject across designs. Rotate between: bold typography-only, hands holding objects (coffee mug, wine glass, phone, beer can, controller, baby bottle), everyday objects as hero (alarm clock, calendar, laptop, vacuum, minivan), abstract icons (brain, heart, lightning, eyes), retro/vintage badges, faux-vintage seals, person silhouettes from the chest-up (no garments visible), surreal mash-ups (pizza-shaped halo, coffee IV drip).
- When in doubt, choose TYPOGRAPHY-FIRST: a bold sarcastic phrase as the hero with one or two small supporting icons.
- The visual must MATCH the joke. A burnout joke ≠ cat. A wine-mom joke ≠ cat. Pick the literal object/scene the line implies.

SINGLE IMAGE PROMPT (CRITICAL — describes the ARTWORK ITSELF, NOT a product):
- imagePrompt: one FLUX.2-pro prompt describing the standalone flat-vector illustration / typography composition.
- **NEVER mention "t-shirt", "shirt", "hoodie", "mug", "tote", "mockup", "garment", "apparel" or any product word inside imagePrompt.** FLUX will draw whatever you describe — if you say "t-shirt graphic" it will render a t-shirt. Describe ONLY the illustration subject. Example for typography-led: 'Bold chunky stacked typography reading RUNNING ON CAFFEINE AND POOR DECISIONS in 3 lines, navy outline, coral and mustard fills, tiny coffee bean accents around the letters, transparent background.' Example for object-led: 'A vintage enamel coffee mug tipped slightly, steam rising in cursive that spells EMOTIONAL SUPPORT, dark navy outline, sage and burnt-orange fills, transparent background.'
- **NEVER use the words "sticker", "die-cut", "decal", "label", "patch", or "badge"** — these cause FLUX to add a thick white outline halo around the entire design, which ruins the print. Use "flat vector illustration" or "transparent print-ready artwork" instead.
- The output must be a standalone PRINT-READY VECTOR ILLUSTRATION on a fully transparent background. The garment will be added later by the print-on-demand system. The outermost pixel of the artwork must be the artwork's own dark stroke — NO outer white halo, ring, glow, or sticker border around the whole design.
- DUAL-MODE PALETTE (so it reads on both light and dark garments): dark outline (deep navy / near-black / charcoal, ~2-3px stroke) around every filled shape + MID-TONE fills (teal, coral, dusty pink, mustard, sage, lavender, burnt orange) + small BRIGHT ACCENTS (hot pink, neon yellow, electric blue, lime, magenta).
- FORBIDDEN fills: pure white (#ffffff) without a dark outline. Pure black (#000000) without a light/bright outline. No cream / off-white / pastel solid fills.
- Specify: transparent background, crisp bold linework, no photorealism, NO garment, NO mockup, NO model, NO hanger, NO fabric, NO frame, NO scene, NO sticker outline.
- FLUX SAFETY: PG-rated only. No weapons, combat, blood, realistic armor, aggressive poses. For fantasy figures use soft mascot / plush / costume style.

DESCRIPTION RULES:
- 200-350 word creative section ONLY. Hook (1-2 lines) + emotional angle + "Perfect for:" bullets + DETAILS bullets (fit, available in a full range of light and dark colors, what is on the shirt, made-to-order).
- DO NOT include product features, care instructions, or sign-off — those are appended programmatically from data/listing-standard.json.

TAGS & KEYWORDS:
- tags: EXACTLY 13 (Etsy hard limit). Long-tail, lowercase, no special chars.
- keywords: 10-15 distinct SEO phrases (different angle than tags — search intent style).

CATEGORY & PRODUCT TYPE:
- Choose from: tshirt, hoodie, sweatshirt, mug, poster, shower-curtain, phone-case, tote-bag, pillow, other
- Design should be appropriate for the product type (scale, layout, positioning)
- Consider how the design will look on the actual product surface

RECOMMENDED PRODUCT COLORS:
- light: 4-6 light colors that work with the dark-ink design and product type
- dark: 4-6 dark colors that work with the bright-fill design and product type
- Use appropriate color names for the product category (e.g., "ceramic white" for mugs, "canvas white" for totes)

Return ONE valid JSON object. No markdown fences. No commentary.`;
  }

  async generateIdea(options: GenerationOptions = {}): Promise<ProductIdea> {
    const { theme = '', style = 'random' } = options;

    const userPrompt = `Generate ONE product idea for BanterWearCo.

${theme ? `Theme focus: ${theme}` : 'Pick any funny / trending / absurd everyday situation.'}

Style preference: ${style}

Return ONLY this JSON shape — every field required unless marked optional:

{
  "concept": "short catchy slogan or core idea",
  "title": "Etsy title under 140 chars, packed with searchable phrases",
  "description": "200-350 word creative section: hook + Perfect for bullets + DETAILS bullets. NO product features / care / footer.",
  "tags": ["exactly", "thirteen", "tags", "lowercase"],
  "keywords": ["10 to 15 long-tail SEO keywords"],
  "imagePrompt": "Describe ONLY the illustration subject (characters, objects, typography). NEVER use the words shirt/tshirt/hoodie/mug/tote/mockup/garment OR sticker/die-cut/decal/label. Flat vector illustration style. Dual-mode palette: dark outline + mid-tone fills + bright accents. Transparent background — NO outer white halo / sticker border around the whole design. No photorealism.",
  "printReadyPrompt": "POD print specs: typography, stroke weights, palette",
  "category": "tshirt|hoodie|sweatshirt|mug|poster|shower-curtain|phone-case|tote-bag|pillow|other",
  "humorStyle": "e.g. sarcastic dad joke, relatable burnout",
  "trendingAngle": "optional meme/trend tie-in",
  "colorStrategy": "How the design pops on both light and dark variants for this product type",
  "recommendedProductColors": {
    "light": ["White", "Natural", "Heather Dust", "Ash"],
    "dark": ["Black", "Navy", "Asphalt", "Forest"]
  },
  "printifyBlueprintId": 12345, // Optional specific blueprint ID
  "targetPrice": 2499 // Optional target price in cents
}`;

    try {
      const lowerModel = this.chatModel.toLowerCase();
      const azureGpt5 = this.chatProvider === 'azure' && lowerModel.includes('gpt-5');
      const requestModel =
        process.env.AZURE_OPENAI_CHAT_MODEL?.trim() || this.chatModel;
      const maxAzureGpt5Tokens = Number(
        process.env.AZURE_OPENAI_MAX_COMPLETION_TOKENS?.trim() || '16384'
      );

      let content: string;

      if (azureGpt5) {
        const ep = process.env.AZURE_OPENAI_ENDPOINT?.trim();
        const key = process.env.AZURE_OPENAI_API_KEY?.trim();
        const dep = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
        if (!ep || !key || !dep) {
          throw new Error('Azure OpenAI endpoint, API key, and deployment are required.');
        }

        const preferChat = process.env.AZURE_OPENAI_GPT5_USE_CHAT === '1';
        const noResponses = process.env.AZURE_OPENAI_DISABLE_RESPONSES_FALLBACK === '1';
        if (!preferChat && noResponses) {
          throw new Error(
            'Azure GPT-5 uses Responses by default. Remove AZURE_OPENAI_DISABLE_RESPONSES_FALLBACK, or set AZURE_OPENAI_GPT5_USE_CHAT=1 for chat.completions.'
          );
        }

        const runResponses = async () => {
          const rClient = createAzureOpenAiResponsesClient(ep, key, dep);
          const response = await rClient.responses.create({
            model: requestModel,
            instructions: this.systemPrompt,
            input: userPrompt,
            max_output_tokens: Math.min(maxAzureGpt5Tokens, 8192),
          });
          return extractResponsesOutputText(response);
        };

        if (!preferChat) {
          content = await runResponses();
        } else {
          try {
            const completion = await this.chat.chat.completions.create({
              model: requestModel,
              messages: [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_completion_tokens: maxAzureGpt5Tokens,
            });
            content = completion.choices[0].message.content ?? '';
          } catch (err: unknown) {
            const status = (err as { status?: number })?.status;
            if (noResponses || status !== 400) throw err;
            content = await runResponses();
          }
        }
      } else {
        const completion = await this.chat.chat.completions.create({
          model: this.chatModel,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.9,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        });
        content = completion.choices[0].message.content ?? '';
      }

      if (!content) throw new Error('No content received from AI');

      content = content.trim();
      const fence = content.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
      if (fence) content = fence[1].trim();

      const parsed = JSON.parse(content);
      const idea = ProductIdeaSchema.parse(parsed);
      idea.title = sanitizeEtsyTitle(idea.title);
      return idea;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Schema validation failed:', error.issues);
      }
      throw error;
    }
  }
}

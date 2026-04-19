import OpenAI from 'openai';
import { z } from 'zod';
import { ProductIdeaSchema, type ProductIdea, type GenerationOptions } from './types';
import {
  createAzureOpenAiResponsesClient,
  createIdeaChatClient,
  extractResponsesOutputText,
} from './llm';

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
- Witty, irreverent, self-deprecating; relatable millennial / parent / gamer humor
- Bestseller examples: "Nobody needs this much baby oil", "Therapy is cheaper than wine", "Dada Daddy Dad Bruh", "Fueled by spite and iced coffee"
- Clean bold typography + minimalist illustration. Strong central concept per design.

SINGLE IMAGE PROMPT (CRITICAL — ONE universal design, used on BOTH light and dark garments):
- imagePrompt: one FLUX.2-pro prompt. The art must read clearly on WHITE, CREAM, HEATHER shirts AND on BLACK, NAVY, ASPHALT shirts without regeneration.
- Use a DUAL-MODE PALETTE: dark outline (deep navy / near-black / charcoal, ~2-3px stroke) around every filled shape + MID-TONE fills (teal, coral, dusty pink, mustard, sage, lavender, burnt orange) + small BRIGHT ACCENTS (hot pink, neon yellow, electric blue, lime, magenta).
- FORBIDDEN: pure white (#ffffff) fills without a dark outline (invisible on light shirts). Pure black (#000000) fills without a light/bright outline (invisible on dark shirts). No cream / off-white / pastel solid fills.
- Specify: transparent background, print-ready vector style, crisp bold linework, no photorealism, no product mockup in the image (just the artwork itself).
- Consider product type: mugs need center-focused compact designs, posters can be larger, phone cases need compact layouts, apparel needs appropriate chest-placement sizing.
- FLUX SAFETY: PG-rated only. No weapons, combat, blood, realistic armor, aggressive poses. For fantasy figures use soft mascot / plush / costume style — never swords, never battle poses.

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
  "imagePrompt": "ONE FLUX prompt for a universal design. Dual-mode palette: dark outline + mid-tone fills + bright accents. Must read on BOTH white/cream/heather AND black/navy/asphalt garments. Transparent background, vector style, no photorealism, no shirt mockup.",
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
      return ProductIdeaSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Schema validation failed:', error.issues);
      }
      throw error;
    }
  }
}

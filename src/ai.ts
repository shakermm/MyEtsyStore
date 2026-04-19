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
- Target audience: ADULTS 25-55. Clean bold typography + minimalist illustration. Strong central concept per design.

THEME ROTATION (CRITICAL — actively diversify, do NOT keep producing the same persona):
Every design must pick from a DIFFERENT theme bucket than recent designs. The 20 buckets are:
  1.  Marriage / spouse jokes (husband/wife dynamics, in-laws, anniversaries)
  2.  Parenting toddlers (tantrums, snacks, bedtime, mom/dad survival)
  3.  Parenting teens (eye-rolls, attitude, taxi service, embarrassing dad)
  4.  Dating / single life (apps, ghosting, situationships, red flags)
  5.  Pet owners (dog parents, dog walkers — NOT generic cat mascots)
  6.  Drinking culture (beer, wine, whiskey, brewery, happy hour, hangover)
  7.  Coffee culture (barista, espresso, cold brew — but NOT "fueled by coffee" cliché)
  8.  Fitness / gym (lifting, running, yoga, gym bros, post-workout)
  9.  Anti-fitness (couch life, gravity wins, cardio jokes, snacks)
  10. Food / cooking (BBQ, taco, pizza, foodie, brunch, hot sauce, vegan jokes)
  11. Cars / motorcycles (truck life, jeep, EV, mechanic, road rage)
  12. Outdoors (camping, fishing, hiking, hunting, beach, lake life)
  13. Sports fandom (golf, fishing, hockey, fantasy football — generic, no team logos)
  14. Hobbies (knitting, crochet, gardening, woodworking, gaming, reading)
  15. Trades / professions (nurse, teacher, electrician, trucker, firefighter, mechanic)
  16. Anti-corporate / office life (meetings — but rotate, not the default)
  17. Holidays / seasons (Christmas, Halloween, summer, fall, 4th of July)
  18. Travel / vacation (road trip, RV, airline, beach vacation, snowbird)
  19. Midlife / aging (back pain, gray hair, "in my era", grandparent humor)
  20. Pop-culture parody (movies, music, retro 80s/90s tropes — generic, no IP)

OVERSATURATED THEMES — produce these AT MOST 1 in 15 designs (the store already has too many):
- Overthinking / brain has too many tabs / mental load
- Introvert / social battery / staying home
- Burnout / pointless meetings / corporate fatigue
- Therapy is cheaper than X
- Wine moms / "fueled by spite and coffee"
- Generic cat mascots
If your concept fits any of the above, RESTART and pick a different bucket.

Bestseller examples (for VOICE, not theme — do NOT copy these themes):
"Nobody needs this much baby oil", "Dada Daddy Dad Bruh", "Hide your zucchini" (gardener), "I brake for yard sales", "Pawpaw the legend the myth the lawn-mower", "BBQ dad on duty", "Sleep is for the weak (signed: a baby)"

SUBJECT DIVERSITY RULES (visual, not thematic):
- DO NOT default to cute animal mascots. Cats / dogs / generic mascot characters appear AT MOST 1 in 10 designs.
- VARY the visual: bold typography-only, hands holding objects, everyday objects as hero (alarm clock, fishing rod, BBQ tongs, golf club, knitting needles, hammer, beer can, taco), abstract icons, retro/vintage badges, person silhouettes chest-up.
- When in doubt, choose TYPOGRAPHY-FIRST.
- The visual must MATCH the joke. A BBQ joke ≠ cat. A fishing joke ≠ coffee mug.

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
    const { theme = '', style = 'random', avoid = [] } = options;

    // Show only the most recent 40 to keep token usage bounded.
    const avoidList = avoid.slice(0, 40);
    const avoidBlock = avoidList.length
      ? `\n\nDO NOT REPEAT — these concepts already exist in the store. Your idea must be in a different theme bucket and use a different hook than ALL of these:\n${avoidList.map((c) => `- ${c}`).join('\n')}\n`
      : '';

    const userPrompt = `Generate ONE product idea for BanterWearCo.

${theme ? `Theme focus: ${theme}` : 'Pick a theme bucket from the rotation that is UNDER-represented in the existing list below. Avoid burnout/overthinking/introvert/therapy/wine-mom/cat themes — those are oversaturated.'}

Style preference: ${style}${avoidBlock}

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

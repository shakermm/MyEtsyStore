import OpenAI from 'openai';
import { z } from 'zod';
import { ProductIdeaSchema, type ProductIdea, type GenerationOptions } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export class BanterAI {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = `You are the creative director for BanterWearCo, an Etsy Print-on-Demand store specializing in hilarious, sarcastic, and relatable apparel and home goods.

IMAGE QUALITY IS THE HIGHEST PRIORITY. Every design must be:
- Top-tier, unique, and professionally executed
- HIGH CONTRAST and visible on BOTH black AND white garments
- Print-ready with clean lines, appropriate stroke weights, and strategic color choices
- Suitable for both light and dark clothing (use outlines, strategic negative space, or dual-color variants)

Brand Voice:
- Witty, irreverent, and self-deprecating humor
- References to "the struggle is real", parenting fails, adulting, pop culture, dinosaurs, bathroom humor, absurd situations
- Examples from store: "Nobody needs this much baby oil", "Psycho Bakery", "This is where I slipped and ruined everything", dinosaur shower curtains
- Clean, bold graphic designs with strong text + clever minimalist illustrations
- Target audience: millennials, parents, gamers, people who love dark humor and memes

IMAGE PROMPT REQUIREMENTS (CRITICAL):
- Must specify "works on both black and white shirts", "high contrast design", "print ready vector style"
- Include specific typography (bold sans-serif, impact font, good stroke/outline for readability)
- Recommend color palettes that pop on both light AND dark backgrounds
- Specify transparent background option with subtle shadow or outline for versatility
- Professional composition with strong focal point, excellent negative space, and balanced layout
- Style references: "clean vector illustration, premium POD design, high quality graphic tee aesthetic, sharp lines, professional print design"

Guidelines for ideas:
- Always funny, trending or timelessly relatable
- One strong central concept per design with punchy text
- Visuals must be clever but simple enough for high-quality screen printing/DTG
- Incorporate current memes, holidays, viral trends when relevant
- Avoid anything offensive - focus on self-roasting and absurdism

Generate ideas that would perform well on Etsy in the "funny t-shirts", "sarcastic shirts", "humor apparel" categories. Image quality must be exceptional.`;
  }

  async generateIdea(options: GenerationOptions = {}): Promise<ProductIdea> {
    const { theme = '', style = 'all' } = options;

    const userPrompt = `Generate ONE highly creative product idea for BanterWearCo.

${theme ? `Theme focus: ${theme}` : 'Focus on funny, trending, or absurd everyday situations.'}

Style preference: ${style}

CRITICAL: Image quality is the TOP priority. The design must be unique, top-tier, and work excellently on BOTH light and dark clothing. Use high contrast, smart color choices, outlines where needed, and professional composition.

Return ONLY a valid JSON object matching this schema exactly. Do not include any other text, markdown, or explanations:

{
  "concept": "short catchy slogan or idea",
  "title": "Etsy title under 140 chars",
  "description": "Full rich description (300-500 words recommended for SEO)",
  "tags": ["tag1", "tag2", "... up to 20 high quality tags"],
  "imagePrompt": "EXTREMELY detailed prompt for DALL-E 3 or Flux. Must include: high contrast, works on black and white shirts, print-ready vector style, specific typography with stroke/outline, professional composition, color palette that pops on both backgrounds, transparent background option",
  "printReadyPrompt": "Specialized prompt optimized for POD - includes exact typography specs, color palette recommendations for dual-shirt compatibility, print quality requirements, and production notes",
  "category": "tshirt|hoodie|shower-curtain|etc",
  "humorStyle": "e.g. sarcastic dad joke with dinosaur twist",
  "trendingAngle": "optional current meme reference",
  "colorStrategy": "Detailed explanation of how this design maintains visibility and impact on both light and dark garments"
}

The image prompts must be world-class. Think like a senior graphic designer who specializes in premium humorous POD apparel. Every design should feel like it could be a bestseller.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error('No content received from AI');
      }

      const parsed = JSON.parse(content);
      const idea = ProductIdeaSchema.parse(parsed);

      return idea;
    } catch (error) {
      console.error('AI Generation Error:', error);
      if (error instanceof z.ZodError) {
        console.error('Schema validation failed:', error.issues);
      }
      throw error;
    }
  }

  async generateMultiple(count: number = 3, options: GenerationOptions = {}): Promise<ProductIdea[]> {
    const ideas: ProductIdea[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const idea = await this.generateIdea(options);
        ideas.push(idea);
        // Small delay to avoid rate limits
        if (i < count - 1) await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.warn(`Failed to generate idea ${i + 1}, skipping...`);
      }
    }
    return ideas;
  }

  /**
   * Generate actual images using DALL-E 3 for top quality results
   */
  async generateImage(imagePrompt: string, concept: string, index: number = 0): Promise<string | null> {
    try {
      console.log(`🎨 Generating high-quality image for: ${concept}`);

      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: `${imagePrompt}\n\nStyle requirements: professional humorous t-shirt design, premium POD quality, clean vector aesthetic, highly detailed, commercial quality, trending on Etsy.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        console.warn('No image URL returned from DALL-E 3');
        return null;
      }

      console.log(`✅ Image generated successfully for idea #${index + 1}`);
      return imageUrl;
    } catch (error) {
      console.error('Image generation failed:', error);
      return null;
    }
  }

  async generateIdeasWithImages(count: number = 3, options: GenerationOptions = {}): Promise<Array<ProductIdea & { imageUrl?: string }>> {
    const ideas = await this.generateMultiple(count, options);
    const results: Array<ProductIdea & { imageUrl?: string }> = [];

    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const imageUrl = await this.generateImage(idea.imagePrompt, idea.concept, i);
      results.push({
        ...idea,
        imageUrl: imageUrl || undefined,
      });
      // Longer delay between image generations (DALL-E 3 is slower/expensive)
      if (i < ideas.length - 1) await new Promise(r => setTimeout(r, 15000));
    }

    return results;
  }
}

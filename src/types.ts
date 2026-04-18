import { z } from 'zod';

export const ProductIdeaSchema = z.object({
  concept: z.string().describe('The core funny/trending/unique idea or slogan for the print'),
  title: z.string().describe('Optimized Etsy product title (max 140 chars)'),
  description: z.string().describe('Rich, SEO-optimized Etsy description with humor and calls to action'),
  tags: z.array(z.string()).max(20).describe('15-20 targeted Etsy tags including long-tail keywords'),
  imagePrompt: z.string().describe('EXTREMELY detailed, production-quality prompt optimized for DALL-E 3, Flux, or Midjourney. Must be high contrast, work on BOTH light and dark clothing, include print-ready specifications, transparent background option, and strong visual hierarchy'),
  printReadyPrompt: z.string().describe('Specialized prompt optimized specifically for POD printing - includes exact typography specs, color palette that works on black AND white shirts, outline/border recommendations, and print quality requirements'),
  category: z.enum(['tshirt', 'hoodie', 'sweatshirt', 'shower-curtain', 'poster', 'mug', 'other']).describe('Recommended Printify product category'),
  humorStyle: z.string().describe('Description of the humor style used (e.g. "sarcastic dad joke", "relatable millennial struggle", "absurd dinosaur pun")'),
  trendingAngle: z.string().optional().describe('Current trending reference or meme tie-in if applicable'),
  colorStrategy: z.string().describe('Specific guidance on color palette and how the design maintains visibility and impact on both light and dark garments'),
});

export type ProductIdea = z.infer<typeof ProductIdeaSchema>;

export interface GenerationOptions {
  theme?: string;
  count?: number;
  style?: 'funny' | 'trending' | 'unique' | 'all';
  includeImagePrompts?: boolean;
}

import { z } from 'zod';

export const ProductIdeaSchema = z.object({
  concept: z.string().describe('Core funny/trending idea or slogan for the print'),
  title: z.string().describe('Etsy-optimized title (max 140 chars)'),
  description: z.string().describe('Creative/marketing copy (hook + Perfect for + DETAILS bullets). Care/features/footer are appended programmatically.'),
  tags: z.array(z.string()).min(13).max(13).describe('Exactly 13 Etsy tags (Etsy max)'),
  keywords: z.array(z.string()).min(10).max(15).describe('10-15 Etsy SEO keywords (long-tail, distinct from tags)'),
  lightImagePrompt: z.string().describe('Prompt for the design printed on LIGHT shirts. Dark inks (black, navy, deep maroon, forest), high contrast on white/cream/heather. Transparent background.'),
  darkImagePrompt: z.string().describe('Prompt for the design printed on DARK shirts. Bright saturated fills (hot pink, neon yellow, electric blue, mint teal, lime green, magenta) — NEVER cream/off-white inside the design. Transparent background.'),
  imagePrompt: z.string().describe('Master concept prompt (fallback / shared style notes)'),
  printReadyPrompt: z.string().describe('POD print specs: typography, stroke weights, max-2-color recommendations'),
  category: z.enum(['tshirt', 'hoodie', 'sweatshirt', 'shower-curtain', 'poster', 'mug', 'other']),
  humorStyle: z.string(),
  trendingAngle: z.string().optional(),
  colorStrategy: z.string(),
  recommendedShirtColors: z.object({
    light: z.array(z.string()).min(3).max(8),
    dark: z.array(z.string()).min(3).max(8),
  }),
});

export type ProductIdea = z.infer<typeof ProductIdeaSchema>;

export interface GenerationOptions {
  theme?: string;
  count?: number;
  style?: 'funny' | 'trending' | 'unique' | 'random';
}

export interface PrintifyMockupImage {
  src: string;
  position: string;
  is_default: boolean;
  variant_ids: number[];
}

export interface PrintifyMockupSet {
  variant: 'light' | 'dark';
  blueprint_id: number;
  print_provider_id: number;
  product_id: string;
  images: PrintifyMockupImage[];
}

export interface QaReview {
  approved: boolean;
  score: number;
  notes?: string;
}

export interface DesignManifest {
  slug: string;
  concept: string;
  title: string;
  description: string;
  product_features: string[];
  care_instructions: string[];
  listing_footer: string;
  tags: string[];
  keywords: string[];
  recommended_shirt_colors: {
    light_variant: string[];
    dark_variant: string[];
  };
  files: {
    light: string;
    dark: string;
  };
  mockups: string[];
  printify_image_ids: {
    light?: string;
    dark?: string;
  };
  printify_mockups: PrintifyMockupSet[];
  qa_reviews?: Record<string, QaReview>;
  created_at: string;
}

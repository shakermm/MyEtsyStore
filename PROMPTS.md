# BanterWearCo Prompt Library

Human-readable reference for the prompts that drive the idea generator. **Source of truth:** the `systemPrompt` string and the `userPrompt` template in `src/ai.ts`. When you change those, update this file.

## System prompt (production pipeline)

The chat model is told it is the creative director for BanterWearCo (Etsy POD). Output is **production-critical**: fields feed **LLM → FLUX.2-pro ×2 → Printify → mockups → `manifest.json`**.

Summarized rules (full wording lives in code):

- **Brand voice:** witty, irreverent, relatable millennial/parent/gamer humor; bold type + minimalist illustration; one strong concept per design. Reference bestseller-style examples in `src/ai.ts`.
- **Two image prompts (required):**
  - `lightImagePrompt`: art for **light** shirts — **dark** inks (black, navy, maroon, forest), high contrast, crisp linework.
  - `darkImagePrompt`: art for **dark** shirts — **bright saturated** fills (hot pink, neon yellow, electric blue, mint teal, lime, magenta); never cream/off-white/pastel fills inside the art on dark fabric.
  - Both: transparent background, print-ready vector style, no photorealism, **no shirt mockup** (artwork only).
  - **FLUX safety:** PG only; no weapons, combat, blood, realistic armor, aggressive poses; fantasy = soft mascot/costume style, not battle scenes.
- **Description:** 200–350 word creative section only — hook, emotional angle, “Perfect for:” bullets, DETAILS bullets (fit, two print variants, what’s on the shirt, made-to-order). **No** product features, care, or sign-off (appended from `data/listing-standard.json`).
- **tags:** exactly **13**, long-tail, lowercase, no special characters.
- **keywords:** **10–15** distinct SEO phrases (search intent; not a duplicate of tags).
- **recommendedShirtColors:** `light` and `dark` arrays (3–8 Bella Canvas–style color names each) matching the two art directions.
- **Return:** one JSON object, no markdown fences, no commentary.

## User prompt template

The user message asks for **one** idea, optional `theme`, and `style` (`funny` | `trending` | `unique` | `random`). It lists the exact JSON shape expected, including:

- `concept`, `title`, `description`, `tags`, `keywords`
- `lightImagePrompt`, `darkImagePrompt`, `imagePrompt`, `printReadyPrompt`
- `category`, `humorStyle`, `trendingAngle` (optional), `colorStrategy`
- `recommendedShirtColors: { light: [...], dark: [...] }`

See `src/ai.ts` for the full template string.

## Image prompts vs older “single prompt” docs

Older guidance said one prompt must work on both black and white shirts. The **current** pipeline uses **two** dedicated prompts (`lightImagePrompt` / `darkImagePrompt`) plus `imagePrompt` as shared/fallback notes. Optimize each variant for its substrate.

## Tags and keywords

- **Tags:** exactly 13 — mix core (`funny tshirt`), theme-specific, long-tail, and audience/occasion terms; Etsy hard limit.
- **Keywords:** 10–15 phrases framed as search queries or intent, not a repeat of the tag list.

## Zod validation

Parsed output must satisfy `ProductIdeaSchema` in `src/types.ts`. Mismatched array lengths or missing fields cause validation errors and a failed run.

## Example outputs

Browse `designs/*/manifest.json` after a successful generation for real titles, tags, and prompts.

# BanterWearCo Idea Generator

AI-powered command line tool for generating **funny, trending, and unique** Print-on-Demand product ideas for the [BanterWearCo Etsy store](https://www.etsy.com/shop/BanterWearCo).

This tool creates complete product kits with **exceptional focus on image quality**:
- Witty, unique slogans and concepts that match your existing BanterWearCo voice
- SEO-optimized Etsy titles and descriptions
- Targeted keyword tags (15-20 high quality)
- **Top-tier image prompts** specifically engineered to work on both light AND dark clothing
- `printReadyPrompt` and `colorStrategy` fields for production
- Optional **DALL-E 3 image generation** for actual high-quality images

## Features

- **Brand-aligned humor**: Sarcastic, self-deprecating, relatable "struggle is real", dinosaur, bathroom, parenting, and pop culture humor
- **`banter generate`** - One command to generate multiple complete product ideas
- Structured JSON output for easy integration with Printify or design tools
- Beautiful terminal UI with formatted examples
- Extensible for future Printify API automation

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Setup API key**
   ```bash
   cp .env.example .env
   ```
   Add your OpenAI API key to `.env`

3. **Generate ideas**
   ```bash
   npm run generate
   ```

   Or directly:
   ```bash
   npx ts-node --esm src/cli.ts generate
   ```

## Usage Examples

### Basic generation
```bash
npm run generate -- --count 5
```

### Themed generation with image focus
```bash
# Dinosaur themed (with image prompts optimized for light/dark clothing)
npm run generate -- --theme "dinosaur" --count 3

# Generate actual DALL-E 3 images (recommended for top quality)
npm run generate -- --theme "parenting fail" --images

# Trending memes with maximum image quality
npm run generate -- --style "trending" --images --count 2
```

### JSON output (for scripting)
```bash
npm run generate -- --json > ideas.json
```

### Output to specific folder
```bash
npm run generate -- --output ./new-ideas --count 10
```

## Project Structure

```
.
├── src/
│   ├── cli.ts          # Main CLI interface
│   ├── ai.ts           # AI service with BanterWearCo system prompt
│   ├── types.ts        # Zod schemas for structured output
├── DESIGN.md           # Architecture and design decisions
├── PROMPTS.md          # All system and user prompts
├── AGENTS.md           # Instructions for using as AI coding agent
├── .cursor/rules/      # Persistent brand voice rules
├── ideas/              # Generated JSON output (auto-created)
├── images/             # **Generated DALL-E 3 images saved here** (when using --images)
├── generated-images/   # Alternative image storage folder
├── .env.example
└── package.json
```

## Printify Workflow (Image-First - Images Saved Locally)

1. Run `banter generate --images` → **Images are automatically downloaded and saved to the `./images/` folder**
2. Review the generated PNG files + the `printReadyPrompt` and `colorStrategy` fields
3. Test the actual saved images on **both light and dark mockups** in Printify
4. Use the **title**, **description**, and **tags** directly in your Etsy/Printify listing
5. The `imagePrompt` field can be used with Flux/Midjourney for variations if needed
6. Publish and watch the sales roll in!

**All images are saved with clean numbered filenames** (e.g. `01-dinosaur-struggle-is-real.png`) in the `images/` folder in this repository.

**Pro tip**: The new `colorStrategy` field tells you exactly how the design maintains visibility on both black and white garments.

## Development

```bash
npm run dev          # Run with live reload
npm run build        # Build to dist/
npm run generate     # Quick generate
```

## Brand Voice Examples

From the store:
- "Nobody Needs This Much Baby Oil Shower Curtain"
- "Psycho Bakery" humor
- Dinosaur "The Struggle Is Real" shower curtains
- "This is where I slipped and ruined everything"

The AI is trained to continue this exact voice.

---

**Built for BanterWearCo - Making the internet laugh one shirt at a time.**

Made with ❤️ and too much sarcasm.

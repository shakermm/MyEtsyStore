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
├── src/                    # Optional CLI generator (OpenAI-based; not required for Cursor-native flow)
│   ├── cli.ts              # Command-line entry
│   ├── ai.ts               # AI service with BanterWearCo system prompt
│   └── types.ts            # Zod schemas for structured output
├── scripts/
│   ├── finalize-design.mjs # ONE-command pipeline: creates designs/<slug>/, copies PNGs, makes transparent, writes manifest
│   └── make-transparent.mjs# Converts white/near-white backgrounds to transparent (supports --inplace)
├── designs/                # One folder per concept (print files, mockups, manifest)
│   └── <concept-slug>/
│       ├── <concept-slug>-light.png
│       ├── <concept-slug>-dark.png
│       ├── <concept-slug>-mockup-1.png
│       ├── <concept-slug>-mockup-2.png
│       ├── <concept-slug>-mockup-3.png
│       └── manifest.json
├── .cursor/rules/          # Agent behavior (brand voice + generator rules)
├── .cursorrules            # Master rule file used by Cursor
├── DESIGN.md               # Architecture and design decisions
├── PROMPTS.md              # System and user prompts
├── AGENTS.md               # Instructions for using this as an AI coding agent
├── SKILL.md                # Cursor skill description
└── package.json
```

## Printify Workflow (Cursor-native, asset-first)

Every idea is produced as a self-contained listing package inside its own folder under `designs/<slug>/`:

1. Ask Cursor to generate an idea ("create a new design", "give me 3 ideas", etc.)
2. The agent generates the `-light` + `-dark` print files, runs `scripts/finalize-design.mjs` to save them into `designs/<slug>/` and make them transparent, then generates 1-3 lifestyle mockups of a person wearing the shirt into the same folder
3. Open `designs/<slug>/` → upload `<slug>-light.png` and `<slug>-dark.png` to Printify, assign each variant to the matching shirt colors listed in the package
4. Use the mockups from the same folder as Etsy listing photos
5. Paste the title, description, 13 tags, and keywords from the package (or from `manifest.json`) directly into the Etsy/Printify listing
6. Publish

**Why two variants?** The `-light` file uses darker pigments and black outlines so it reads on white shirts. The `-dark` file uses saturated mid-tone fills (hot pink / neon yellow / electric blue / mint / lime) with black outlines so it pops on black shirts without getting eaten by the transparency pass.

**Manual pipeline (rarely needed):**
```
# Make any existing white-background PNG transparent in place
node scripts/make-transparent.mjs designs/<slug>/<slug>-light.png --inplace

# Re-finalize a folder after generating new assets
node scripts/finalize-design.mjs <slug>
```

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

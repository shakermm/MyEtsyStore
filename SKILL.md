# BanterWearCo Idea Generator Skill

**Name:** BanterWearCo Product Idea Generator

**Description:**
A specialized Cursor skill that acts as the Creative Director for the BanterWearCo Etsy Print-on-Demand store. Every idea is delivered as a fully self-contained listing package — text + transparent print files + lifestyle mockups — inside its own folder under `designs/<slug>/`.

## How to use

Just say things like:
- "Generate 3 new ideas"
- "Create dinosaur themed shirts"
- "Give me a trending funny concept"
- "Surprise me with a profit-focused design"

The agent will respond with the mandatory 8-part package for every idea:
1. Profile
2. Etsy title
3. Print files (`-light` + `-dark` transparent PNGs inside `designs/<slug>/`)
4. 6 recommended Bella+Canvas 3001 shirt colors
5. 250-350 word SEO description
6. 13 Etsy tags
7. 10-15 SEO keywords
8. 1-3 lifestyle mockups with people wearing the shirt (same `designs/<slug>/` folder)

## Key features
- Every concept gets its own `designs/<slug>/` folder containing: `<slug>-light.png`, `<slug>-dark.png`, `<slug>-mockup-1/2/3.png`, and `manifest.json`
- Print files are automatically made transparent via `scripts/make-transparent.mjs`
- All filesystem work is handled by a single command: `node scripts/finalize-design.mjs <slug>`
- Uses any image-capable model available in Cursor for the actual artwork
- Rules live in `.cursorrules` and `.cursor/rules/banterwear-generator.md` (edit these to change behavior)

## Folder layout
```
designs/
└── <concept-slug>/
    ├── <concept-slug>-light.png       # transparent print file for light shirts
    ├── <concept-slug>-dark.png        # transparent print file for dark shirts
    ├── <concept-slug>-mockup-1.png    # lifestyle photo (person wearing it)
    ├── <concept-slug>-mockup-2.png
    ├── <concept-slug>-mockup-3.png
    └── manifest.json                   # title, description, tags, keywords, colors
```

No extra setup needed. Just talk to me naturally — I'm your dedicated BanterWearCo Creative Director.

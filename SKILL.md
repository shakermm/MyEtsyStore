# BanterWearCo Idea Generator Skill

**Name**: BanterWearCo Product Idea Generator

**Description**: 
A specialized AI agent/skill for rapidly generating high-quality, production-ready funny Print-on-Demand product ideas for the BanterWearCo Etsy store. Optimized for Cursor - can be triggered naturally in chat.

**How to Use**:
Just say things like:
- "Generate 3 new ideas"
- "Create dinosaur themed shirts"
- "Give me trending funny concepts"
- "I need new shower curtain ideas"
- Or just "surprise me with some BanterWearCo ideas"

The agent will automatically respond with structured, high-quality output including:
- Punchy concepts
- Etsy-optimized titles & descriptions  
- 15-20 targeted tags
- World-class image prompts (specifically engineered to work on both light and dark clothing)
- Color strategy guidance
- Print-ready production notes

**Key Features**:
- Uses the full context from `DESIGN.md`, `PROMPTS.md`, `AGENTS.md`, `.cursor/rules/`, and `SKILL.md`
- Prioritizes **top-tier image quality** — all prompts are engineered to work excellently on both light and dark clothing
- When you want **actual image files**, run `npm run generate -- --images` — images will be automatically saved to the `./images/` folder in this repository
- Can use any model available in Cursor for the highest quality creative output
- Outputs are production-ready (detailed prompts + saved PNG files when using the CLI with `--images`)
- Maintains perfect consistency with your existing store voice ("Nobody needs this much baby oil", Psycho Bakery, dinosaur themes, etc.)

**Technical Implementation**:
The behavior is driven by the rules in `.cursor/rules/banterwear-generator.md` and `.cursorrules`. No additional setup needed.

**Created for**: Local-first workflow inside Cursor. You can iterate rapidly, ask for variations, or request specific themes without leaving the IDE.

Just talk to me naturally. I'm now your dedicated BanterWearCo Creative Director.

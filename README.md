# MyEtsyStore — BanterWearCo Idea Generator

A local web app that generates Etsy/Printify product ideas end-to-end:

1. **LLM** (Azure OpenAI / OpenAI) writes the title, description, 13 tags, 10–15 keywords, and two FLUX prompts (one for light shirts, one for dark).
2. **FLUX.2-pro** (Azure AI Foundry) renders both transparent design variants in parallel.
3. **sharp** verifies the alpha channel and keys out any near-white background that slipped through.
4. **Printify** receives both PNGs in your image library, then we spin up throwaway draft products to harvest mockup URLs and download up to 4 mockups per variant.
5. Everything is persisted to `designs/<slug>/manifest.json` for review and re-export.

The whole pipeline streams progress over Server-Sent Events to a Tailwind UI you can drive at `http://localhost:3000`.

## Requirements

- Node.js 20+
- An Azure subscription with **Azure OpenAI** (any chat model — GPT-4o-mini up through GPT-5) and **Azure AI Foundry FLUX.2-pro**
- A **Printify** account with a Personal Access Token

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in .env.local — see sections below
npm run dev
# open http://localhost:3000
```

### Azure OpenAI

Set in `.env.local`:

```
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

For GPT-5 deployments, see the comments in `.env.example` — the app defaults to the Responses API.

### Azure FLUX.2-pro

```
AZURE_FLUX_ENDPOINT=https://YOUR_RESOURCE.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro
AZURE_FLUX_API_KEY=...
```

### Printify

1. Sign in at <https://printify.com>.
2. Top-right avatar → **My account** → **Connections** → **Personal access tokens** → **Generate new token**. Required scopes: `shops.read`, `uploads.write`, `products.write`, `products.read`. The token is shown once.
3. Paste it into `.env.local` as `PRINTIFY_API_TOKEN=...`.
4. Get your shop ID:
   ```bash
   curl -H "Authorization: Bearer $PRINTIFY_API_TOKEN" https://api.printify.com/v1/shops.json
   ```
   Copy the numeric `id` of your Etsy-connected shop into `.env.local` as `PRINTIFY_SHOP_ID=...`.
5. Restart `npm run dev`.

After your first successful generation, browse `designs/<slug>/manifest.json` and inspect `printify_mockups[].print_provider_id`. If you like that provider's mockup style, pin it in `.env.local`:

```
PRINTIFY_PRINT_PROVIDER_ID_PREFERRED=99
```

## Cost guardrail

FLUX.2-pro is the dominant cost. The app enforces a daily cap (default **15 ideas/day** = 30 FLUX calls). At ~$0.10/image that's ~$3/day, leaving headroom for the LLM and any retries within your $50/month Azure credit. Adjust via `FLUX_DAILY_CAP=` in `.env.local`. Usage state is persisted to `data/usage.json` (gitignored).

## What's in the repo

```
app/                          Next.js App Router pages + API routes (SSE)
  page.tsx                    Home: generate form + design grid
  designs/[slug]/page.tsx     Detail page: variants, mockups, copy blocks, regenerate buttons
  api/generate/               POST: streams the full pipeline
  api/designs/[slug]/         POST {step: ...} streams per-step regenerate
  api/printify/upload/        POST {slug}: upload existing design to Printify
  api/asset/[slug]/[file]/    GET: serves files from designs/<slug>/
lib/                          Server-only orchestration
  pipeline.ts                 The async generator that produces a complete design
  printify.ts                 Printify REST client (uploads, mockups, blueprint lookup)
  transparency.ts             sharp-based alpha inspection + near-white key-out
  storage.ts                  designs/<slug>/ helpers + listing-standard.json + usage.json
  env.ts                      env detection + envStatus()
  sse.ts                      AsyncGenerator -> text/event-stream Response
src/                          Reusable libraries
  ai.ts                       BanterAI — Azure OpenAI / OpenAI chat
  flux.ts                     generateFluxBuffer() — Azure FLUX.2-pro
  llm.ts                      Azure client factories + Responses API helpers
  types.ts                    ProductIdea + DesignManifest schemas
components/                   Tailwind UI
data/listing-standard.json    Locked product features / care / footer copy
designs/<slug>/               Generated assets + manifest.json (one folder per design)
```

## End-to-end test

1. `npm run dev`, open `http://localhost:3000`
2. Type a theme like `"grumpy cat barista"`, click **Generate**
3. The progress stream should show: idea → flux.light → flux.dark → printify uploads → mockups → manifest write → done
4. Auto-redirect to `/designs/grumpy-cat-barista` showing both transparent variants on a checkerboard, mockup gallery, and copy-to-clipboard blocks for title / tags / keywords / description
5. Open Printify dashboard → **Media library** to confirm the two PNGs are uploaded

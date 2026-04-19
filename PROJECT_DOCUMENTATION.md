# BanterWearCo Idea Generator - Complete Project Documentation

## Executive Summary

**BanterWearCo Idea Generator** is a sophisticated Next.js web application that automates the end-to-end creation of Print-on-Demand (POD) products for an Etsy store. The system combines AI-powered content generation, high-quality image creation, and Printify integration to produce market-ready t-shirt designs with mockups and optimized listings.

### Key Features
- **AI-Driven Design Generation**: Uses Azure OpenAI to create product concepts, titles, descriptions, and SEO keywords
- **Dual Variant Image Creation**: Generates separate light and dark shirt designs using FLUX.2-pro
- **Printify Integration**: Automatic image uploads and mockup generation
- **Real-Time Progress Streaming**: Server-Sent Events provide live generation updates
- **Cost Controls**: Built-in daily usage limits for expensive image generation
- **Quality Assurance**: Automated transparency validation and QA scoring

---

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15 with React 19, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes with Server-Sent Events
- **AI Services**: Azure OpenAI (GPT-4o/GPT-5), Azure AI Foundry FLUX.2-pro
- **Image Processing**: Sharp for transparency validation
- **POD Integration**: Printify REST API
- **Validation**: Zod schema validation
- **Styling**: TailwindCSS with custom dark theme

### System Flow
```
User Input (Theme/Style) 
    -> Azure OpenAI (Product Idea JSON) 
    -> FLUX.2-pro (2x Image Generation) 
    -> Sharp (Transparency Validation) 
    -> Printify (Upload + Mockups) 
    -> Local Storage (manifest.json)
```

---

## Directory Structure

```
MyEtsyStore/
|
# Core Application
|--- app/                          # Next.js App Router
|   |--- api/                      # API endpoints
|   |   |--- generate/              # Main pipeline endpoint
|   |   |--- designs/[slug]/        # Per-step regeneration
|   |   |--- printify/upload/       # Manual Printify upload
|   |   |--- asset/[slug]/          # Static asset serving
|   |--- designs/[slug]/           # Design detail pages
|   |--- page.tsx                  # Home page with generation form
|   |--- layout.tsx                # Root layout
|
|--- components/                   # React UI components
|   |--- GenerateForm.tsx          # Generation interface
|   |--- ProgressStream.tsx        # Real-time progress display
|   |--- DesignCard.tsx            # Design grid cards
|   |--- MockupGallery.tsx         # Mockup display
|   |--- CopyBlock.tsx             # Copy-to-clipboard blocks
|   |--- DesignActions.tsx         # Design action buttons
|
|--- lib/                          # Server-side utilities
|   |--- pipeline.ts               # Main generation pipeline
|   |--- printify.ts               # Printify API client
|   |--- transparency.ts           # Image validation
|   |--- storage.ts                # File system operations
|   |--- env.ts                    # Environment validation
|   |--- sse.ts                    # Server-Sent Events
|
|--- src/                          # Shared libraries
|   |--- ai.ts                     # AI service (BanterAI class)
|   |--- flux.ts                   # FLUX image generation
|   |--- llm.ts                    # LLM client factories
|   |--- types.ts                  # TypeScript schemas
|   |--- download.ts               # Image download utilities
|
# Data & Configuration
|--- data/                         # Static data
|   |--- listing-standard.json     # Product features/care/footer
|
|--- designs/                      # Generated designs (one per slug)
|   |--- [slug]/
|       |--- manifest.json         # Complete design data
|       |--- [slug]-light.png      # Light variant image
|       |--- [slug]-dark.png       # Dark variant image
|       |--- [slug]-mockup-*.png   # Generated mockups
|
|--- .env.example                  # Environment template
|--- .env.local                    # Local environment (gitignored)
|
# Documentation
|--- README.md                     # Setup and usage guide
|--- DESIGN.md                     # Architecture and design decisions
|--- PROMPTS.md                    # AI prompt documentation
|--- AGENTS.md                     # AI agent instructions
|--- SKILL.md                      # Skill documentation
|
# Configuration Files
|--- package.json                  # Dependencies and scripts
|--- next.config.mjs               # Next.js configuration
|--- tailwind.config.ts            # TailwindCSS configuration
|--- tsconfig.json                 # TypeScript configuration
```

---

## Core Components

### 1. AI Service (`src/ai.ts`)

**BanterAI Class**: The creative intelligence engine
- **Input**: Theme, style preferences
- **Output**: Structured ProductIdea JSON with 13 required fields
- **Models**: Supports Azure OpenAI (GPT-4o/GPT-5) and OpenAI.com
- **Validation**: Zod schema ensures production-ready output

**Key Methods**:
- `generateIdea(options)`: Creates complete product concept
- Supports both standard chat completions and Azure Responses API

### 2. Image Generation (`src/flux.ts`)

**FLUX Integration**: High-quality design creation
- **Service**: Azure AI Foundry FLUX.2-pro
- **Output**: 1024x1024 transparent PNGs
- **Dual Strategy**: Separate prompts for light/dark variants
- **Cost Control**: Daily usage limits and tracking

### 3. Generation Pipeline (`lib/pipeline.ts`)

**Orchestration Engine**: AsyncGenerator streaming progress
```typescript
export async function* runPipeline(input: RunPipelineInput): AsyncGenerator<PipelineEvent>
```

**Pipeline Stages**:
1. **Idea Generation**: LLM creates ProductIdea JSON
2. **Image Generation**: FLUX creates light/dark variants
3. **Transparency Validation**: Sharp ensures proper alpha channels
4. **Printify Upload**: Images added to media library
5. **Mockup Generation**: Creates product mockups
6. **Manifest Creation**: Saves complete design data

### 4. Printify Integration (`lib/printify.ts`)

**POD Platform Integration**:
- **Image Upload**: Base64 PNG uploads to media library
- **Mockup Generation**: Creates draft products for mockups
- **Provider Selection**: Configurable print providers
- **Blueprint Management**: Product template handling

---

## API Endpoints

### POST `/api/generate`
**Purpose**: Run complete generation pipeline
**Body**: `{ theme?, style?, mockupsPerVariant? }`
**Response**: Server-Sent Events streaming PipelineEvent

**Event Types**:
- `idea.start/done`: LLM idea generation
- `flux.start/done`: Image creation per variant
- `printify.upload.start/done`: Image uploads
- `printify.mockups.start/done`: Mockup generation
- `manifest.write`: Local storage
- `done/error`: Completion status

### POST `/api/designs/[slug]`
**Purpose**: Per-step regeneration for existing designs
**Body**: `{ step: 'idea' | 'flux.light' | 'flux.dark' | 'mockups' }`

### POST `/api/printify/upload`
**Purpose**: Manual Printify upload for existing designs
**Body**: `{ slug: string }`

### GET `/api/asset/[slug]/[file]`
**Purpose**: Serve generated files from designs directory

---

## Data Models

### ProductIdea Schema (`src/types.ts`)

```typescript
{
  concept: string;                    // Core funny/trending idea
  title: string;                       // Etsy-optimized title (<140 chars)
  description: string;                 // Creative marketing copy (200-350 words)
  tags: string[13];                   // Exactly 13 Etsy tags
  keywords: string[10-15];             // SEO keywords
  lightImagePrompt: string;            // FLUX prompt for light shirts
  darkImagePrompt: string;             // FLUX prompt for dark shirts
  imagePrompt: string;                 // Shared concept prompt
  printReadyPrompt: string;            // POD print specifications
  category: 'tshirt' | 'hoodie' | 'sweatshirt' | 'shower-curtain' | 'poster' | 'mug' | 'other';
  humorStyle: string;
  trendingAngle?: string;              // Optional meme/trend tie-in
  colorStrategy: string;
  recommendedShirtColors: {
    light: string[3-8];                // Bella Canvas light colors
    dark: string[3-8];                 // Bella Canvas dark colors
  };
}
```

### DesignManifest Schema

```typescript
{
  slug: string;                        // URL-friendly identifier
  concept: string;
  title: string;
  description: string;
  product_features: string[];          // From listing-standard.json
  care_instructions: string[];         // From listing-standard.json
  listing_footer: string;               // From listing-standard.json
  tags: string[];
  keywords: string[];
  recommended_shirt_colors: {
    light_variant: string[];
    dark_variant: string[];
  };
  files: {
    light: string;                     // Light variant filename
    dark: string;                      // Dark variant filename
  };
  mockups: string[];                   // Mockup filenames
  printify_image_ids?: {
    light?: string;
    dark?: string;
  };
  printify_mockups: PrintifyMockupSet[];
  qa_reviews?: Record<string, QaReview>;
  created_at: string;
}
```

---

## Environment Configuration

### Required Services

#### Azure OpenAI (LLM)
```bash
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_DEPLOYMENT=your-deployment
# Optional GPT-5 settings
AZURE_OPENAI_GPT5_USE_CHAT=1
AZURE_OPENAI_CHAT_MODEL=gpt-5.4-pro
```

#### Azure AI Foundry (FLUX.2-pro)
```bash
AZURE_FLUX_ENDPOINT=https://YOUR_RESOURCE.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro
AZURE_FLUX_API_KEY=your_key
```

#### Printify
```bash
PRINTIFY_API_TOKEN=your_token
PRINTIFY_SHOP_ID=your_shop_id
PRINTIFY_PRINT_PROVIDER_ID_PREFERRED=99  # Optional
PRINTIFY_BLUEPRINT_ID=6                  # Optional (Bella Canvas 3001)
```

#### Cost Controls
```bash
FLUX_DAILY_CAP=15  # 15 ideas = 30 FLUX calls = ~$3/day
```

---

## UI Components

### GenerateForm.tsx
**Purpose**: Main user interface for design generation
**Features**:
- Theme input with autocomplete suggestions
- Style selection (funny, trending, unique, random)
- Mockup count configuration
- Real-time environment status display
- Cost indicator for FLUX usage

### ProgressStream.tsx
**Purpose**: Real-time pipeline progress display
**Features**:
- Server-Sent Events client
- Step-by-step progress indicators
- Error handling and retry options
- Auto-redirect to design detail page

### DesignCard.tsx
**Purpose**: Grid display of generated designs
**Features**:
- Thumbnail preview of both variants
- Title and concept display
- Creation timestamp
- Quick actions (view, regenerate)

### MockupGallery.tsx
**Purpose**: Display of Printify-generated mockups
**Features**:
- Grid layout with light/dark variants
- High-quality image loading
- Provider information display

---

## Development Workflow

### Setup
```bash
npm install
cp .env.example .env.local
# Configure environment variables
npm run dev
```

### Development Scripts
- `npm run dev`: Development server (http://localhost:3000)
- `npm run build`: Production build
- `npm run start`: Production server
- `npm run lint`: ESLint validation

### Testing Workflow
1. **Environment Validation**: Check all service connections
2. **Single Generation**: Test basic pipeline with minimal theme
3. **Full Pipeline**: Verify complete FLUX + Printify integration
4. **Error Handling**: Test failure scenarios and recovery
5. **Cost Controls**: Verify daily limits and usage tracking

---

## Brand Voice & Content Strategy

### BanterWearCo Identity
- **Personality**: Witty, irreverent, self-deprecating
- **Target Audience**: Millennials, parents, gamers, burnout culture
- **Humor Style**: Relatable everyday situations, absurd angles
- **Visual Style**: Bold typography + minimalist illustration

### Content Guidelines
- **Concept Focus**: One strong idea per design
- **Text Length**: Punchy slogans (typically <8 words)
- **Visual Strategy**: Works as text-forward AND with illustration
- **SEO Optimization**: 13 tags + 10-15 keywords per design
- **Description Structure**: Hook + emotional angle + "Perfect for" + DETAILS

### Bestseller Examples
- "Nobody needs this much baby oil"
- "Therapy is cheaper than wine" 
- "Dada Daddy Dad Bruh"
- "Fueled by spite and iced coffee"

---

## Production Considerations

### Cost Management
- **FLUX Generation**: ~$0.10 per image (2 images per design)
- **Daily Caps**: Configurable limits prevent cost overruns
- **Usage Tracking**: Persistent usage.json monitoring
- **Retry Logic**: Smart retry with exponential backoff

### Quality Assurance
- **Schema Validation**: Zod ensures structured output
- **Image Validation**: Sharp verifies transparency and quality
- **QA Scoring**: Manual review system with scoring
- **Error Recovery**: Per-step regeneration capabilities

### Performance Optimization
- **Parallel Processing**: Light/dark images generated concurrently
- **Streaming Updates**: Real-time progress via SSE
- **Local Storage**: Cached designs prevent re-generation
- **Image Optimization**: Efficient PNG handling

---

## Future Enhancements

### Phase 2 (Planned)
- **Direct Printify Product Creation**: Automated listing generation
- **Alternative Image Models**: Integration with Stable Diffusion
- **Web Dashboard**: Enhanced UI with history and analytics
- **A/B Testing**: Title and tag optimization suggestions

### Phase 3 (Long-term)
- **Multi-Agent System**: Specialized agents for concept, SEO, visuals
- **Trend Analysis**: Integration with Google Trends, social APIs
- **Performance Analytics**: Etsy sales data integration
- **Batch Operations**: Bulk generation and management

---

## Troubleshooting Guide

### Common Issues

#### Azure OpenAI Connection
- **Symptom**: "LLM not ready" status
- **Solution**: Verify endpoint URL, API key, and deployment name
- **Check**: Azure portal for resource status and API key rotation

#### FLUX Generation Failures
- **Symptom**: Image generation timeouts or errors
- **Solution**: Check Azure AI Foundry endpoint and quota
- **Daily Cap**: Verify FLUX_DAILY_CAP not exceeded

#### Printify Upload Issues
- **Symptom**: Mockup generation failures
- **Solution**: Verify API token scopes and shop permissions
- **Check**: Printify dashboard for shop connectivity

#### Image Quality Problems
- **Symptom**: Poor transparency or background artifacts
- **Solution**: Review FLUX prompts for "transparent background" requirement
- **Validation**: Check sharp transparency processing logs

### Debug Mode
Enable detailed logging by setting:
```bash
DEBUG=1 npm run dev
```

---

## Conclusion

The BanterWearCo Idea Generator represents a sophisticated integration of modern AI services with e-commerce infrastructure. It successfully bridges the gap between creative concept generation and production-ready POD products, providing both automation and quality control.

The system's modular architecture allows for easy extension and modification, while the comprehensive validation and error handling ensure reliable operation in a production environment.

**Key Strengths**:
- End-to-end automation with human oversight
- Cost-effective usage with built-in controls
- High-quality output optimized for POD production
- Extensible architecture for future enhancements

**Documentation Last Updated**: April 19, 2026
**Version**: 2.0.0

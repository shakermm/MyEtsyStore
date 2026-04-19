import { NextRequest } from 'next/server';
import { runPipeline, type PipelineEvent } from '@/lib/pipeline';
import { eventStream } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    theme?: string;
    style?: 'funny' | 'trending' | 'unique' | 'random';
    category?: 'tshirt' | 'hoodie' | 'sweatshirt' | 'mug' | 'poster' | 'shower-curtain' | 'phone-case' | 'tote-bag' | 'pillow' | 'other';
    mockupsPerVariant?: number; // legacy field
    mockupCount?: number;
    createProducts?: boolean;
    publishProducts?: boolean;
  };

  return eventStream<PipelineEvent>(
    runPipeline({
      theme: body.theme,
      style: body.style,
      category: body.category,
      mockupCount: body.mockupCount ?? body.mockupsPerVariant,
      createProducts: body.createProducts,
      publishProducts: body.publishProducts,
    })
  );
}

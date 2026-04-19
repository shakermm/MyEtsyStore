import { NextRequest } from 'next/server';
import { regenerateMockups, regenerateVariant, uploadToPrintify } from '@/lib/pipeline';
import { eventStream } from '@/lib/sse';
import { readManifest } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const manifest = await readManifest(slug);
  if (!manifest) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(manifest);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    step?: 'flux.light' | 'flux.dark' | 'mockups' | 'printify.upload';
  };

  switch (body.step) {
    case 'flux.light':
      return eventStream(regenerateVariant(slug, 'light'));
    case 'flux.dark':
      return eventStream(regenerateVariant(slug, 'dark'));
    case 'mockups':
      return eventStream(regenerateMockups(slug));
    case 'printify.upload':
      return eventStream(uploadToPrintify(slug));
    default:
      return Response.json({ error: `unknown step: ${body.step}` }, { status: 400 });
  }
}

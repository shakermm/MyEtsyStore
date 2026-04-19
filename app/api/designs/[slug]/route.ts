import { NextRequest } from 'next/server';
import {
  createProductsForDesign,
  publishExistingProduct,
  regenerateImage,
  regenerateMockups,
  uploadToPrintify,
} from '@/lib/pipeline';
import { eventStream } from '@/lib/sse';
import { deleteDesign, readManifest } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const manifest = await readManifest(slug);
  if (!manifest) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(manifest);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ok = await deleteDesign(slug);
  if (!ok) return Response.json({ error: 'delete failed' }, { status: 500 });
  return Response.json({ deleted: slug });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    step?: 'flux' | 'mockups' | 'printify.upload' | 'printify.products' | 'printify.publish';
    publish?: boolean;
  };

  switch (body.step) {
    case 'flux':
      return eventStream(regenerateImage(slug));
    case 'mockups':
      return eventStream(regenerateMockups(slug));
    case 'printify.upload':
      return eventStream(uploadToPrintify(slug));
    case 'printify.products':
      return eventStream(createProductsForDesign(slug, { publish: body.publish }));
    case 'printify.publish':
      return eventStream(publishExistingProduct(slug));
    default:
      return Response.json({ error: `unknown step: ${body.step}` }, { status: 400 });
  }
}

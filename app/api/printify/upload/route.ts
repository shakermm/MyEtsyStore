import { NextRequest } from 'next/server';
import { uploadToPrintify } from '@/lib/pipeline';
import { eventStream } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { slug?: string };
  if (!body.slug) {
    return Response.json({ error: 'slug required' }, { status: 400 });
  }
  return eventStream(uploadToPrintify(body.slug));
}

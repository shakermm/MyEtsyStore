import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { designDir } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; file: string }> }
) {
  const { slug, file } = await ctx.params;

  // Defensive: prevent path traversal. Filenames must be plain (no slashes / dotdots).
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    return new Response('bad request', { status: 400 });
  }
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    return new Response('bad request', { status: 400 });
  }

  const fullPath = path.join(designDir(slug), file);
  try {
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(file).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

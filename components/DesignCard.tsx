import Link from 'next/link';
import type { DesignManifest } from '@/src/types';
import DeleteDesignButton from './DeleteDesignButton';

export default function DesignCard({ manifest }: { manifest: DesignManifest }) {
  const thumb =
    (manifest.mockups && manifest.mockups[0]) ||
    manifest.files.image ||
    null;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 transition hover:border-fuchsia-400/50">
      <DeleteDesignButton slug={manifest.slug} variant="card" />
      <Link href={`/designs/${manifest.slug}`} className="block">
        <div className="aspect-square bg-neutral-950">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/asset/${manifest.slug}/${thumb}`}
              alt={manifest.title}
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-500">
              No preview
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium text-neutral-100">{manifest.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{manifest.slug}</p>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-neutral-600">
            {manifest.tags.length} tags · {manifest.keywords.length} keywords ·{' '}
            {manifest.printify_image_id ? 'on Printify' : 'local only'}
          </p>
        </div>
      </Link>
    </div>
  );
}

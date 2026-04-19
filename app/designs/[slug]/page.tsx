import { notFound } from 'next/navigation';
import Link from 'next/link';
import { readManifest } from '@/lib/storage';
import MockupGallery from '@/components/MockupGallery';
import DesignActions from '@/components/DesignActions';
import CopyBlock from '@/components/CopyBlock';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function DesignDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const manifest = await readManifest(slug);
  if (!manifest) notFound();

  const lightSrc = manifest.files.light ? `/api/asset/${slug}/${manifest.files.light}` : null;
  const darkSrc = manifest.files.dark ? `/api/asset/${slug}/${manifest.files.dark}` : null;

  return (
    <div className="space-y-8">
      <Link href="/" className="text-xs text-neutral-400 hover:text-neutral-200">
        &larr; All designs
      </Link>

      <header>
        <h1 className="text-3xl font-bold">{manifest.title}</h1>
        <p className="mt-1 text-sm text-neutral-400">{manifest.slug}</p>
        <p className="mt-3 text-neutral-300">{manifest.concept}</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Transparent designs</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VariantPanel label="LIGHT (for white/cream/heather shirts)" src={lightSrc} />
          <VariantPanel label="DARK (for black/navy/asphalt shirts)" src={darkSrc} />
        </div>
      </section>

      <DesignActions slug={slug} />

      <MockupGallery slug={slug} files={manifest.mockups} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CopyBlock label="Title (140-char Etsy limit)" text={manifest.title} />
        <CopyBlock label={`Tags (${manifest.tags.length})`} text={manifest.tags.join(', ')} />
        <CopyBlock label={`Keywords (${manifest.keywords.length})`} text={manifest.keywords.join(', ')} />
        <CopyBlock
          label="Description (full Etsy listing body)"
          text={manifest.description}
          rows={12}
        />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm">
        <h2 className="mb-3 text-base font-semibold">Recommended shirt colors</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorList label="Light variant" colors={manifest.recommended_shirt_colors.light_variant} />
          <ColorList label="Dark variant" colors={manifest.recommended_shirt_colors.dark_variant} />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm">
        <h2 className="mb-3 text-base font-semibold">Printify status</h2>
        <ul className="space-y-1 text-neutral-300">
          <li>
            Light upload ID:{' '}
            <code className="text-fuchsia-300">{manifest.printify_image_ids.light || '— not uploaded —'}</code>
          </li>
          <li>
            Dark upload ID:{' '}
            <code className="text-fuchsia-300">{manifest.printify_image_ids.dark || '— not uploaded —'}</code>
          </li>
          <li className="text-neutral-500">
            Created {new Date(manifest.created_at).toLocaleString()}
          </li>
        </ul>
      </section>
    </div>
  );
}

function VariantPanel({ label, src }: { label: string; src: string | null }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="bg-checker rounded-lg p-2">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="h-auto w-full" />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-neutral-500">Not generated</div>
        )}
      </div>
    </div>
  );
}

function ColorList({ label, colors }: { label: string; colors: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <ul className="list-disc pl-5 text-neutral-300">
        {colors.map(c => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

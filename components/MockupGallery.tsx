export default function MockupGallery({ slug, files }: { slug: string; files: string[] }) {
  if (!files || files.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold">Mockups</h2>
        <p className="text-sm text-neutral-500">No mockups yet. Run "Regenerate mockups" to create them.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Mockups ({files.length})</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map(f => (
          <a
            key={f}
            href={`/api/asset/${slug}/${f}`}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/asset/${slug}/${f}`} alt={f} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    </section>
  );
}

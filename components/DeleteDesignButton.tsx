'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  slug: string;
  /** 'detail' = large red button on the design page; 'card' = small icon button on card grid. */
  variant?: 'detail' | 'card';
  /** Where to go after a successful delete. Only used by `detail` variant. */
  redirectTo?: string;
}

export default function DeleteDesignButton({ slug, variant = 'detail', redirectTo = '/' }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const ok = window.confirm(`Delete design "${slug}"? This removes the folder from disk and cannot be undone.`);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (variant === 'detail') {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        title="Delete design"
        className="absolute right-2 top-2 z-10 rounded-md border border-neutral-700 bg-neutral-950/80 px-2 py-1 text-xs font-medium text-neutral-300 opacity-0 backdrop-blur transition hover:border-red-500 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
      >
        {busy ? '…' : 'Delete'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-500 hover:bg-red-950/60 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? 'Deleting…' : 'Delete design'}
    </button>
  );
}

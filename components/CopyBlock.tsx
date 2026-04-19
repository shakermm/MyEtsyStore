'use client';

import { useState } from 'react';

export default function CopyBlock({
  label,
  text,
  rows,
}: {
  label: string;
  text: string;
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-300"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={rows ?? 3}
        className="w-full resize-none rounded border border-neutral-800 bg-neutral-950 p-2 text-sm text-neutral-200 focus:border-fuchsia-400 focus:outline-none"
      />
    </div>
  );
}

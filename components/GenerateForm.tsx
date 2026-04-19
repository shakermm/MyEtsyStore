'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProgressStream from './ProgressStream';

interface GenerateFormProps {
  llmReady: boolean;
  fluxReady: boolean;
  printifyReady: boolean;
}

export default function GenerateForm({ llmReady, fluxReady, printifyReady }: GenerateFormProps) {
  const router = useRouter();
  const [theme, setTheme] = useState('');
  const [style, setStyle] = useState<'funny' | 'trending' | 'unique' | 'random'>('random');
  const [mockupsPerVariant, setMockupsPerVariant] = useState(2);
  const [running, setRunning] = useState(false);
  const [bodyKey, setBodyKey] = useState(0);

  const blocked = !llmReady || !fluxReady;

  function start() {
    if (blocked) return;
    setRunning(true);
    setBodyKey(k => k + 1);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_140px_auto]">
        <input
          value={theme}
          onChange={e => setTheme(e.target.value)}
          placeholder="Optional theme (e.g. 'grumpy cat barista' or leave blank for random)"
          disabled={running}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-fuchsia-400 focus:outline-none"
        />
        <select
          value={style}
          onChange={e => setStyle(e.target.value as typeof style)}
          disabled={running}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="random">Style: random</option>
          <option value="funny">Funny</option>
          <option value="trending">Trending</option>
          <option value="unique">Unique</option>
        </select>
        <select
          value={mockupsPerVariant}
          onChange={e => setMockupsPerVariant(Number(e.target.value))}
          disabled={running}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value={1}>1 mockup/variant</option>
          <option value={2}>2 mockups/variant</option>
          <option value={3}>3 mockups/variant</option>
          <option value={4}>4 mockups/variant</option>
        </select>
        <button
          type="button"
          onClick={start}
          disabled={blocked || running}
          className="rounded-md bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {blocked && (
        <p className="text-xs text-amber-400">
          Configure {!llmReady && 'LLM'} {!llmReady && !fluxReady && '+'} {!fluxReady && 'FLUX'} in <code>.env.local</code>{' '}
          before generating. {!printifyReady && 'Printify is optional but recommended for mockups.'}
        </p>
      )}

      {running && (
        <ProgressStream
          key={bodyKey}
          url="/api/generate"
          body={{ theme, style, mockupsPerVariant }}
          startLabel={`Generating: theme="${theme || '(random)'}", style=${style}`}
          onDone={slug => {
            setRunning(false);
            if (slug) {
              setTimeout(() => router.push(`/designs/${slug}`), 600);
            } else {
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

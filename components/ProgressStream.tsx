'use client';

import { useEffect, useRef, useState } from 'react';

export type StreamEvent = {
  type: string;
  step?: string;
  message?: string;
  slug?: string;
  variant?: 'light' | 'dark';
  file?: string;
  imageId?: string;
  count?: number;
  productIds?: string[];
  idea?: { title?: string; concept?: string };
};

interface ProgressStreamProps {
  url: string;
  body: unknown;
  onDone?: (lastSlug: string | null) => void;
  startLabel?: string;
}

export default function ProgressStream({ url, body, onDone, startLabel }: ProgressStreamProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(true);
  const slugRef = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const event = JSON.parse(dataLine.slice(5).trim()) as StreamEvent;
              if (event.slug) slugRef.current = event.slug;
              setEvents(prev => [...prev, event]);
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setEvents(prev => [
            ...prev,
            { type: 'error', step: 'fetch', message: err instanceof Error ? err.message : String(err) },
          ]);
        }
      } finally {
        if (!cancelled) {
          setRunning(false);
          onDoneRef.current?.(slugRef.current);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 font-mono text-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-neutral-400">{startLabel ?? 'Pipeline'}</span>
        <span className={running ? 'text-amber-400' : 'text-emerald-400'}>
          {running ? '● running' : '✓ finished'}
        </span>
      </div>
      <ul className="space-y-1">
        {events.map((e, i) => (
          <li key={i} className={eventClass(e)}>
            <span className="text-neutral-500">{i.toString().padStart(2, '0')}.</span>{' '}
            <span>{formatEvent(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function eventClass(e: StreamEvent): string {
  if (e.type === 'error') return 'text-red-400';
  if (e.type === 'done') return 'text-emerald-400';
  if (e.type.endsWith('.done')) return 'text-emerald-300';
  if (e.type.endsWith('.start')) return 'text-blue-300';
  return 'text-neutral-300';
}

function formatEvent(e: StreamEvent): string {
  switch (e.type) {
    case 'idea.start':
      return 'Generating idea...';
    case 'idea.done':
      return `Idea ready · slug=${e.slug} · ${e.idea?.title ?? ''}`;
    case 'flux.start':
      return `FLUX ${e.variant} variant — calling Azure...`;
    case 'flux.done':
      return `FLUX ${e.variant} done -> ${e.file}`;
    case 'printify.upload.start':
      return `Printify upload (${e.variant})...`;
    case 'printify.upload.done':
      return `Printify uploaded (${e.variant}) · id=${e.imageId}`;
    case 'printify.products.start':
      return 'Creating Printify products...';
    case 'printify.products.done':
      return `Printify products created (${e.count}) · IDs: ${e.productIds?.join(', ')}`;
    case 'printify.mockups.start':
      return `Printify mockups (${e.variant})...`;
    case 'printify.mockups.done':
      return `Printify mockups (${e.variant}) · downloaded ${e.count}`;
    case 'manifest.write':
      return `Wrote manifest for ${e.slug}`;
    case 'done':
      return `DONE · ${e.slug}`;
    case 'error':
      return `ERROR (${e.step}): ${e.message}`;
    case 'log':
      return e.message ?? '';
    default:
      return JSON.stringify(e);
  }
}

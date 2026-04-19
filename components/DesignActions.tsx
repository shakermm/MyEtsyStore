'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProgressStream from './ProgressStream';

type Step =
  | 'flux.light'
  | 'flux.dark'
  | 'mockups'
  | 'printify.upload'
  | 'printify.products'
  | 'printify.products.publish';

const STEP_LABELS: Record<Step, string> = {
  'flux.light': 'Regenerate light variant',
  'flux.dark': 'Regenerate dark variant',
  mockups: 'Regenerate mockups',
  'printify.upload': 'Upload to Printify',
  'printify.products': 'Create Printify products (draft)',
  'printify.products.publish': 'Create & publish Printify products',
};

function stepBody(step: Step): Record<string, unknown> {
  if (step === 'printify.products') return { step: 'printify.products' };
  if (step === 'printify.products.publish') return { step: 'printify.products', publish: true };
  return { step };
}

export default function DesignActions({ slug }: { slug: string }) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<Step | null>(null);
  const [streamKey, setStreamKey] = useState(0);

  function run(step: Step) {
    setActiveStep(step);
    setStreamKey(k => k + 1);
  }

  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STEP_LABELS) as Step[]).map(step => (
          <button
            key={step}
            type="button"
            onClick={() => run(step)}
            disabled={activeStep !== null}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-fuchsia-400 hover:text-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {STEP_LABELS[step]}
          </button>
        ))}
      </div>
      {activeStep && (
        <ProgressStream
          key={streamKey}
          url={`/api/designs/${slug}`}
          body={stepBody(activeStep)}
          startLabel={STEP_LABELS[activeStep]}
          onDone={() => {
            setActiveStep(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

import GenerateForm from '@/components/GenerateForm';
import DesignCard from '@/components/DesignCard';
import { listManifests } from '@/lib/storage';
import { envStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [manifests, env] = await Promise.all([listManifests(), Promise.resolve(envStatus())]);

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h1 className="mb-2 text-2xl font-semibold">Generate a new design</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Optional theme &rarr; LLM concept &rarr; FLUX light + dark variants &rarr; Printify upload &rarr; mockups.
        </p>
        <GenerateForm
          llmReady={env.llm}
          fluxReady={env.flux}
          printifyReady={env.printify}
        />
        <EnvStatusList env={env} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Designs ({manifests.length})</h2>
        {manifests.length === 0 ? (
          <p className="text-sm text-neutral-500">No designs yet. Generate one above.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {manifests.map(m => (
              <DesignCard key={m.slug} manifest={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EnvStatusList({ env }: { env: ReturnType<typeof envStatus> }) {
  const items: Array<[string, boolean, string]> = [
    ['LLM (Azure OpenAI / OpenAI)', env.llm, 'AZURE_OPENAI_* or OPENAI_API_KEY'],
    ['FLUX (Azure AI Foundry)', env.flux, 'AZURE_FLUX_ENDPOINT + AZURE_FLUX_API_KEY'],
    ['Printify', env.printify, 'PRINTIFY_API_TOKEN + PRINTIFY_SHOP_ID'],
  ];
  return (
    <ul className="mt-6 space-y-1 text-xs">
      {items.map(([label, ready, hint]) => (
        <li key={label} className="flex items-center gap-2">
          <span className={ready ? 'text-emerald-400' : 'text-amber-400'}>{ready ? '●' : '○'}</span>
          <span className="text-neutral-300">{label}</span>
          {!ready && <span className="text-neutral-500">— set {hint}</span>}
        </li>
      ))}
      <li className="text-neutral-500">FLUX daily cap: {env.fluxDailyCap}</li>
    </ul>
  );
}

import OpenAI from 'openai';
import { AzureOpenAI } from 'openai';

/** Normalize Azure resource URL for the OpenAI SDK. */
export function normalizeAzureEndpoint(raw: string): string {
  let u = raw.trim();
  if (!u.startsWith('http')) u = `https://${u}`;
  if (!u.endsWith('/')) u += '/';
  return u;
}

export function isChatConfigured(): boolean {
  const azure =
    process.env.AZURE_OPENAI_ENDPOINT?.trim() &&
    process.env.AZURE_OPENAI_API_KEY?.trim() &&
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (azure) return true;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Chat client for idea JSON. Prefers Azure OpenAI when endpoint + key + deployment are set.
 */
export function createIdeaChatClient(): { client: OpenAI; model: string; provider: 'azure' | 'openai' } {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  // GPT-5 on Azure (Microsoft sample): api-version 2024-12-01-preview + chat.completions.
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION?.trim() ||
    (deployment && deployment.toLowerCase().includes('gpt-5')
      ? '2024-12-01-preview'
      : '2024-08-01-preview');

  if (endpoint && apiKey && deployment) {
    const client = new AzureOpenAI({
      endpoint: normalizeAzureEndpoint(endpoint),
      apiKey,
      deployment,
      apiVersion,
    });
    return { client, model: deployment, provider: 'azure' };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey });
    const model = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini';
    return { client, model, provider: 'openai' };
  }

  throw new Error(
    'No chat LLM configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT ' +
      '(Azure OpenAI), or set OPENAI_API_KEY (OpenAI.com).'
  );
}

/** Plain text from Responses API (used when chat.completions returns 400 on some GPT-5 deployments). */
export function extractResponsesOutputText(response: unknown): string {
  const r = response as {
    output_text?: string;
    output?: unknown[];
  };
  if (typeof r.output_text === 'string') {
    const t = r.output_text.trim();
    if (t) return t;
  }
  const chunks: string[] = [];
  for (const item of r.output ?? []) {
    const msg = item as { type?: string; content?: unknown[]; text?: string };
    if (msg.type === 'message' && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        const block = c as { type?: string; text?: string };
        if (typeof block.text === 'string' && block.text) {
          if (block.type === 'output_text' || block.type === 'text' || block.type === undefined) {
            chunks.push(block.text);
          }
        }
      }
    } else if (msg.type === 'output_text' && typeof msg.text === 'string' && msg.text) {
      chunks.push(msg.text);
    }
  }
  return chunks.join('\n').trim();
}

/**
 * Azure Responses API needs api-version 2025-03-01-preview or later (separate from chat 2024-12-01-preview).
 */
export function createAzureOpenAiResponsesClient(
  endpoint: string,
  apiKey: string,
  deployment: string,
  apiVersion = '2025-04-01-preview'
): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: normalizeAzureEndpoint(endpoint),
    apiKey,
    deployment,
    apiVersion,
  });
}

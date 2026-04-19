/**
 * Azure AI Foundry — Black Forest Labs FLUX.2-pro (text-to-image).
 * https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux
 */

const FLUX_SAFETY_PREFIX = `PG-rated graphic tee art only — STRICT:
No weapons of any kind (no swords, knives, spears, axes, guns, bats, clubs). No combat, fighting, blood, injuries, or aggressive poses.
No realistic plate armor, spikes, or menacing helmets. If you show a "guard" or fantasy figure, use a soft rounded mascot / plush-toy / costume-party style with cloth tunic or hoodie, big friendly eyes, simple shapes — cute cartoon flat vector only.
`;

const STYLE_SUFFIX =
  ' Premium humorous t-shirt graphic, clean vector look, high contrast, family-friendly, suitable for print-on-demand, no photorealism. ISOLATED ARTWORK ONLY — no t-shirt mockup, no garment, no hanger, no model, no background scene. BACKGROUND MUST BE EITHER FULLY TRANSPARENT or SOLID PURE WHITE (#FFFFFF) — absolutely no gradient, no texture, no noise, no off-white, no color tint, no pattern, no shadow. The background is only there to be keyed out in post-processing.';

function buildUrl(raw: string): string {
  const base = raw.trim().replace(/\/$/, '');
  if (base.includes('api-version=')) return base;
  return `${base}${base.includes('?') ? '&' : '?'}api-version=preview`;
}

async function postFlux(url: string, apiKey: string, body: Record<string, unknown>) {
  const tryBearer = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (tryBearer.ok) return tryBearer;
  if (tryBearer.status === 401 || tryBearer.status === 403) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  }
  return tryBearer;
}

export function isFluxConfigured(): boolean {
  const e = process.env.AZURE_FLUX_ENDPOINT?.trim();
  const k = process.env.AZURE_FLUX_API_KEY?.trim();
  return Boolean(e && k);
}

export interface FluxOptions {
  printReadyPrompt?: string;
  width?: number;
  height?: number;
  /** Ask FLUX for transparent PNG. If the server rejects it, fall back to opaque + post-process via lib/transparency.ts. */
  transparent?: boolean;
}

export interface FluxResult {
  buffer: Buffer;
  mimeType: 'image/png';
}

/**
 * Generate a single FLUX image and return its raw PNG bytes.
 * Throws on failure (caller decides whether to retry / continue pipeline).
 */
export async function generateFluxBuffer(
  imagePrompt: string,
  opts: FluxOptions = {}
): Promise<FluxResult> {
  const endpoint = process.env.AZURE_FLUX_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_FLUX_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    throw new Error('FLUX not configured: set AZURE_FLUX_ENDPOINT and AZURE_FLUX_API_KEY');
  }

  const model = process.env.AZURE_FLUX_MODEL || 'FLUX.2-pro';
  const width = opts.width ?? Number(process.env.AZURE_FLUX_WIDTH || 1024);
  const height = opts.height ?? Number(process.env.AZURE_FLUX_HEIGHT || 1024);

  let prompt = `${FLUX_SAFETY_PREFIX}\n\n${imagePrompt.trim()}`;
  if (opts.printReadyPrompt?.trim()) {
    prompt += `\n\nPrint notes: ${opts.printReadyPrompt.trim()}`;
  }
  prompt += `\n\n${STYLE_SUFFIX}`;
  if (prompt.length > 8000) prompt = prompt.slice(0, 8000);

  const url = buildUrl(endpoint);
  const body: Record<string, unknown> = {
    model,
    prompt,
    width,
    height,
    output_format: 'png',
    num_images: 1,
  };
  if (opts.transparent) body.background = 'transparent';

  const res = await postFlux(url, apiKey, body);
  const text = await res.text();
  if (!res.ok) {
    // Retry once without `background: transparent` if the server rejects it.
    if (opts.transparent && (res.status === 400 || res.status === 422)) {
      delete body.background;
      const retry = await postFlux(url, apiKey, body);
      const retryText = await retry.text();
      if (!retry.ok) {
        throw new Error(`FLUX HTTP ${retry.status}: ${retryText.slice(0, 800)}`);
      }
      return parseFluxResponse(retryText);
    }
    throw new Error(`FLUX HTTP ${res.status}: ${text.slice(0, 800)}`);
  }
  return parseFluxResponse(text);
}

async function parseFluxResponse(text: string): Promise<FluxResult> {
  const data = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = data?.data?.[0];
  let buffer: Buffer | null = null;
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const imgRes = await fetch(item.url);
    if (imgRes.ok) buffer = Buffer.from(await imgRes.arrayBuffer());
  }
  if (!buffer) {
    throw new Error(`FLUX: unexpected response shape: ${text.slice(0, 400)}`);
  }
  return { buffer, mimeType: 'image/png' };
}

/**
 * Azure AI Foundry — Black Forest Labs FLUX.2-pro (text-to-image).
 * https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux
 */

const FLUX_SAFETY_PREFIX = `ABSOLUTE RULE #1 — OUTPUT IS A STANDALONE FLAT VECTOR ILLUSTRATION ON A FULLY TRANSPARENT BACKGROUND.
DO NOT render any garment of any kind. NO t-shirt, NO hoodie, NO sweatshirt, NO tank top, NO polo, NO tote bag, NO mug, NO pillow, NO phone case, NO hanger, NO mannequin, NO person wearing clothing, NO fabric, NO collar, NO sleeves, NO neckline. If the subject is bold typography, draw ONLY the typography. If the subject is a coffee mug, draw ONLY the mug as artwork. If the subject is a person, draw ONLY the person from the chest up with no garment. The image you produce will later be placed onto a shirt by a separate system — your job is to produce the artwork alone on a blank background.

ABSOLUTE RULE #2 — NO STICKER BORDER. NO white outline, white halo, white glow, white ring, white silhouette, or white "die-cut" frame around the artwork as a whole. Do NOT draw the artwork as a sticker peel-off. The outermost edge of every shape must be the artwork's own dark stroke (~2-3px navy/black/charcoal) sitting directly on the transparent background. Treat this like a print-ready vector PDF, not a sticker mock-up. The word "sticker" is forbidden in your interpretation — think transparent PNG illustration.

ABSOLUTE RULE #3 — PG-rated only. No weapons, knives, guns, bats, clubs, swords, spears, axes. No combat, fighting, blood, injuries, or aggressive poses. No realistic plate armor, spikes, or menacing helmets. If you show a fantasy figure, use a soft rounded mascot / plush-toy / costume-party style with cloth tunic or hoodie, big friendly eyes, simple shapes — cute cartoon flat vector only.
`;

const STYLE_SUFFIX =
  ' Clean flat vector illustration style, high contrast, family-friendly, suitable for print-on-demand, no photorealism. ISOLATED SUBJECT ON BLANK BACKGROUND — the image contains the illustration and NOTHING ELSE. BACKGROUND MUST BE FULLY TRANSPARENT (preferred) or SOLID PURE WHITE (#FFFFFF) — absolutely no gradient, no texture, no noise, no off-white, no color tint, no pattern, no shadow, no drop shadow on the bg, no garment silhouette, no shirt shape, no frame, NO white sticker border, NO white outline ring, NO die-cut halo. Think transparent print-ready vector — the dark stroke of the artwork is the outermost pixel; everything beyond it is empty.';

/**
 * Remove product / garment / mockup references from the user-supplied prompt. FLUX
 * is extremely literal: any "t-shirt graphic" / "shirt design" phrasing causes it to
 * render an actual t-shirt. We want the raw artwork only.
 */
function sanitizeProductWords(text: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/\b(t[-\s]?shirts?|tees?|tee[-\s]?shirts?)\b/gi, 'illustration'],
    [/\b(hoodies?|sweatshirts?|sweaters?)\b/gi, 'illustration'],
    [/\b(tank[-\s]?tops?|polos?)\b/gi, 'illustration'],
    [/\b(mugs?|tote[-\s]?bags?|totes?|pillows?|phone[-\s]?cases?|shower[-\s]?curtains?)\b/gi, 'illustration'],
    [/\b(mockups?|product[-\s]?mockups?|apparel|garments?|clothing|fabric|hangers?|mannequins?)\b/gi, ''],
    [/\b(printed on|design on|graphic on|placed on)\s+(a|an|the)?\s*(shirt|tee|hoodie|mug|tote|pillow|apparel)\b/gi, ''],
    [/\bon\s+(a|an|the)?\s*(shirt|tee|hoodie|mug|tote|pillow)\b/gi, ''],
  ];
  let out = text;
  for (const [re, replacement] of patterns) out = out.replace(re, replacement);
  // Collapse double spaces / orphaned punctuation left behind.
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  return out;
}

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

  const cleanedUser = sanitizeProductWords(imagePrompt.trim());
  let prompt = `${FLUX_SAFETY_PREFIX}\n\n${cleanedUser}`;
  if (opts.printReadyPrompt?.trim()) {
    prompt += `\n\nPrint notes: ${sanitizeProductWords(opts.printReadyPrompt.trim())}`;
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

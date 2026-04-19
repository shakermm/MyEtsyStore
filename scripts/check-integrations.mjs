// Live integration check for BanterWearCo.
// Usage: node scripts/check-integrations.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const pad = (s, n = 28) => (s + ' '.repeat(n)).slice(0, n);
const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m  ${m}`);
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33mWARN\x1b[0m ${m}`);
const info = (m) => console.log(`  ·    ${m}`);

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ---------- 1. Env presence ----------
section('Environment variables');
const env = {
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT?.trim(),
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY?.trim(),
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT?.trim(),
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION?.trim(),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim(),
  AZURE_FLUX_ENDPOINT: process.env.AZURE_FLUX_ENDPOINT?.trim(),
  AZURE_FLUX_API_KEY: process.env.AZURE_FLUX_API_KEY?.trim(),
  AZURE_FLUX_MODEL: process.env.AZURE_FLUX_MODEL?.trim(),
  PRINTIFY_API_TOKEN: process.env.PRINTIFY_API_TOKEN?.trim(),
  PRINTIFY_SHOP_ID: process.env.PRINTIFY_SHOP_ID?.trim(),
  PRINTIFY_PRINT_PROVIDER_ID_PREFERRED: process.env.PRINTIFY_PRINT_PROVIDER_ID_PREFERRED?.trim(),
};
for (const [k, v] of Object.entries(env)) {
  const shown = v ? (k.includes('KEY') || k.includes('TOKEN') ? `${v.slice(0, 4)}…${v.slice(-4)} (len ${v.length})` : v) : '(unset)';
  console.log(`  ${pad(k, 40)} ${shown}`);
}

// ---------- 2. Azure OpenAI (or OpenAI) ----------
section('LLM (Azure OpenAI / OpenAI)');
try {
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT) {
    const ver = env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    const base = env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
    const url = `${base}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${ver}`;
    info(`POST ${url}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': env.AZURE_OPENAI_API_KEY },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      const j = JSON.parse(text);
      const reply = j?.choices?.[0]?.message?.content?.trim();
      ok(`Azure OpenAI responded (HTTP ${res.status}) → ${JSON.stringify(reply)}`);
    } else {
      bad(`Azure OpenAI HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
  } else if (env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    const text = await res.text();
    if (res.ok) ok(`OpenAI.com models endpoint reachable (HTTP ${res.status})`);
    else bad(`OpenAI.com HTTP ${res.status}: ${text.slice(0, 400)}`);
  } else {
    bad('No LLM configured.');
  }
} catch (e) {
  bad(`LLM error: ${e.message}`);
}

// ---------- 3. Azure FLUX (auth-only probe, no image generated) ----------
section('Azure FLUX.2-pro (auth probe, no billable image)');
try {
  if (!env.AZURE_FLUX_ENDPOINT || !env.AZURE_FLUX_API_KEY) {
    bad('FLUX not configured.');
  } else {
    const base = env.AZURE_FLUX_ENDPOINT.replace(/\/$/, '');
    const url = base.includes('api-version=')
      ? base
      : `${base}${base.includes('?') ? '&' : '?'}api-version=preview`;
    info(`POST ${url} (empty body — expect 400/422 if auth OK, 401/403 if bad key)`);
    const tryAuth = async (headers) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
    let res = await tryAuth({ Authorization: `Bearer ${env.AZURE_FLUX_API_KEY}` });
    let mode = 'Bearer';
    if (res.status === 401 || res.status === 403) {
      res = await tryAuth({ 'api-key': env.AZURE_FLUX_API_KEY });
      mode = 'api-key';
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      bad(`FLUX auth rejected (HTTP ${res.status}) — key invalid or endpoint wrong: ${text.slice(0, 300)}`);
    } else if (res.status === 400 || res.status === 422) {
      ok(`FLUX auth passed via ${mode} header (HTTP ${res.status} on empty body — expected).`);
    } else if (res.ok) {
      ok(`FLUX returned ${res.status} via ${mode} (unexpected success on empty body).`);
    } else {
      warn(`FLUX HTTP ${res.status} via ${mode}: ${text.slice(0, 300)}`);
    }
  }
} catch (e) {
  bad(`FLUX error: ${e.message}`);
}

// ---------- 4. Printify ----------
section('Printify');
try {
  if (!env.PRINTIFY_API_TOKEN) {
    bad('PRINTIFY_API_TOKEN missing.');
  } else {
    const headers = { Authorization: `Bearer ${env.PRINTIFY_API_TOKEN}`, 'User-Agent': 'MyEtsyStore/check' };
    const shopsRes = await fetch('https://api.printify.com/v1/shops.json', { headers });
    const shopsText = await shopsRes.text();
    if (!shopsRes.ok) {
      bad(`Printify /shops.json HTTP ${shopsRes.status}: ${shopsText.slice(0, 300)}`);
    } else {
      const shops = JSON.parse(shopsText);
      ok(`Printify token valid. ${shops.length} shop(s): ${shops.map((s) => `${s.id} ${s.title} [${s.sales_channel}]`).join(' | ')}`);
      if (env.PRINTIFY_SHOP_ID) {
        const match = shops.find((s) => String(s.id) === env.PRINTIFY_SHOP_ID);
        if (match) ok(`PRINTIFY_SHOP_ID matches shop "${match.title}" (${match.sales_channel}).`);
        else bad(`PRINTIFY_SHOP_ID=${env.PRINTIFY_SHOP_ID} not found in token's shops.`);

        // Probe shop products endpoint too
        const prodRes = await fetch(`https://api.printify.com/v1/shops/${env.PRINTIFY_SHOP_ID}/products.json?limit=1`, { headers });
        if (prodRes.ok) ok(`Shop products endpoint reachable (HTTP ${prodRes.status}).`);
        else bad(`Shop products HTTP ${prodRes.status}: ${(await prodRes.text()).slice(0, 300)}`);
      } else {
        warn('PRINTIFY_SHOP_ID not set.');
      }
    }
  }
} catch (e) {
  bad(`Printify error: ${e.message}`);
}

console.log('\nDone.');

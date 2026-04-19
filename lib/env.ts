import 'server-only';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export interface EnvStatus {
  llm: boolean;
  flux: boolean;
  printify: boolean;
  printifyShopId?: string;
  printifyProviderPreference?: number;
  fluxDailyCap: number;
}

export function envStatus(): EnvStatus {
  const llm = Boolean(
    (process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT) ||
      process.env.OPENAI_API_KEY
  );
  const flux = Boolean(process.env.AZURE_FLUX_ENDPOINT && process.env.AZURE_FLUX_API_KEY);
  const printify = Boolean(process.env.PRINTIFY_API_TOKEN && process.env.PRINTIFY_SHOP_ID);

  return {
    llm,
    flux,
    printify,
    printifyShopId: process.env.PRINTIFY_SHOP_ID?.trim(),
    printifyProviderPreference: process.env.PRINTIFY_PRINT_PROVIDER_ID_PREFERRED
      ? Number(process.env.PRINTIFY_PRINT_PROVIDER_ID_PREFERRED)
      : undefined,
    fluxDailyCap: Number(process.env.FLUX_DAILY_CAP || 15),
  };
}

export function requirePrintify(): { token: string; shopId: string } {
  const token = process.env.PRINTIFY_API_TOKEN?.trim();
  const shopId = process.env.PRINTIFY_SHOP_ID?.trim();
  if (!token || !shopId) {
    throw new Error('Printify not configured: set PRINTIFY_API_TOKEN and PRINTIFY_SHOP_ID in .env.local');
  }
  return { token, shopId };
}

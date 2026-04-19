/**
 * Repairs UTF-8/CP1252 mojibake, normalises Unicode punctuation to ASCII,
 * strips Etsy-banned chars ($, ^, `), collapses whitespace, and trims to 140.
 *
 * Canonical implementation — shared by src/ai.ts and lib/storage.ts.
 */
export function sanitizeEtsyTitle(raw: string): string {
  return raw
    // --- mojibake repair (UTF-8 decoded as CP1252 and re-encoded) -----------
    .replace(/â€™/g, "'")      // U+2019 right single quote
    .replace(/â€˜/g, "'")      // U+2018 left single quote
    .replace(/â€œ/g, '"')      // U+201C left double quote
    .replace(/â€\u009d/g, '"') // U+201D right double quote
    .replace(/â€/g, '"')       // fallback for stripped U+201D
    .replace(/â€"/g, '-')      // em/en dash mojibake
    .replace(/â€"/g, '-')      // U+2013 en dash
    .replace(/â€"/g, '-')      // U+2014 em dash
    .replace(/â€¦/g, '...')    // U+2026 ellipsis
    .replace(/Ã©/g, 'e').replace(/Ã¨/g, 'e').replace(/Ã /g, 'a') // accented mojibake
    // --- real Unicode smart punctuation -------------------------------------
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2026]/g, '...')
    // --- Etsy-banned characters ---------------------------------------------
    .replace(/[`$^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

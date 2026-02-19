/**
 * Extract numeric listing ID from a BizBuySell URL.
 * e.g. "https://www.bizbuysell.com/business-opportunity/.../2433900/" → "2433900"
 */
export function extractIdFromUrl(url) {
  const m = url.match(/\/(\d+)\/?$/);
  if (!m) throw new Error(`Could not extract listing id from URL: ${url}`);
  return m[1];
}

/**
 * Parse a money string like "$1,250,000" into a number (1250000).
 * Returns null if unparseable.
 */
export function parseMoneyToNumber(s) {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

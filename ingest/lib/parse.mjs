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
  // Strip parenthetical suffixes like "(24.45%)" before parsing
  const stripped = s.replace(/\s*\([^)]*\)/g, "").trim();
  // Detect K/M suffix before stripping non-numeric characters
  const suffix = stripped.match(/(\d)\s*([KkMm])\b/);
  const cleaned = stripped.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (suffix) {
    const s = suffix[2].toUpperCase();
    if (s === "K") n *= 1000;
    if (s === "M") n *= 1000000;
  }
  return n;
}

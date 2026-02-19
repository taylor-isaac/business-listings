/**
 * Wait a random duration between min and max milliseconds.
 */
export function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scroll the page in random increments to mimic human reading behavior.
 */
export async function humanScroll(page) {
  const scrolls = 2 + Math.floor(Math.random() * 4); // 2–5 scrolls
  for (let i = 0; i < scrolls; i++) {
    const distance = 200 + Math.floor(Math.random() * 400); // 200–600px
    await page.evaluate((d) => window.scrollBy(0, d), distance);
    await randomDelay(300, 800);
  }
}

/** Delay between detail page visits: 5–10 seconds */
export const detailDelay = () => randomDelay(5000, 10000);

/** Delay between search result pages: 7–12 seconds */
export const searchDelay = () => randomDelay(7000, 12000);

/** Longer pause every N pages to avoid patterns */
export const longPause = () => randomDelay(20000, 40000);

/** How many pages before a long pause */
export const LONG_PAUSE_INTERVAL = 8;

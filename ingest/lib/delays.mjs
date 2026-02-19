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

/** Delay between detail page visits: 2–5 seconds */
export const detailDelay = () => randomDelay(2000, 5000);

/** Delay between search result pages: 3–7 seconds */
export const searchDelay = () => randomDelay(3000, 7000);

/** Longer pause every N pages to avoid patterns */
export const longPause = () => randomDelay(10000, 20000);

/** How many pages before a long pause */
export const LONG_PAUSE_INTERVAL = 10;

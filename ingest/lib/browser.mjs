import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomDelay, humanScroll } from "./delays.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = join(__dirname, "..", ".chrome-profile");

/**
 * Launch system Chrome with a persistent profile.
 * This avoids bot detection by behaving like a real user session.
 * Set HEADED=1 env var to see the browser window for debugging.
 */
export async function launchBrowser() {
  const headless = false;

  // launchPersistentContext uses a real user data dir — cookies, cache,
  // and session state persist across runs, just like a real browser.
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: "chrome",
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
    ],
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = context.pages()[0] || await context.newPage();

  // Warm up: visit homepage first to establish cookies/session
  console.log("[browser] Warming up — visiting homepage...");
  await page.goto("https://www.bizbuysell.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await randomDelay(3000, 6000);
  await humanScroll(page);
  await randomDelay(2000, 4000);

  // Click cookie/consent banner if present
  try {
    const consentBtn = await page.$('button[id*="accept"], button[class*="accept"], .cookie-banner button, #onetrust-accept-btn-handler');
    if (consentBtn) {
      await consentBtn.click();
      await randomDelay(500, 1000);
    }
  } catch { /* no consent banner */ }

  console.log("[browser] Warm-up complete.");
  return { browser: context, context, page };
}

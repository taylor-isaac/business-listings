import { humanScroll, randomDelay, searchDelay, longPause, LONG_PAUSE_INTERVAL } from "./delays.mjs";

const MAX_PAGE = 30;

/**
 * Build the BizBuySell search URL with gross revenue filter ($750K–$1M).
 * The q= parameter is base64-encoded filter params.
 */
function buildSearchUrl(pageNum) {
  const params = "gifrom=750000&gito=1000000";
  const q = Buffer.from(params).toString("base64");
  const pagePath = pageNum > 1 ? `${pageNum}/` : "";
  return `https://www.bizbuysell.com/businesses-for-sale/${pagePath}?q=${encodeURIComponent(q)}`;
}

/**
 * Extract listing URLs from a search results page.
 */
async function extractListingUrls(page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/business-opportunity/"]');
    const urls = new Set();
    for (const link of links) {
      const href = link.href;
      // Only include full listing URLs (not fragments, not javascript:)
      if (href.match(/\/business-opportunity\/[^/]+\/\d+\/?$/)) {
        urls.add(href.replace(/\/$/, "") + "/");
      }
    }
    return [...urls];
  });
}

/**
 * Collect all listing URLs across paginated search results.
 * Returns a deduplicated array of listing URLs.
 */
export async function collectListingUrls(page) {
  const allUrls = new Set();
  let pageNum = 1;

  while (pageNum <= MAX_PAGE) {
    const url = buildSearchUrl(pageNum);
    console.log(`[search] Page ${pageNum}: ${url}`);

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Check for access denied / block
    if (response && (response.status() === 403 || response.status() === 503)) {
      const bodyText = await page.textContent("body").catch(() => "");
      if (bodyText.includes("Access Denied") || bodyText.includes("blocked")) {
        console.log(`[search] Blocked on page ${pageNum}. Waiting 60s and retrying...`);
        await randomDelay(60000, 90000);
        continue;
      }
    }
    await humanScroll(page);

    const urls = await extractListingUrls(page);

    if (urls.length === 0) {
      console.log(`[search] No listings found on page ${pageNum}, stopping.`);
      break;
    }

    const before = allUrls.size;
    for (const u of urls) allUrls.add(u);
    const newCount = allUrls.size - before;
    console.log(`[search] Found ${urls.length} listings (${newCount} new). Total: ${allUrls.size}`);

    // Check for "next page" link — stop if it doesn't exist
    const hasNext = await page.$('a[class*="next"], a[rel="next"], .pagerNext a');
    if (!hasNext) {
      console.log(`[search] No next page link found, stopping.`);
      break;
    }

    pageNum++;

    // Long pause every N pages
    if ((pageNum - 1) % LONG_PAUSE_INTERVAL === 0) {
      console.log(`[search] Long pause after ${pageNum - 1} pages...`);
      await longPause();
    } else {
      await searchDelay();
    }
  }

  console.log(`[search] Collection complete: ${allUrls.size} unique listing URLs.`);
  return [...allUrls];
}

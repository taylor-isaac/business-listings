import { launchBrowser } from "./lib/browser.mjs";
import { collectListingUrls } from "./lib/search.mjs";
import { extractListingData } from "./lib/detail.mjs";
import { batchUpsert } from "./lib/supabase.mjs";
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from "./lib/checkpoint.mjs";
import { detailDelay, longPause, LONG_PAUSE_INTERVAL } from "./lib/delays.mjs";
import { extractSignals } from "./lib/signals.mjs";
import { calculateScore } from "./lib/weights.mjs";
import { validateExtraction } from "./lib/validate.mjs";

const MAX_RETRIES = 3;
const UPSERT_BATCH_SIZE = 5;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000; // 30 min safety net
const BROWSER_CLOSE_TIMEOUT_MS = 15_000;    // 15s to close browser

async function retry(fn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(`[retry] ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      // Detect CAPTCHA, block, or server error
      if (err.message?.includes("captcha") || err.message?.includes("blocked") || err.message?.includes("403")) {
        console.error(`[retry] Possible CAPTCHA/block detected. Waiting 60s before retry...`);
        await new Promise((r) => setTimeout(r, 60000));
      } else if (err.message?.includes("500") || err.message?.includes("ERR_HTTP_RESPONSE_CODE_FAILURE")) {
        const wait = 30000 + attempt * 15000;
        console.error(`[retry] Server error (500). Waiting ${wait / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, wait));
      } else if (!isLast) {
        const backoff = attempt * 10000;
        await new Promise((r) => setTimeout(r, backoff));
      }

      if (isLast) throw err;
    }
  }
}

async function main() {
  console.log("=== BizBuySell Scraper ===");
  console.log(`Started at ${new Date().toISOString()}`);

  const checkpoint = loadCheckpoint();
  console.log(`[checkpoint] Phase: ${checkpoint.phase}, collected: ${checkpoint.collectedUrls.length}, completed: ${checkpoint.completedUrls.length}`);

  const { browser, page } = await launchBrowser();

  try {
    // --- Phase 1: Collect listing URLs ---
    let urls;
    if (checkpoint.phase === "collect" || checkpoint.collectedUrls.length === 0) {
      console.log("\n--- Phase 1: Collecting listing URLs ---");
      urls = await retry(() => collectListingUrls(page), "collect-urls");

      checkpoint.collectedUrls = urls;
      checkpoint.phase = "extract";
      saveCheckpoint(checkpoint);
      console.log(`[checkpoint] Saved ${urls.length} URLs to checkpoint.`);
    } else {
      urls = checkpoint.collectedUrls;
      console.log(`[checkpoint] Resuming with ${urls.length} collected URLs.`);
    }

    // --- Phase 2: Visit each detail page, extract data, upsert ---
    console.log("\n--- Phase 2: Extracting listing data ---");
    const completedSet = new Set(checkpoint.completedUrls);
    const pending = urls.filter((u) => !completedSet.has(u));
    console.log(`[extract] ${pending.length} listings to process (${completedSet.size} already done).`);

    const buffer = [];
    let processed = 0;
    let errors = 0;

    for (const url of pending) {
      processed++;
      try {
        const data = await retry(() => extractListingData(page, url), `detail:${url}`);
        const extracted = extractSignals(data.description_text, data);
        validateExtraction(data, extracted);
        const { index_score } = calculateScore({ ...data, ...extracted });
        buffer.push({ ...data, index_score });
        console.log(`[extract] (${processed}/${pending.length}) ${data.source_listing_id} — ${data.state || "?"} — $${data.gross_revenue?.toLocaleString() || "?"}`);

        // Check for CAPTCHA indicators
        const pageTitle = await page.title();
        if (pageTitle.toLowerCase().includes("captcha") || pageTitle.toLowerCase().includes("blocked")) {
          throw new Error("CAPTCHA/block detected on page title");
        }
      } catch (err) {
        console.error(`[extract] Failed: ${url} — ${err.message}`);
        errors++;
        // Save checkpoint on any error
        saveCheckpoint(checkpoint);
        continue;
      }

      // Batch upsert every N rows
      if (buffer.length >= UPSERT_BATCH_SIZE) {
        await batchUpsert(buffer);
        // Mark as completed
        for (const row of buffer) checkpoint.completedUrls.push(row.url);
        saveCheckpoint(checkpoint);
        buffer.length = 0;
      }

      // Rate limiting
      if (processed % LONG_PAUSE_INTERVAL === 0) {
        console.log(`[extract] Long pause after ${processed} listings...`);
        await longPause();
      } else {
        await detailDelay();
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      await batchUpsert(buffer);
      for (const row of buffer) checkpoint.completedUrls.push(row.url);
      saveCheckpoint(checkpoint);
    }

    // --- Phase 3: Report results ---
    console.log("\n--- Phase 3: Results ---");
    console.log(`Total URLs collected: ${urls.length}`);
    console.log(`Successfully processed: ${checkpoint.completedUrls.length}`);
    console.log(`Errors: ${errors}`);
    console.log(`Finished at ${new Date().toISOString()}`);

    clearCheckpoint();
    console.log("[checkpoint] Cleared.");
  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    saveCheckpoint(checkpoint);
    console.error("[checkpoint] Progress saved. Re-run to resume.");
    process.exitCode = 1;
  } finally {
    // Force-close browser with a timeout so a hung Chrome doesn't keep Node alive
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("browser.close() timed out")), BROWSER_CLOSE_TIMEOUT_MS)
        ),
      ]);
    } catch (closeErr) {
      console.error(`[cleanup] ${closeErr.message} — forcing exit`);
    }
  }
}

// Safety net: kill the process if it hangs beyond the timeout
const killTimer = setTimeout(() => {
  console.error(`[TIMEOUT] Process exceeded ${PROCESS_TIMEOUT_MS / 60000}min safety limit — forcing exit`);
  process.exit(2);
}, PROCESS_TIMEOUT_MS);
killTimer.unref(); // don't let this timer alone keep Node alive

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(`[FATAL] Unhandled: ${err.message}`);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Debug scraper — loads a single BizBuySell URL using the stealth browser
 * and dumps structured field data so we can see exactly how Cash Flow,
 * EBITDA, etc. are rendered on the page.
 *
 * Usage:  node debug-scrape.mjs <url>
 */

import { launchBrowser } from "./lib/browser.mjs";
import { extractListingData } from "./lib/detail.mjs";
import { extractSignals } from "./lib/signals.mjs";
import { humanScroll } from "./lib/delays.mjs";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node debug-scrape.mjs <bizbuysell-url>");
  process.exit(1);
}

async function main() {
  console.log(`[debug] Loading: ${url}\n`);

  const { browser, page } = await launchBrowser();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanScroll(page);

    const data = await page.evaluate(() => {
      const result = {};

      // 1. All dt/dd pairs on the page
      const dtDdPairs = [];
      for (const dt of document.querySelectorAll("dt")) {
        const dd = dt.nextElementSibling;
        dtDdPairs.push({
          dt: dt.textContent.trim(),
          dd: dd?.tagName === "DD" ? dd.textContent.trim() : "(no dd sibling)",
        });
      }
      result.dtDdPairs = dtDdPairs;

      // 2. Structured field spans (BizBuySell selectors)
      const spanSelectors = [
        ".listingProfile_details span",
        ".details-item",
        ".bfsListing_headerRow span",
        ".listingProfile_header span",
        ".financial-details span",
        ".price span",
        "[class*='detail'] span",
        "[class*='Detail'] span",
        "[class*='financial'] span",
        "[class*='Financial'] span",
      ];
      const spans = {};
      for (const sel of spanSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          spans[sel] = [...els].map(el => el.textContent.trim()).filter(Boolean);
        }
      }
      result.structuredSpans = spans;

      // 3. Full page innerText around financial keywords
      const allText = document.body.innerText;
      const keywords = ["Cash Flow", "SDE", "EBITDA", "Asking Price", "Gross Revenue", "Revenue", "Inventory", "FF&E"];
      const contextSnippets = {};
      for (const kw of keywords) {
        const idx = allText.toLowerCase().indexOf(kw.toLowerCase());
        if (idx !== -1) {
          // Show 50 chars before and 80 chars after the keyword
          const start = Math.max(0, idx - 50);
          const end = Math.min(allText.length, idx + kw.length + 80);
          contextSnippets[kw] = allText.slice(start, end).replace(/\n/g, "\\n");
        } else {
          contextSnippets[kw] = "(NOT FOUND in page text)";
        }
      }
      result.contextSnippets = contextSnippets;

      // 4. Run the same extractLabeledMoney function to see what it gets
      function extractLabeledMoney(text, label) {
        const re = new RegExp(
          label + "\\)?(?:\\s*\\([^)]*\\))?(?:\\s+(?:of|is|was|at))?[:\\s]*~?\\s*\\$([0-9,.]+)(K|M)?",
          "i"
        );
        const m = text.match(re);
        if (!m) return { matched: false, label };
        let raw = m[1].replace(/,/g, "");
        let num = parseFloat(raw);
        if (m[2]?.toUpperCase() === "K") num *= 1000;
        if (m[2]?.toUpperCase() === "M") num *= 1000000;
        return { matched: true, label, fullMatch: m[0], value: "$" + Math.round(num).toLocaleString("en-US") };
      }

      result.extractionResults = {
        "Cash Flow": extractLabeledMoney(allText, "Cash Flow"),
        "SDE": extractLabeledMoney(allText, "SDE"),
        "Seller's Discretionary Earnings": extractLabeledMoney(allText, "Seller'?s Discretionary Earnings"),
        "EBITDA": extractLabeledMoney(allText, "EBITDA"),
        "Asking Price": extractLabeledMoney(allText, "Asking Price"),
        "Gross Revenue": extractLabeledMoney(allText, "Gross Revenue"),
        "Revenue": extractLabeledMoney(allText, "Revenue"),
      };

      // 5. Dump all text within 500 chars of "Cash Flow" for full context
      const cfIdx = allText.toLowerCase().indexOf("cash flow");
      if (cfIdx !== -1) {
        const start = Math.max(0, cfIdx - 100);
        const end = Math.min(allText.length, cfIdx + 500);
        result.cashFlowFullContext = allText.slice(start, end);
      } else {
        result.cashFlowFullContext = "(Cash Flow not found anywhere on page)";
      }

      // 6. Description text (same selectors as detail.mjs)
      const descSelectors = [
        ".businessDescription", "#businessDescription",
        ".listingProfile_description", ".bfsListing_mainBody",
        "[class*='description']", "[class*='Description']",
        "[id*='description']", "[id*='Description']",
        ".listing-description", ".business-description",
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 50) {
          result.descriptionSelector = sel;
          result.descriptionPreview = el.innerText.trim().slice(0, 300);
          break;
        }
      }

      return result;
    });

    // Pretty-print results
    console.log("=== DT/DD PAIRS ===");
    if (data.dtDdPairs.length === 0) {
      console.log("  (none found)");
    }
    for (const { dt, dd } of data.dtDdPairs) {
      console.log(`  "${dt}" → "${dd}"`);
    }

    console.log("\n=== STRUCTURED SPANS ===");
    for (const [sel, texts] of Object.entries(data.structuredSpans)) {
      console.log(`  ${sel}:`);
      for (const t of texts) {
        console.log(`    "${t}"`);
      }
    }

    console.log("\n=== KEYWORD CONTEXT (innerText around each keyword) ===");
    for (const [kw, snippet] of Object.entries(data.contextSnippets)) {
      console.log(`  [${kw}]: ...${snippet}...`);
    }

    console.log("\n=== EXTRACTION RESULTS (extractLabeledMoney) ===");
    for (const [label, result] of Object.entries(data.extractionResults)) {
      if (result.matched) {
        console.log(`  ${label}: ${result.value}  (matched: "${result.fullMatch}")`);
      } else {
        console.log(`  ${label}: NO MATCH`);
      }
    }

    console.log("\n=== CASH FLOW FULL CONTEXT (500 chars) ===");
    console.log(data.cashFlowFullContext);

    console.log("\n=== DESCRIPTION ===");
    if (data.descriptionSelector) {
      console.log(`  Selector: ${data.descriptionSelector}`);
      console.log(`  Preview: ${data.descriptionPreview}...`);
    } else {
      console.log("  (no description found)");
    }

    // 7. Run the ACTUAL extraction pipeline (detail.mjs + signals.mjs)
    console.log("\n=== FULL EXTRACTION PIPELINE (detail.mjs) ===");
    const listing = await extractListingData(page, url);
    const webColumns = {
      "Industry":           listing.industry,
      "State":              listing.state,
      "Asking Price":       listing.asking_price,
      "Revenue":            listing.gross_revenue,
      "Cash Flow (SDE)":    listing.cash_flow_sde,
      "EBITDA":             listing.ebitda,
      "Employees":          listing.num_employees,
      "Owner Involvement":  listing.owner_involvement,
      "SBA Pre-qualified":  listing.sba_preapproval,
      "Recurring Revenue":  listing.has_recurring_revenue,
      "Years in Business":  listing.num_years,
    };
    for (const [col, val] of Object.entries(webColumns)) {
      const status = val == null ? "MISSING" : "OK";
      const display = val == null ? "null" : val;
      console.log(`  ${status.padEnd(7)} ${col.padEnd(20)} ${display}`);
    }

    console.log("\n=== SIGNAL EXTRACTION (signals.mjs) ===");
    const signals = extractSignals(listing.description_text, listing);
    for (const [key, val] of Object.entries(signals)) {
      const status = val == null ? "MISSING" : "OK";
      const display = val == null ? "null" : val;
      console.log(`  ${status.padEnd(7)} ${key.padEnd(30)} ${display}`);
    }

    // Check for enrichment
    if (listing.description_text?.includes("Reason for Selling:")) {
      console.log("\n  (description_text was enriched with structured 'Reason for Selling' field)");
    }

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});

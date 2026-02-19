import { createHash } from "node:crypto";
import { parseMoneyToNumber, extractIdFromUrl } from "./parse.mjs";
import { humanScroll } from "./delays.mjs";

/**
 * Extract listing data from a BizBuySell detail page using DOM parsing.
 * Returns a row object ready for Supabase upsert.
 */
export async function extractListingData(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await humanScroll(page);

  const raw = await page.evaluate(() => {
    const result = {};

    // --- JSON-LD structured data (most stable source for location/industry) ---
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data["@type"] === "Product" || data["@type"] === "LocalBusiness") {
          if (data.address) {
            result.state = data.address.addressRegion || null;
          }
          if (data.category) {
            result.industry = data.category;
          }
        }
        // Also check for BreadcrumbList for industry
        if (data["@type"] === "BreadcrumbList" && data.itemListElement) {
          const items = data.itemListElement;
          // Industry is typically the 2nd or 3rd breadcrumb
          for (const item of items) {
            if (item.item?.name && !["Home", "Businesses For Sale"].includes(item.item.name)) {
              result.industry = result.industry || item.item.name;
            }
          }
        }
      } catch { /* skip malformed JSON-LD */ }
    }

    // --- Helper: find text in dt/dd or label/value pairs ---
    function findValue(label) {
      // Try dt/dd pattern
      const dts = document.querySelectorAll("dt");
      for (const dt of dts) {
        if (dt.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === "DD") return dd.textContent.trim();
        }
      }
      // Try span/label pattern common in BizBuySell
      const spans = document.querySelectorAll(".listingProfile_details span, .details-item, .bfsListing_headerRow span");
      for (const span of spans) {
        if (span.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
          // Value might be in a sibling or adjacent element
          const parent = span.closest("div, li, tr");
          if (parent) {
            const valueEl = parent.querySelector(".price, .value, b, strong") ||
                           parent.querySelector("span:last-child");
            if (valueEl && valueEl !== span) return valueEl.textContent.trim();
          }
          // Or just the rest of the parent text
          const parentText = span.parentElement?.textContent.trim() || "";
          const afterLabel = parentText.split(label).pop()?.replace(/^[:\s]+/, "").trim();
          if (afterLabel) return afterLabel;
        }
      }
      return null;
    }

    // --- Financial details ---
    // Primary: look in the listing header/details section
    const allText = document.body.innerText;

    function extractLabeledMoney(text, label) {
      const re = new RegExp(label + "[:\\s]*\\$([0-9,]+)", "i");
      const m = text.match(re);
      return m ? "$" + m[1] : null;
    }

    result.asking_price_raw = extractLabeledMoney(allText, "Asking Price") || findValue("Asking Price");
    result.cash_flow_sde_raw = extractLabeledMoney(allText, "Cash Flow") || findValue("Cash Flow");
    result.gross_revenue_raw = extractLabeledMoney(allText, "Gross Revenue") || findValue("Gross Revenue");
    result.ebitda_raw = extractLabeledMoney(allText, "EBITDA") || findValue("EBITDA");
    result.inventory_raw = findValue("Inventory");
    result.ffe_raw = extractLabeledMoney(allText, "FF&E") || extractLabeledMoney(allText, "Furniture") || findValue("FF&E");
    result.num_employees_raw = findValue("Employees") || findValue("Number of Employees");
    result.num_years_raw = findValue("Year Established") || findValue("Years");
    result.support_training_raw = findValue("Support") || findValue("Training");
    result.sba_preapproval_raw = findValue("SBA") || findValue("Pre-Qualified");

    // State fallback: look for state in the header breadcrumb area
    if (!result.state) {
      const bcLinks = document.querySelectorAll(".breadcrumb a, .bcLinks a");
      for (const a of bcLinks) {
        const text = a.textContent.trim();
        // US state abbreviations are 2 uppercase letters
        if (/^[A-Z]{2}$/.test(text)) {
          result.state = text;
        }
      }
    }

    // --- Description text ---
    // The main listing description is typically in a specific container
    const descEl = document.querySelector(
      ".businessDescription, #businessDescription, .listingProfile_description, .bfsListing_mainBody"
    );
    result.description_text = descEl
      ? descEl.innerText.trim()
      : null;

    // Fallback: if no dedicated element found, grab a reasonable chunk from the page
    if (!result.description_text) {
      // Look for the largest <p> or <div> block that looks like a description
      const paragraphs = document.querySelectorAll("p, .description");
      let longest = "";
      for (const p of paragraphs) {
        const t = p.innerText.trim();
        if (t.length > longest.length && t.length > 100) longest = t;
      }
      if (longest) result.description_text = longest;
    }

    // --- Owner involvement signal ---
    const descLower = (result.description_text || allText).toLowerCase();
    const ownerPatterns = [
      { pattern: /absentee\s*owner/,       label: "absentee owner" },
      { pattern: /semi[- ]?absentee/,       label: "semi-absentee" },
      { pattern: /manager[- ]?run/,          label: "manager run" },
      { pattern: /manager\s+in\s+place/,     label: "manager in place" },
      { pattern: /management\s+in\s+place/,  label: "management in place" },
      { pattern: /owner[- ]?operated/,        label: "owner operated" },
      { pattern: /owner[- ]?involved/,        label: "owner involved" },
      { pattern: /hands[- ]?on\s+owner/,      label: "hands-on owner" },
      { pattern: /run\s+by\s+(the\s+)?owner/, label: "owner operated" },
    ];
    result.owner_involvement = null;
    for (const { pattern, label } of ownerPatterns) {
      if (pattern.test(descLower)) {
        result.owner_involvement = label;
        break;
      }
    }

    // --- Recurring revenue signal ---
    const recurringPatterns = /recurring|subscription|contract\s+revenue|repeat\s+customers?|monthly\s+contracts?|annual\s+contracts?|(?:^|\W)mrr(?:\W|$)|(?:^|\W)arr(?:\W|$)|recurring\s+revenue|contracted\s+revenue|retainer/i;
    result.has_recurring_revenue = recurringPatterns.test(descLower);

    // Full text for content hash
    result._fullText = allText;

    return result;
  });

  // Parse money values on the Node side
  const sourceListingId = extractIdFromUrl(url);

  // Compute content hash from the full page text
  const contentHash = createHash("sha256")
    .update(raw._fullText || "")
    .digest("hex");

  // Parse year established → num_years
  let numYears = null;
  if (raw.num_years_raw) {
    const yearMatch = raw.num_years_raw.match(/(\d{4})/);
    if (yearMatch) {
      numYears = new Date().getFullYear() - parseInt(yearMatch[1], 10);
    } else {
      const numMatch = raw.num_years_raw.match(/(\d+)/);
      if (numMatch) numYears = parseInt(numMatch[1], 10);
    }
  }

  // Parse employee count
  let numEmployees = null;
  if (raw.num_employees_raw) {
    const m = raw.num_employees_raw.match(/(\d+)/);
    if (m) numEmployees = parseInt(m[1], 10);
  }

  return {
    source: "bizbuysell",
    source_listing_id: sourceListingId,
    url,
    state: raw.state || null,
    industry: raw.industry || null,
    asking_price: parseMoneyToNumber(raw.asking_price_raw),
    cash_flow_sde: parseMoneyToNumber(raw.cash_flow_sde_raw),
    gross_revenue: parseMoneyToNumber(raw.gross_revenue_raw),
    ebitda: parseMoneyToNumber(raw.ebitda_raw),
    inventory: parseMoneyToNumber(raw.inventory_raw),
    ffe: parseMoneyToNumber(raw.ffe_raw),
    num_employees: numEmployees,
    num_years: numYears,
    support_training: raw.support_training_raw || null,
    sba_preapproval: raw.sba_preapproval_raw || null,
    description_text: raw.description_text || null,
    owner_involvement: raw.owner_involvement || null,
    has_recurring_revenue: raw.has_recurring_revenue || false,
    content_hash: contentHash,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };
}

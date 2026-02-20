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
      const spans = document.querySelectorAll(".listingProfile_details span, .details-item, .bfsListing_headerRow span, .price span, [class*='financial'] span, [class*='Financial'] span");
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
      // Match patterns like:
      //   "Cash Flow: $178,000"   "SDE: ~$178K"   "SDE of ~$178K"
      //   "Revenue $1.2M"         "EBITDA: $250,000"
      //   "Seller's Discretionary Earnings (SDE): ~$290,000"
      //   "(SDE): ~$290,000"  (label found inside parens)
      const re = new RegExp(
        label + "\\)?(?:\\s*\\([^)]*\\))?(?:\\s+(?:of|is|was|at))?[:\\s]*~?\\s*\\$([0-9,.]+)(K|M)?",
        "i"
      );
      const m = text.match(re);
      if (!m) return null;
      let raw = m[1].replace(/,/g, "");
      let num = parseFloat(raw);
      if (m[2]?.toUpperCase() === "K") num *= 1000;
      if (m[2]?.toUpperCase() === "M") num *= 1000000;
      return "$" + Math.round(num).toLocaleString("en-US");
    }

    result.asking_price_raw = extractLabeledMoney(allText, "Asking Price") || findValue("Asking Price");
    result.cash_flow_sde_raw =
      extractLabeledMoney(allText, "Cash Flow") ||
      extractLabeledMoney(allText, "SDE") ||
      extractLabeledMoney(allText, "Seller'?s Discretionary Earnings") ||
      findValue("Cash Flow") ||
      findValue("SDE");
    result.gross_revenue_raw = extractLabeledMoney(allText, "Gross Revenue") || extractLabeledMoney(allText, "Revenue") || findValue("Gross Revenue");
    result.ebitda_raw = extractLabeledMoney(allText, "EBITDA") || findValue("EBITDA");
    result.inventory_raw = findValue("Inventory");
    result.ffe_raw = extractLabeledMoney(allText, "FF&E") || extractLabeledMoney(allText, "Furniture") || findValue("FF&E");
    result.num_employees_raw = findValue("Employees") || findValue("Number of Employees");
    result.support_training_raw = findValue("Support") || findValue("Training");

    // --- Year / num_years extraction ---
    result.num_years_raw = findValue("Year Established") || findValue("Established") || findValue("Years in Business") || findValue("Years");
    if (!result.num_years_raw) {
      // "Established in 2006" / "Founded in 1984" / "Operating since 2010"
      // "Established: 1930" / "Year Established: 1984" (colon-separated)
      const estMatch = allText.match(/(?:established|founded|operating|in business)[:\s]+(?:in\s+|since\s+)?(\d{4})/i);
      if (estMatch) result.num_years_raw = estMatch[1];
    }
    if (!result.num_years_raw) {
      // "Established in the 1980s" / "Established: the 1930s" → use decade start
      const decadeMatch = allText.match(/(?:established|founded|operating|in business)[:\s]+(?:in\s+)?(?:the\s+)?(\d{4})s/i);
      if (decadeMatch) result.num_years_raw = decadeMatch[1];
    }
    if (!result.num_years_raw) {
      // "since the 1930s" / "since 1984" — standalone "since" without established/founded prefix
      const sinceMatch = allText.match(/since\s+(?:the\s+)?(\d{4})s?/i);
      if (sinceMatch) result.num_years_raw = sinceMatch[1];
    }
    if (!result.num_years_raw) {
      // "20 years in business" / "15+ years established"
      const yrsMatch = allText.match(/(\d{1,3})\+?\s*(?:years?|yrs?)[\s-]+(?:in business|established|old|operating|of (?:operating|business))/i);
      if (yrsMatch) result.num_years_raw = yrsMatch[1] + " years";
    }
    if (!result.num_years_raw) {
      // "nearly 20 years" / "over 30 years" / "approximately 15 years"
      const approxMatch = allText.match(/(?:nearly|over|approximately|about|almost)\s+(\d{1,3})\s*(?:years?|yrs?)/i);
      if (approxMatch) result.num_years_raw = approxMatch[1] + " years";
    }
    if (!result.num_years_raw) {
      // "open for 12 years" / "operating for 25 years"
      const forMatch = allText.match(/(?:open|operating|in business|running)\s+for\s+(\d{1,3})\+?\s*(?:years?|yrs?)/i);
      if (forMatch) result.num_years_raw = forMatch[1] + " years";
    }

    // --- SBA pre-approval (search description text, not just DOM) ---
    result.sba_preapproval_raw = findValue("SBA") || findValue("Pre-Qualified");
    if (!result.sba_preapproval_raw) {
      const sbaPatterns = [
        /SBA\s+pre[- ]?(?:qualifi|approv)\w*/i,
        /pre[- ]?(?:qualifi|approv)\w*\s+(?:for\s+)?SBA/i,
        /(?:eligible|approved)\s+for\s+SBA\s+(?:financing|loan)/i,
        /SBA\s+financing\s+(?:available|eligible)/i,
        /SBA\s+(?:loan|lending)\s+(?:available|eligible|ready)/i,
      ];
      for (const pat of sbaPatterns) {
        const m = allText.match(pat);
        if (m) { result.sba_preapproval_raw = m[0]; break; }
      }
    }

    // State fallback 1: look for state in the header breadcrumb area
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

    // State fallback 2: extract from description/page text
    // Only match full state names (3+ chars) to avoid "IN"/"OR" false positives,
    // or 2-letter abbreviations only when preceded by a comma or "in"/"of"
    if (!result.state) {
      const stateNames = {
        "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
        "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
        "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
        "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
        "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
        "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
        "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
        "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
        "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
        "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
        "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
        "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
        "wisconsin": "WI", "wyoming": "WY",
      };
      // Try full state names first (unambiguous)
      const textLower = allText.toLowerCase();
      for (const [name, abbr] of Object.entries(stateNames)) {
        if (textLower.includes(name)) {
          result.state = abbr;
          break;
        }
      }
      // Try 2-letter abbreviations with context (", CT" or "in CT," or "of CT")
      if (!result.state) {
        const abbrSet = new Set(Object.values(stateNames));
        const contextMatch = allText.match(/(?:,\s*|(?:in|of|from)\s+)([A-Z]{2})(?:\s|,|\.|\b)/);
        if (contextMatch && abbrSet.has(contextMatch[1])) {
          result.state = contextMatch[1];
        }
      }
    }

    // --- Description text ---
    // Try multiple selectors for BizBuySell's listing description
    const descSelectors = [
      ".businessDescription",
      "#businessDescription",
      ".listingProfile_description",
      ".bfsListing_mainBody",
      "[class*='description']",
      "[class*='Description']",
      "[id*='description']",
      "[id*='Description']",
      ".listing-description",
      ".business-description",
    ];
    let descEl = null;
    for (const sel of descSelectors) {
      descEl = document.querySelector(sel);
      if (descEl && descEl.innerText.trim().length > 50) break;
      descEl = null;
    }
    result.description_text = descEl ? descEl.innerText.trim() : null;

    // Fallback: grab the largest text block on the page (likely the description)
    if (!result.description_text) {
      const candidates = document.querySelectorAll("p, div.description, div.content, section, article");
      let longest = "";
      for (const el of candidates) {
        const t = el.innerText.trim();
        if (t.length > longest.length && t.length > 100) {
          const linkCount = el.querySelectorAll("a").length;
          if (linkCount < 5) longest = t;
        }
      }
      if (longest) result.description_text = longest;
    }

    // Last resort: concatenate all visible text that looks like prose
    if (!result.description_text) {
      const allParagraphs = document.querySelectorAll("p");
      const proseBlocks = [];
      for (const p of allParagraphs) {
        const t = p.innerText.trim();
        if (t.length > 50) proseBlocks.push(t);
      }
      if (proseBlocks.length > 0) result.description_text = proseBlocks.join("\n\n");
    }

    // --- Enrich description with key structured fields for signal extraction ---
    // BizBuySell puts "Reason for Selling" in dt/dd, not in the description.
    // Append it so signals.mjs can extract reason_for_sale.
    const reasonRaw = findValue("Reason for Selling") || findValue("Reason for Sale");
    if (reasonRaw && result.description_text) {
      const already = result.description_text.toLowerCase().includes("reason for sel");
      if (!already) {
        result.description_text += "\n\nReason for Selling: " + reasonRaw;
      }
    }

    // --- Owner involvement signal ---
    const descLower = (result.description_text || allText).toLowerCase();
    const ownerPatterns = [
      // Low involvement (ordered most → least specific)
      { pattern: /absentee\s*owner/,              label: "absentee owner" },
      { pattern: /semi[- ]?absentee/,              label: "semi-absentee" },
      { pattern: /passive\s+(?:income|investment)/, label: "absentee owner" },
      { pattern: /hands[- ]?off/,                  label: "absentee owner" },
      { pattern: /low[- ]?touch/,                  label: "semi-absentee" },
      { pattern: /minimal\s+owner/,                label: "semi-absentee" },
      { pattern: /manager[- ]?run/,                label: "manager run" },
      { pattern: /manager\s+in\s+place/,           label: "manager in place" },
      { pattern: /management\s+in\s+place/,        label: "management in place" },
      { pattern: /(?:staff|team|employees?)\s+(?:run|manage)/,  label: "manager run" },
      // High involvement
      { pattern: /owner[- ]?operated/,             label: "owner operated" },
      { pattern: /owner[- ]?involved/,             label: "owner involved" },
      { pattern: /hands[- ]?on\s+owner/,           label: "hands-on owner" },
      { pattern: /working\s+owner/,                label: "owner operated" },
      { pattern: /full[- ]?time\s+owner/,          label: "owner operated" },
      { pattern: /part[- ]?time\s+owner/,          label: "semi-absentee" },
      { pattern: /run\s+by\s+(the\s+)?owner/,      label: "owner operated" },
      { pattern: /owner\s+(?:can\s+)?semi[- ]?retire/, label: "semi-absentee" },
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

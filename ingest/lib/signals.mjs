/**
 * Extract scoring signals from a listing's description text and structured fields.
 * Returns an object with signal columns ready for DB update.
 */

// --- Growth potential patterns ---
const growthPatterns = [
  { pattern: /untapped\s+market/i, label: "untapped market" },
  { pattern: /significant\s+(?:growth|upside)/i, label: "significant growth" },
  { pattern: /underperform(?:ing|ed|s)?/i, label: "underperforming" },
  { pattern: /under[- ]?market/i, label: "under-market" },
  { pattern: /room\s+to\s+grow/i, label: "room to grow" },
  { pattern: /expansion\s+opportunit/i, label: "expansion opportunity" },
  { pattern: /growth\s+potential/i, label: "growth potential" },
  { pattern: /could\s+(?:easily\s+)?(?:add|expand|grow)/i, label: "could expand" },
  { pattern: /opportunity\s+to\s+(?:add|expand|grow)/i, label: "opportunity to expand" },
  { pattern: /potential\s+to\s+(?:increase|double|triple|grow)/i, label: "growth potential" },
  { pattern: /not\s+(?:yet\s+)?(?:market|advertis)/i, label: "not yet marketed" },
  { pattern: /additional\s+(?:revenue|income|service)/i, label: "additional revenue" },
  { pattern: /scalab(?:le|ility)/i, label: "scalable" },
  { pattern: /(?:add|adding|new)\s+(?:services?|locations?|territories?|routes?)/i, label: "add services" },
];

// --- Reason for sale patterns (with tiers for scoring) ---
const reasonPatterns = [
  // Favorable
  { pattern: /retir(?:ing|ement|ed)/i, label: "retiring" },
  { pattern: /relocat(?:ing|ion|ed)/i, label: "relocation" },
  { pattern: /health\s+(?:reasons?|issues?|concerns?)/i, label: "health" },
  { pattern: /other\s+(?:business\s+)?opportunit/i, label: "other opportunities" },
  { pattern: /pursue\s+other/i, label: "other opportunities" },
  { pattern: /personal\s+reasons?/i, label: "personal reasons" },
  { pattern: /family\s+(?:reasons?|matters?|obligations?)/i, label: "family reasons" },
  { pattern: /moving\s+(?:out\s+of\s+(?:state|area)|away)/i, label: "relocation" },
  // Neutral
  { pattern: /partner(?:ship)?\s+(?:split|dissolv)/i, label: "partnership dissolution" },
  { pattern: /ready\s+(?:to|for)\s+(?:a\s+)?(?:new|next)\s+(?:chapter|venture|challenge)/i, label: "new venture" },
  // Unfavorable
  { pattern: /(?:burn(?:ed)?|burnt)\s*out/i, label: "burnout" },
  { pattern: /struggling/i, label: "struggling" },
  { pattern: /declining/i, label: "declining" },
];

// --- Customer concentration risk ---
const concentrationPattern = /(?:(?:single|one|few|major|primary|main|key)\s+(?:customer|client|account|contract))|(?:(?:customer|client)\s+(?:concentration|dependency|dependent))|(?:(?:\d{1,2}|one|two|three|few)\s+(?:large|major|key)\s+(?:customers?|clients?|accounts?))|(?:(?:relies?|reliant|dependent)\s+on\s+(?:a\s+)?(?:single|one|few|handful))/i;

// --- Employee dependency risk ---
const employeeDependencyPattern = /(?:key\s+(?:employee|person|man|staff|personnel)\s+(?:risk|dependent|dependency))|(?:(?:relies?|reliant|dependent)\s+on\s+(?:key\s+)?(?:employees?|staff|personnel))|(?:(?:staff|employee)\s+(?:turnover|retention)\s+(?:issue|problem|concern|risk|challenge))|(?:hard\s+to\s+(?:find|hire|retain|replace)\s+(?:employees?|staff|workers?|technicians?))|(?:(?:labor|staffing|workforce)\s+(?:shortage|challenge|issue|problem))|(?:difficult\s+(?:to\s+)?(?:staff|recruit|hire))/i;

// --- Lease terms patterns ---
const leasePatterns = [
  { pattern: /long[- ]?term\s+lease/i, label: "long-term lease" },
  { pattern: /favorable\s+lease/i, label: "favorable lease" },
  { pattern: /below[- ]?market\s+(?:lease|rent)/i, label: "below-market rent" },
  { pattern: /low\s+rent/i, label: "low rent" },
  { pattern: /(?:new|recently?\s+(?:signed|renewed))\s+lease/i, label: "new lease" },
  { pattern: /lease\s+(?:renew|option|renewable)/i, label: "lease renewable" },
  { pattern: /(\d+)\s*[+-]?\s*year\s+lease/i, label: null }, // dynamic
  { pattern: /lease\s+(?:through|until|expires?)\s+(\d{4})/i, label: null }, // dynamic
  { pattern: /month[- ]?to[- ]?month/i, label: "month-to-month" },
  { pattern: /short[- ]?term\s+lease/i, label: "short-term lease" },
  { pattern: /lease\s+expir(?:ing|es?)\s+soon/i, label: "lease expiring soon" },
];

// --- Data completeness fields to check ---
const completenessFields = [
  "asking_price",
  "cash_flow_sde",
  "gross_revenue",
  "ebitda",
  "num_employees",
  "num_years",
  "description_text",
  "owner_involvement",
];

/**
 * Extract all scoring signals from a listing.
 *
 * @param {string|null} descriptionText - The listing's description_text
 * @param {object} listing - The full listing row (for structured fields)
 * @returns {object} Signal columns ready for DB update
 */
export function extractSignals(descriptionText, listing) {
  const desc = (descriptionText || "").toLowerCase();

  // Growth potential — first match wins
  let growthPotential = null;
  for (const { pattern, label } of growthPatterns) {
    if (pattern.test(desc)) {
      growthPotential = label;
      break;
    }
  }

  // Reason for sale — first match wins
  let reasonForSale = null;
  for (const { pattern, label } of reasonPatterns) {
    if (pattern.test(desc)) {
      reasonForSale = label;
      break;
    }
  }

  // Customer concentration risk
  const customerConcentrationRisk = concentrationPattern.test(desc);

  // Employee dependency
  const employeeDependency = employeeDependencyPattern.test(desc);

  // Lease terms — first match wins, with dynamic label support
  let leaseTerms = null;
  for (const { pattern, label } of leasePatterns) {
    const match = desc.match(pattern);
    if (match) {
      if (label) {
        leaseTerms = label;
      } else {
        // Dynamic label from capture group
        if (match[1]) {
          const num = parseInt(match[1], 10);
          if (num > 1900) {
            // It's a year (e.g., "lease through 2028")
            const yearsLeft = num - new Date().getFullYear();
            leaseTerms = yearsLeft > 0 ? `${yearsLeft}-year lease` : "lease expiring soon";
          } else {
            leaseTerms = `${num}-year lease`;
          }
        }
      }
      break;
    }
  }

  // SDE multiple (computed from structured fields)
  let sdeMultiple = null;
  const { asking_price, cash_flow_sde } = listing;
  if (asking_price && cash_flow_sde && cash_flow_sde > 0) {
    sdeMultiple = Math.round((asking_price / cash_flow_sde) * 100) / 100;
  }

  // Data completeness score
  const present = completenessFields.filter(
    (f) => listing[f] != null && listing[f] !== ""
  ).length;
  const dataCompletenessScore = Math.round((present / completenessFields.length) * 100) / 100;

  return {
    growth_potential: growthPotential,
    reason_for_sale: reasonForSale,
    customer_concentration_risk: customerConcentrationRisk,
    employee_dependency: employeeDependency,
    lease_terms: leaseTerms,
    sde_multiple: sdeMultiple,
    data_completeness_score: dataCompletenessScore,
  };
}

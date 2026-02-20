/**
 * Inline extraction validation.
 * Scans description_text for patterns that should have been extracted
 * and logs warnings when fields are unexpectedly null.
 */

const FINANCIAL_CHECKS = [
  { field: "asking_price", pattern: /asking\s+price[^$]{0,30}\$[\d,.]+/i, label: "Asking Price" },
  { field: "cash_flow_sde", pattern: /(?:cash\s+flow|(?:^|\W)sde(?:\W|$)|seller'?s\s+discretionary)[^$]{0,30}\$[\d,.]+/i, label: "Cash Flow/SDE" },
  { field: "gross_revenue", pattern: /(?:gross\s+)?revenue[^$]{0,30}\$[\d,.]+/i, label: "Gross Revenue" },
  { field: "ebitda", pattern: /ebitda[^$]{0,30}\$[\d,.]+/i, label: "EBITDA" },
  { field: "ffe", pattern: /(?:ff&e|furniture)[^$]{0,30}\$[\d,.]+/i, label: "FF&E" },
];

const OPERATIONAL_CHECKS = [
  { field: "num_years", pattern: /(?:established|founded|since|in\s+business)\s+(?:in\s+)?(?:since\s+)?\d{4}/i, label: "Years in Business" },
  {
    field: "owner_involvement",
    pattern: /(?:absentee\s*owner|semi[- ]?absentee|passive\s+(?:income|investment)|hands[- ]?off|manager[- ]?run|manager\s+in\s+place|management\s+in\s+place|owner[- ]?operated|owner[- ]?involved|hands[- ]?on\s+owner|working\s+owner|full[- ]?time\s+owner|part[- ]?time\s+owner)/i,
    label: "Owner Involvement",
  },
  {
    field: "has_recurring_revenue",
    pattern: /(?:recurring|subscription|contract\s+revenue|repeat\s+customers?|monthly\s+contracts?|annual\s+contracts?|(?:^|\W)mrr(?:\W|$)|(?:^|\W)arr(?:\W|$)|recurring\s+revenue|contracted\s+revenue|retainer)/i,
    label: "Recurring Revenue",
  },
  { field: "sba_preapproval", pattern: /sba\s+(?:pre[- ]?)?(?:qualifi|approv)\w*/i, label: "SBA Pre-qualification" },
];

const SIGNAL_CHECKS = [
  {
    field: "reason_for_sale",
    pattern: /(?:retir(?:ing|ement|ed)|relocat(?:ing|ion|ed)|health\s+(?:reasons?|issues?|concerns?|conditions?|problems?)|personal\s+reasons?|family\s+(?:reasons?|matters?|obligations?))/i,
    label: "Reason for Sale",
  },
  {
    field: "growth_potential",
    pattern: /(?:growth\s+potential|room\s+to\s+grow|expansion\s+opportunit|untapped|scalab(?:le|ility)|could\s+(?:easily\s+)?(?:add|expand|grow))/i,
    label: "Growth Potential",
  },
  {
    field: "lease_terms",
    pattern: /(?:long[- ]?term\s+lease|month[- ]?to[- ]?month|\d+[- ]?year\s+lease|favorable\s+lease|below[- ]?market\s+(?:lease|rent))/i,
    label: "Lease Terms",
  },
  {
    field: "customer_concentration_risk",
    pattern: /(?:(?:single|one|few)\s+(?:customer|client|account)|customer\s+(?:concentration|dependency))/i,
    label: "Customer Concentration",
  },
];

/**
 * Validate extracted data against description_text patterns.
 * Logs warnings for fields that appear in the text but were not extracted.
 *
 * @param {object} data - Extracted listing data from detail.mjs
 * @param {object} signals - Extracted signals from signals.mjs
 * @returns {string[]} Array of warning messages
 */
export function validateExtraction(data, signals) {
  const warnings = [];
  const desc = data.description_text || "";

  if (!desc) return warnings;

  // Check financial fields
  for (const { field, pattern, label } of FINANCIAL_CHECKS) {
    if (data[field] == null && pattern.test(desc)) {
      warnings.push(`${label} found in description but ${field} is null`);
    }
  }

  // Check operational fields
  for (const { field, pattern, label } of OPERATIONAL_CHECKS) {
    const value = data[field];
    const isNull = value == null || value === false || value === "";
    if (isNull && pattern.test(desc)) {
      warnings.push(`${label} found in description but ${field} is null/false`);
    }
  }

  // Check signal fields
  for (const { field, pattern, label } of SIGNAL_CHECKS) {
    const value = signals[field];
    const isNull = value == null || value === false || value === "";
    if (isNull && pattern.test(desc)) {
      warnings.push(`${label} found in description but signals.${field} is null/false`);
    }
  }

  // Log warnings
  for (const w of warnings) {
    console.warn(`[validate] ${data.source_listing_id || "?"}: ${w}`);
  }

  return warnings;
}

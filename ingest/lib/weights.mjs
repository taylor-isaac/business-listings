/**
 * Signal weights for the listing index score (v2).
 *
 * Redesigned based on broker analysis of 62 real BizBuySell listings.
 * Key changes from v1:
 *   - SDE multiple: 20→25, scores 0.0 (not null) when earnings data missing
 *   - Data completeness: 10→20, hard-penalizes missing SDE+EBITDA
 *   - Employee count: NEW (weight 12) — strongest proxy for transferability
 *   - Years in business: NEW (weight 8) — longevity = stability
 *   - Description quality: NEW (weight 5) — proxy for seller seriousness
 *   - Price-revenue ratio: NEW (weight 5) — catches overpriced & fraudulent listings
 *   - Growth potential: 10→3 (inversely correlated with quality in practice)
 *   - Lease terms: 5→3 (rarely extractable)
 *   - Employee dependency: REMOVED (replaced by employee_count)
 *   - Reason for sale: 8→10
 *   - Recurring revenue: 15→12
 *
 * Weights do NOT need to sum to 1 — they are normalized by the scoring function.
 * To tune: adjust weights and re-run `npm run score`
 */
export const SIGNAL_WEIGHTS = {
  sde_multiple: 25,
  data_completeness: 20,
  owner_involvement: 15,
  recurring_revenue: 12,
  employee_count: 12,
  reason_for_sale: 10,
  years_in_business: 8,
  sba_prequalified: 5,
  description_quality: 5,
  price_revenue_ratio: 5,
  customer_concentration_risk: 5,
  growth_potential: 3,
  lease_terms: 3,
};

// --- Individual signal scoring functions ---

/**
 * SDE multiple: price / cash_flow_sde.
 * v2: returns 0.0 (not null) when earnings data is completely missing,
 * so the weight stays in the denominator and drags the score down.
 */
function scoreSdeMultiple(multiple, hasEarningsData) {
  if (multiple != null) {
    if (multiple <= 2.0) return 1.0;
    if (multiple <= 3.0) return 0.8;
    if (multiple <= 4.0) return 0.5;
    if (multiple <= 5.0) return 0.2;
    return 0.1;
  }
  // No calculable multiple (missing earnings or missing asking price)
  if (!hasEarningsData) return 0.0;
  // Has earnings but no asking price — can't compute multiple, skip
  return null;
}

/**
 * Data completeness: proportion of key fields present.
 * v2: if both cash_flow_sde and ebitda are null, hard floor at 0.15
 * regardless of other fields present.
 */
function scoreDataCompleteness(completenessScore, hasEarningsData) {
  if (!hasEarningsData) {
    return Math.min(completenessScore, 0.15);
  }
  return completenessScore;
}

function scoreOwnerInvolvement(label) {
  if (!label) return null;
  const map = {
    "absentee owner": 1.0,
    "semi-absentee": 0.8,
    "manager run": 0.7,
    "manager in place": 0.7,
    "management in place": 0.7,
    "owner operated": 0.2,
    "owner involved": 0.2,
    "hands-on owner": 0.2,
  };
  return map[label] ?? 0.4;
}

/**
 * Employee count: proxy for owner-dependency and transferability.
 * 1-2 employees = likely a one-person show.
 * 8+ = real operational infrastructure.
 */
function scoreEmployeeCount(count) {
  if (count == null) return null;
  if (count <= 2) return 0.0;
  if (count <= 4) return 0.4;
  if (count <= 7) return 0.7;
  return 1.0;
}

/**
 * Years in business: longevity = stability.
 * Survived recessions, COVID, competitive shifts.
 */
function scoreYearsInBusiness(years) {
  if (years == null) return null;
  if (years < 3) return 0.2;
  if (years <= 7) return 0.5;
  if (years <= 15) return 0.8;
  return 1.0;
}

function scoreGrowthPotential(label) {
  if (!label) return null;
  const strong = [
    "untapped market",
    "significant growth",
    "underperforming",
    "under-market",
  ];
  return strong.includes(label) ? 1.0 : 0.7;
}

function scoreReasonForSale(label) {
  if (!label) return null;
  const tiers = {
    retiring: 1.0,
    relocation: 1.0,
    health: 0.8,
    "other opportunities": 0.9,
    "personal reasons": 0.8,
    "family reasons": 0.8,
    "new venture": 0.6,
    "partnership dissolution": 0.5,
    burnout: 0.2,
    struggling: 0.1,
    declining: 0.1,
  };
  return tiers[label] ?? 0.5;
}

function scoreLeaseTerms(label) {
  if (!label) return null;
  const favorable = [
    "long-term lease",
    "favorable lease",
    "below-market rent",
    "low rent",
    "new lease",
  ];
  if (favorable.includes(label)) return 1.0;
  if (label === "lease renewable") return 0.8;

  // Parse "N-year lease"
  const yearMatch = label.match(/^(\d+)/);
  if (yearMatch) {
    const years = parseInt(yearMatch[1], 10);
    if (years >= 5) return 0.9;
    if (years >= 3) return 0.6;
    return 0.3;
  }

  const unfavorable = ["month-to-month", "short-term lease", "lease expiring soon"];
  if (unfavorable.includes(label)) return 0.1;

  return 0.5;
}

/**
 * Price-to-revenue ratio sanity check.
 * Catches both overpriced listings (>1.5x without RE) and
 * deceptively cheap ones (<0.15x = franchise dumps, distress/fraud).
 */
function scorePriceRevenueRatio(ratio) {
  if (ratio == null) return null;
  if (ratio < 0.15) return 0.1;   // suspiciously cheap (franchise dump, fraud)
  if (ratio <= 0.5) return 0.7;   // discounted — could be distress or good deal
  if (ratio <= 1.5) return 1.0;   // normal range
  if (ratio <= 3.0) return 0.4;   // expensive — may include RE
  return 0.1;                      // wildly overpriced
}

/**
 * Calculate the index score for a listing (0-100 scale).
 * Returns both the final score and a signal breakdown for JSONB storage.
 *
 * Each signal is normalized to 0.0-1.0, multiplied by its weight,
 * then summed and divided by total weight. Null signals are excluded
 * from both numerator and denominator.
 *
 * v2 key change: SDE multiple and data_completeness now return 0.0
 * instead of null when earnings data is missing — they stay in the
 * denominator and actively drag the score down.
 *
 * @param {object} listing - Listing row with extracted signal fields
 * @returns {{ index_score: number|null, signals: object }} Score + signal breakdown
 */
export function calculateScore(listing) {
  const hasEarnings = listing.has_earnings_data ?? false;

  const rawSignals = {
    sde_multiple:              { value: listing.sde_multiple ?? null,              score: scoreSdeMultiple(listing.sde_multiple, hasEarnings) },
    data_completeness:         { value: listing.data_completeness_score ?? 0,     score: scoreDataCompleteness(listing.data_completeness_score ?? 0, hasEarnings) },
    owner_involvement:         { value: listing.owner_involvement ?? null,         score: scoreOwnerInvolvement(listing.owner_involvement) },
    recurring_revenue:         { value: listing.has_recurring_revenue ?? false,    score: listing.has_recurring_revenue ? 1.0 : 0.0 },
    employee_count:            { value: listing.num_employees ?? null,             score: scoreEmployeeCount(listing.num_employees) },
    reason_for_sale:           { value: listing.reason_for_sale ?? null,          score: scoreReasonForSale(listing.reason_for_sale) },
    years_in_business:         { value: listing.num_years ?? null,                score: scoreYearsInBusiness(listing.num_years) },
    sba_prequalified:          { value: listing.sba_preapproval ? true : false,   score: listing.sba_preapproval ? 1.0 : 0.0 },
    description_quality:       { value: listing.description_quality ?? 0,         score: listing.description_quality ?? 0 },
    price_revenue_ratio:       { value: listing.price_revenue_ratio ?? null,      score: scorePriceRevenueRatio(listing.price_revenue_ratio) },
    customer_concentration_risk: { value: listing.customer_concentration_risk ?? false, score: listing.customer_concentration_risk ? 0.0 : 1.0 },
    growth_potential:          { value: listing.growth_potential ?? null,          score: scoreGrowthPotential(listing.growth_potential) },
    lease_terms:               { value: listing.lease_terms ?? null,              score: scoreLeaseTerms(listing.lease_terms) },
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, { score }] of Object.entries(rawSignals)) {
    if (score === null) continue;
    const weight = SIGNAL_WEIGHTS[key] ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const indexScore = totalWeight === 0
    ? null
    : Math.round((weightedSum / totalWeight) * 1000) / 10;

  return { index_score: indexScore, signals: rawSignals };
}

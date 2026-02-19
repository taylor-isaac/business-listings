/**
 * Signal weights for the listing index score.
 * Each weight controls how much that signal contributes to the final score.
 * Weights do NOT need to sum to 1 — they are normalized by the scoring function.
 *
 * To tune: adjust weights and re-run `npm run score`
 */
export const SIGNAL_WEIGHTS = {
  sde_multiple: 20,
  owner_involvement: 15,
  recurring_revenue: 15,
  growth_potential: 10,
  data_completeness: 10,
  reason_for_sale: 8,
  sba_prequalified: 7,
  lease_terms: 5,
  customer_concentration_risk: 5,
  employee_dependency: 5,
};

// --- Individual signal scoring functions ---

function scoreSdeMultiple(multiple) {
  if (multiple == null) return null;
  if (multiple <= 2.0) return 1.0;
  if (multiple <= 3.0) return 0.8;
  if (multiple <= 4.0) return 0.5;
  if (multiple <= 5.0) return 0.2;
  return 0.1;
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
 * Calculate the index score for a listing (0-100 scale).
 * Returns both the final score and a signal breakdown for JSONB storage.
 *
 * Each signal is normalized to 0.0-1.0, multiplied by its weight,
 * then summed and divided by total weight. Null signals are excluded
 * from both numerator and denominator.
 *
 * @param {object} listing - Listing row with extracted signal fields
 * @returns {{ index_score: number|null, signals: object }} Score + signal breakdown
 */
export function calculateScore(listing) {
  const rawSignals = {
    sde_multiple:              { value: listing.sde_multiple ?? null,              score: scoreSdeMultiple(listing.sde_multiple) },
    owner_involvement:         { value: listing.owner_involvement ?? null,         score: scoreOwnerInvolvement(listing.owner_involvement) },
    recurring_revenue:         { value: listing.has_recurring_revenue ?? false,    score: listing.has_recurring_revenue ? 1.0 : 0.0 },
    growth_potential:          { value: listing.growth_potential ?? null,          score: scoreGrowthPotential(listing.growth_potential) },
    data_completeness:         { value: listing.data_completeness_score ?? 0,     score: listing.data_completeness_score ?? 0 },
    reason_for_sale:           { value: listing.reason_for_sale ?? null,          score: scoreReasonForSale(listing.reason_for_sale) },
    sba_prequalified:          { value: listing.sba_preapproval ? true : false,   score: listing.sba_preapproval ? 1.0 : 0.0 },
    lease_terms:               { value: listing.lease_terms ?? null,              score: scoreLeaseTerms(listing.lease_terms) },
    customer_concentration_risk: { value: listing.customer_concentration_risk ?? false, score: listing.customer_concentration_risk ? 0.0 : 1.0 },
    employee_dependency:       { value: listing.employee_dependency ?? false,     score: listing.employee_dependency ? 0.0 : 1.0 },
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

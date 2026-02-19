import { fetchActiveListings, saveScores } from "./lib/supabase.mjs";
import { extractSignals } from "./lib/signals.mjs";
import { calculateScore } from "./lib/weights.mjs";

async function main() {
  console.log("=== Listing Scorer (v2) ===");
  console.log(`Started at ${new Date().toISOString()}`);

  // Phase 1: Fetch all active listings
  const listings = await fetchActiveListings();
  console.log(`[score] Loaded ${listings.length} active listings`);

  // Phase 2: Extract signals and calculate scores
  const results = [];
  let scored = 0;
  let skipped = 0;

  for (const listing of listings) {
    const extracted = extractSignals(listing.description_text, listing);
    const enriched = { ...listing, ...extracted };
    const { index_score, signals } = calculateScore(enriched);

    if (index_score === null) {
      skipped++;
      continue;
    }

    results.push({
      listing_id: listing.id,
      index_score,
      signals,
      // Keep reference data for the summary
      _url: listing.url,
      _price: listing.asking_price,
      _sde: listing.cash_flow_sde,
      _ebitda: listing.ebitda,
      _revenue: listing.gross_revenue,
      _employees: listing.num_employees,
    });
    scored++;
  }

  // Phase 3: Save scores to listing_scores + update listings.index_score
  console.log(`[score] Scored: ${scored}, Skipped (no data): ${skipped}`);

  if (results.length > 0) {
    await saveScores(results);
    console.log(`[score] Saved ${results.length} scores to database`);
  } else {
    console.log(`[score] No listings to score`);
  }

  // Summary: show top 10 and bottom 5 scores
  const sorted = results.sort((a, b) => (b.index_score ?? 0) - (a.index_score ?? 0));

  console.log(`\n[score] === TOP 10 ===`);
  for (const row of sorted.slice(0, 10)) {
    const price = row._price ? `$${(row._price / 1000).toFixed(0)}K` : "N/A";
    const sde = row._sde ? `$${(row._sde / 1000).toFixed(0)}K` : "N/A";
    const ebitda = row._ebitda ? `$${(row._ebitda / 1000).toFixed(0)}K` : "N/A";
    const emp = row._employees ?? "?";
    console.log(`  ${row.index_score.toFixed(1).padStart(5)} | ${price.padStart(7)} ask | SDE ${sde.padStart(6)} | EBITDA ${ebitda.padStart(6)} | ${String(emp).padStart(2)} emp | ${row._url}`);
  }

  console.log(`\n[score] === BOTTOM 5 ===`);
  for (const row of sorted.slice(-5)) {
    const price = row._price ? `$${(row._price / 1000).toFixed(0)}K` : "N/A";
    console.log(`  ${row.index_score.toFixed(1).padStart(5)} | ${price.padStart(7)} ask | ${row._url}`);
  }

  // Stats
  const scores = sorted.map((r) => r.index_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const median = scores[Math.floor(scores.length / 2)];
  console.log(`\n[score] Stats: avg=${avg.toFixed(1)}, median=${median.toFixed(1)}, min=${scores[scores.length - 1].toFixed(1)}, max=${scores[0].toFixed(1)}`);

  console.log(`\nFinished at ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exitCode = 1;
});

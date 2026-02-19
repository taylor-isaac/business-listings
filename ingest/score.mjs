import { fetchActiveListings, saveScores } from "./lib/supabase.mjs";
import { extractSignals } from "./lib/signals.mjs";
import { calculateScore } from "./lib/weights.mjs";

async function main() {
  console.log("=== Listing Scorer ===");
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

  // Summary: show top 5 scores
  const sorted = results.sort((a, b) => (b.index_score ?? 0) - (a.index_score ?? 0));
  console.log(`\n[score] Top 5 scores:`);
  for (const row of sorted.slice(0, 5)) {
    console.log(`  ${row.index_score} — id=${row.listing_id}`);
  }

  console.log(`\nFinished at ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exitCode = 1;
});

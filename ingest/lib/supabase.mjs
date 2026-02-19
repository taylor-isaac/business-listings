import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 50;

/**
 * Upsert an array of listing rows into Supabase in batches.
 * Conflict resolution on (source, source_listing_id).
 */
export async function batchUpsert(rows) {
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("listings")
      .upsert(batch, { onConflict: "source,source_listing_id" })
      .select("source_listing_id");

    if (error) {
      console.error(`[supabase] Batch upsert error at offset ${i}:`, error.message);
      throw error;
    }

    upserted += data?.length ?? batch.length;
    console.log(`[supabase] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data?.length ?? batch.length} rows`);
  }

  return upserted;
}

/**
 * Fetch all active listings (for scoring/rescoring).
 */
export async function fetchActiveListings() {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;
  return data;
}

/**
 * Save scores for a batch of listings.
 * Writes signal breakdown to listing_scores table and index_score to listings table.
 *
 * @param {Array<{listing_id: string, index_score: number, signals: object}>} scores
 */
export async function saveScores(scores) {
  for (let i = 0; i < scores.length; i += BATCH_SIZE) {
    const batch = scores.slice(i, i + BATCH_SIZE);

    for (const { listing_id, index_score, signals } of batch) {
      // Upsert signal breakdown into listing_scores
      const { error: scoreErr } = await supabase
        .from("listing_scores")
        .upsert(
          { listing_id, index_score, signals, scored_at: new Date().toISOString() },
          { onConflict: "listing_id" }
        );
      if (scoreErr) {
        console.error(`[supabase] listing_scores upsert error for ${listing_id}:`, scoreErr.message);
        throw scoreErr;
      }

      // Update index_score on listings table for sorting
      const { error: listErr } = await supabase
        .from("listings")
        .update({ index_score })
        .eq("id", listing_id);
      if (listErr) {
        console.error(`[supabase] listings update error for ${listing_id}:`, listErr.message);
        throw listErr;
      }
    }

    console.log(`[supabase] Scored batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows`);
  }
}

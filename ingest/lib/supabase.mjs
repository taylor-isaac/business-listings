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

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const nowUtcIso = () => new Date().toISOString();

async function run() {
  const payload = {
    source: "test_source",
    source_listing_id: "test_001",
    url: "https://example.com/test_001",
    asking_price: 500000,
    gross_revenue: 900000,
    cash_flow_sde: 250000,
    last_seen_at: nowUtcIso(),
    is_active: true
  };

  const { data, error } = await supabase
    .from("listings")
    .upsert(payload, { onConflict: "source,source_listing_id" })
    .select();

  if (error) throw error;

  console.log("Upsert OK:", data);
}

run().catch((e) => {
  console.error("Upsert FAILED:", e);
  process.exit(1);
});

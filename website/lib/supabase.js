import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function getListings() {
  const { data, error } = await supabase
    .from("listings")
    .select("*, listing_scores(signals)")
    .eq("is_active", true)
    .order("index_score", { ascending: false, nullsFirst: false });

  if (error) throw error;

  // Flatten: pull scoring signals from the JSONB
  return data.map((row) => {
    const signals = row.listing_scores?.[0]?.signals ?? {};
    return {
      ...row,
      sde_multiple: signals.sde_multiple?.value ?? null,
      reason_for_sale: signals.reason_for_sale?.value ?? null,
      price_revenue_ratio: signals.price_revenue_ratio?.value ?? null,
    };
  });
}

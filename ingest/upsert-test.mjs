import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const LISTING_URL =
  "https://www.bizbuysell.com/business-opportunity/profitable-restoration-franchise-with-scalable-service-area/2433900/";

const source = "bizbuysell";

function extractIdFromUrl(url) {
  const m = url.match(/\/(\d+)\/?$/);
  if (!m) throw new Error("Could not extract listing id from URL");
  return m[1];
}

function parseMoneyToNumber(s) {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractLabeledMoney(html, label) {
  const re = new RegExp(`${label}:\\s*\\$([0-9,]+)`, "i");
  const m = html.match(re);
  return m ? parseMoneyToNumber(m[1]) : null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; listings-ingest/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function run() {
  const source_listing_id = extractIdFromUrl(LISTING_URL);
  const html = await fetchHtml(LISTING_URL);

  const asking_price = extractLabeledMoney(html, "Asking Price");
  const cash_flow_sde = extractLabeledMoney(html, "Cash Flow \\(SDE\\)");
  const gross_revenue = extractLabeledMoney(html, "Gross Revenue");

  const payload = {
    source,
    source_listing_id,
    url: LISTING_URL,
    asking_price,
    cash_flow_sde,
    gross_revenue,
    last_seen_at: new Date().toISOString(),
    is_active: true,
  };

  const { data, error } = await supabase
    .from("listings")
    .upsert(payload, { onConflict: "source,source_listing_id" })
    .select();

  if (error) throw error;

  console.log("Upsert OK:", data?.[0]);
}

run().catch((e) => {
  console.error("Upsert FAILED:", e);
  process.exit(1);
});


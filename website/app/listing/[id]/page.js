import { getListingById } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";

function formatMoney(n) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US");
}

function ScoreBar({ score }) {
  if (score == null) return <span>—</span>;
  const pct = Math.min(score, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-4 border border-[#00ff41]/40 bg-black/50">
        <div
          className="h-full bg-[#00ff41]/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xl">{score.toFixed(1)}</span>
    </div>
  );
}

function SignalRow({ label, value, score }) {
  return (
    <div className="flex justify-between py-1 border-b border-[#00ff41]/10">
      <span className="opacity-70">{label}</span>
      <span>
        {value != null ? String(value) : "—"}
        {score != null && (
          <span className="ml-3 opacity-50">({(score * 100).toFixed(0)}%)</span>
        )}
      </span>
    </div>
  );
}

export default async function ListingDetail({ params }) {
  const { id } = await params;

  let listing;
  try {
    listing = await getListingById(id);
  } catch {
    notFound();
  }

  const signals = listing.signals || {};
  const signalEntries = [
    { key: "sde_multiple", label: "SDE Multiple" },
    { key: "data_completeness", label: "Data Completeness" },
    { key: "owner_involvement", label: "Owner Involvement" },
    { key: "recurring_revenue", label: "Recurring Revenue" },
    { key: "employee_count", label: "Employee Count" },
    { key: "reason_for_sale", label: "Reason for Sale" },
    { key: "years_in_business", label: "Years in Business" },
    { key: "sba_prequalification", label: "SBA Pre-qualification" },
    { key: "description_quality", label: "Description Quality" },
    { key: "price_revenue_ratio", label: "Price/Revenue Ratio" },
    { key: "customer_concentration", label: "Customer Concentration" },
    { key: "growth_potential", label: "Growth Potential" },
    { key: "lease_terms", label: "Lease Terms" },
  ];

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="opacity-50 hover:opacity-100 text-sm">
        &larr; Back to listings
      </Link>

      <h1 className="text-3xl mt-4 mb-1">
        {listing.industry || "Business Listing"}
      </h1>
      <p className="opacity-50 mb-6">
        {listing.state || "Unknown"} &middot; #{listing.source_listing_id}
      </p>

      {/* Score */}
      <section className="mb-8">
        <h2 className="text-xl mb-2 opacity-70">Index Score</h2>
        <ScoreBar score={listing.index_score} />
      </section>

      {/* Financials */}
      <section className="mb-8">
        <h2 className="text-xl mb-3 opacity-70">Financials</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Asking Price</span>
            <span>{formatMoney(listing.asking_price)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Gross Revenue</span>
            <span>{formatMoney(listing.gross_revenue)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Cash Flow (SDE)</span>
            <span>{formatMoney(listing.cash_flow_sde)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">EBITDA</span>
            <span>{formatMoney(listing.ebitda)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">FF&E</span>
            <span>{formatMoney(listing.ffe)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Inventory</span>
            <span>{formatMoney(listing.inventory)}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">SDE Multiple</span>
            <span>{listing.sde_multiple != null ? `${listing.sde_multiple.toFixed(1)}x` : "—"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">P/Rev Ratio</span>
            <span>{listing.price_revenue_ratio != null ? `${listing.price_revenue_ratio.toFixed(2)}x` : "—"}</span>
          </div>
        </div>
      </section>

      {/* Operations */}
      <section className="mb-8">
        <h2 className="text-xl mb-3 opacity-70">Operations</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Employees</span>
            <span>{listing.num_employees ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Years in Business</span>
            <span>{listing.num_years != null ? `${listing.num_years}` : "—"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Owner Involvement</span>
            <span>{listing.owner_involvement || "—"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Recurring Revenue</span>
            <span>{listing.has_recurring_revenue ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">SBA Pre-qualified</span>
            <span>{listing.sba_preapproval ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between border-b border-[#00ff41]/10 py-1">
            <span className="opacity-70">Reason for Sale</span>
            <span>{listing.reason_for_sale || "—"}</span>
          </div>
        </div>
      </section>

      {/* Signal Breakdown */}
      <section className="mb-8">
        <h2 className="text-xl mb-3 opacity-70">Signal Breakdown</h2>
        <div className="space-y-0">
          {signalEntries.map(({ key, label }) => {
            const sig = signals[key];
            return (
              <SignalRow
                key={key}
                label={label}
                value={sig?.value}
                score={sig?.score}
              />
            );
          })}
        </div>
      </section>

      {/* Description */}
      <section className="mb-8">
        <h2 className="text-xl mb-3 opacity-70">Description</h2>
        {listing.description_text ? (
          <p className="whitespace-pre-wrap opacity-90 text-base leading-relaxed">
            {listing.description_text}
          </p>
        ) : (
          <p className="opacity-50">No description available.</p>
        )}
      </section>

      {/* External link */}
      <div className="border-t border-[#00ff41]/20 pt-4">
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-50 hover:opacity-100 text-sm underline"
        >
          View Original on BizBuySell &rarr;
        </a>
      </div>
    </main>
  );
}

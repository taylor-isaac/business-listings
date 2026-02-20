import { getListings } from "@/lib/supabase";

function formatMoney(n) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US");
}

export default async function Home() {
  const listings = await getListings();

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl mb-1">Business Listings</h1>
      <p className="mb-6 opacity-70">
        {listings.length} active listings &middot; Sorted by index score
      </p>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#00ff41]/30 text-left">
              <th className="py-3 pr-4">Industry</th>
              <th className="py-3 pr-4 text-right">Score</th>
              <th className="py-3 pr-4">State</th>
              <th className="py-3 pr-4 text-right">Asking Price</th>
              <th className="py-3 pr-4 text-right">Revenue</th>
              <th className="py-3 pr-4 text-right">Cash Flow</th>
              <th className="py-3 pr-4 text-right">Multiple</th>
              <th className="py-3 pr-4 text-right">Employees</th>
              <th className="py-3 pr-4">Owner</th>
              <th className="py-3 pr-4">Reason for Sale</th>
              <th className="py-3 pr-4">SBA</th>
              <th className="py-3 pr-4 text-right">P/Rev</th>
              <th className="py-3 pr-4">Recurring</th>
              <th className="py-3">Years</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr
                key={listing.id}
                className="border-b border-[#00ff41]/10 hover:bg-[#00ff41]/5"
              >
                <td className="py-3 pr-4">
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-70"
                  >
                    {listing.industry || "Unknown"}
                  </a>
                </td>
                <td className="py-3 pr-4 text-right">
                  {listing.index_score != null
                    ? listing.index_score.toFixed(1)
                    : "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.state || "—"}
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatMoney(listing.asking_price)}
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatMoney(listing.gross_revenue)}
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatMoney(listing.cash_flow_sde)}
                </td>
                <td className="py-3 pr-4 text-right">
                  {listing.sde_multiple != null
                    ? `${listing.sde_multiple.toFixed(1)}x`
                    : "—"}
                </td>
                <td className="py-3 pr-4 text-right">
                  {listing.num_employees != null ? listing.num_employees : "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.owner_involvement || "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.reason_for_sale || "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.sba_preapproval ? "Yes" : "No"}
                </td>
                <td className="py-3 pr-4 text-right">
                  {listing.price_revenue_ratio != null
                    ? `${listing.price_revenue_ratio.toFixed(2)}x`
                    : "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.has_recurring_revenue ? "Yes" : "No"}
                </td>
                <td className="py-3">
                  {listing.num_years != null ? `${listing.num_years}y` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

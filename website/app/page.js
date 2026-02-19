import { getListings } from "@/lib/supabase";

function formatMoney(n) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US");
}

function scoreColor(score) {
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  if (score >= 30) return "text-orange-400";
  return "text-red-400";
}

function multipleColor(m) {
  if (m == null) return "text-gray-500";
  if (m <= 3) return "text-green-400";
  if (m <= 5) return "text-yellow-400";
  return "text-red-400";
}

export default async function Home() {
  const listings = await getListings();

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Business Listings</h1>
      <p className="text-gray-400 text-sm mb-6">
        {listings.length} active listings &middot; Sorted by index score
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="py-3 pr-4 font-medium">Industry</th>
              <th className="py-3 pr-4 font-medium text-right">Score</th>
              <th className="py-3 pr-4 font-medium">State</th>
              <th className="py-3 pr-4 font-medium text-right">Asking Price</th>
              <th className="py-3 pr-4 font-medium text-right">Revenue</th>
              <th className="py-3 pr-4 font-medium text-right">Cash Flow</th>
              <th className="py-3 pr-4 font-medium text-right">Multiple</th>
              <th className="py-3 pr-4 font-medium text-right">Employees</th>
              <th className="py-3 pr-4 font-medium">Owner</th>
              <th className="py-3 pr-4 font-medium">Recurring</th>
              <th className="py-3 font-medium">Years</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr
                key={listing.id}
                className="border-b border-gray-800/50 hover:bg-gray-900/50"
              >
                <td className="py-3 pr-4">
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    {listing.industry || "Unknown"}
                  </a>
                </td>
                <td className="py-3 pr-4 text-right font-medium">
                  {listing.index_score != null ? (
                    <span className={scoreColor(listing.index_score)}>
                      {listing.index_score.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-300">
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
                <td className="py-3 pr-4 text-right font-medium">
                  {listing.sde_multiple != null ? (
                    <span className={multipleColor(listing.sde_multiple)}>
                      {listing.sde_multiple.toFixed(1)}x
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right text-gray-300">
                  {listing.num_employees != null ? listing.num_employees : "—"}
                </td>
                <td className="py-3 pr-4 text-gray-300">
                  {listing.owner_involvement || "—"}
                </td>
                <td className="py-3 pr-4">
                  {listing.has_recurring_revenue ? (
                    <span className="text-green-400">Yes</span>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </td>
                <td className="py-3 text-gray-300">
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

import "./globals.css";

export const metadata = {
  title: "Business Listings",
  description: "Aggregated business-for-sale listings ranked by key signals",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}

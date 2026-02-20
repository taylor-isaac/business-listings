import "./globals.css";
import MatrixRain from "./matrix-rain";

export const metadata = {
  title: "Business Listings",
  description: "Aggregated business-for-sale listings ranked by key signals",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black min-h-screen">
        <MatrixRain />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}

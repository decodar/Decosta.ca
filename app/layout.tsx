import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://decosta.ca"),
  title: {
    default: "Decosta | Portfolio, Consulting, Rentals, Analytics",
    template: "%s | decosta.ca"
  },
  description:
    "Portfolio and tools for furnished rental operations, West Vancouver insights, short-term rental analytics, and AI-powered project exploration.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Decosta",
    description:
      "Portfolio and tools for rentals, analytics, and AI projects.",
    url: "https://decosta.ca",
    siteName: "decosta.ca",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

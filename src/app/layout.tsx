import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AuthStatus, HeaderBrandLink } from "@/components/auth-status";

// Exposed as CSS variables only (never applied to `body`), so these are opt-in
// per route via the `font-display` / `font-body` / `font-price` utilities. Both
// the landing page's headings and its body copy are the same family
// (IBM Plex Sans), differentiated by weight rather than by a separate
// display face.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-sans",
});

// Used for numeric data (prices, dates, IDs) where tabular alignment matters —
// the driver hub's regular text and the landing page's body/display text both
// stay on their own sans stacks; only figures opt into this one.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-ibm-plex",
});

export const metadata: Metadata = {
  title: "Lalamove Clone",
  description:
    "On-demand delivery platform — book a vehicle and move your goods across the city.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <HeaderBrandLink />
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}

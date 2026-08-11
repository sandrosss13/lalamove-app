import type { Metadata } from "next";
import { Archivo, Bebas_Neue, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthStatus, HeaderBrandLink } from "@/components/auth-status";

// Exposed as CSS variables only (never applied to `body`), so these are opt-in
// per route via the `font-display` / `font-body` / `font-ops` utilities.
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-bebas-neue",
});

// Used only within the ops dashboard, for numeric data (prices, dates, IDs)
// where tabular alignment matters; its regular text stays on the system stack.
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
      className={`${archivo.variable} ${bebasNeue.variable} ${ibmPlexMono.variable}`}
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

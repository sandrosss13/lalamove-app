import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthStatus } from "@/components/auth-status";

// Exposed as CSS variables only (never applied to `body`), so these are opt-in
// per route via the `font-display` / `font-body` utilities.
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
    <html lang="en" className={`${archivo.variable} ${bebasNeue.variable}`}>
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <Link href="/" className="font-bold">
            Lalamove Clone
          </Link>
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}

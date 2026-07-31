import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthStatus } from "@/components/auth-status";

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
    <html lang="en">
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

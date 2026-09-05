import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "PG-EG — Making PG Maintenance Easy",
  description:
    "PG-EG is the simplest way for PG owners to manage their rooms, beds, and tenants — all in one place.",
  keywords: ["PG management", "paying guest", "room management", "tenant management"],
  authors: [{ name: "PG-EG" }],
  openGraph: {
    title: "PG-EG — Making PG Maintenance Easy",
    description: "Manage your PG effortlessly with PG-EG.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

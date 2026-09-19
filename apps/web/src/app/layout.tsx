import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Script from "next/script";

export const viewport: Viewport = {
  themeColor: "#2dc653",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "PG-EG — Making PG Maintenance Easy",
  description:
    "PG-EG is the simplest way for PG owners to manage their rooms, beds, and tenants — all in one place.",
  keywords: ["PG management", "paying guest", "room management", "tenant management"],
  authors: [{ name: "PG-EG" }],
  applicationName: "PG-EG",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PG-EG",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192x192.png",  sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png",  sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "PG-EG — Making PG Maintenance Easy",
    description: "Manage your PG effortlessly with PG-EG.",
    type: "website",
    images: [{ url: "/pg-eg-logo.png", width: 512, height: 512, alt: "PG-EG Logo" }],
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
        {/* Theme: apply before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t = localStorage.getItem('pg-eg-theme');
            document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
          })()
        ` }} />
        {/* PWA: Service Worker registration */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                .catch(function(err) { console.warn('[SW] Registration failed:', err); });
            });
          }
        `}</Script>
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

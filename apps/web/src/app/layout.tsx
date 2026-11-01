import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OfflineDetector from "@/components/OfflineDetector";
import Script from "next/script";
import { APP_URL } from "@/lib/siteConfig";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#2dc653",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "PG-EG (PGEG) — Find PGs & Hostels | EG-PG App Bangalore",
  description:
    "PG-EG (also known as PGEG, PG EG, or EG-PG) is Bangalore's smartest PG finder and digital property management web app. Find verified gents & ladies PGs with zero brokerage, 3D room tours, and direct manager contact.",
  keywords: [
    "PG-EG",
    "PGEG",
    "pgeg",
    "pg-eg",
    "pg eg",
    "pgeg app",
    "pgegapp",
    "pg-eg app",
    "pg-egapp",
    "egpg",
    "eg-pg",
    "eg pg",
    "egpg app",
    "egpgapp",
    "eg-pg app",
    "pg",
    "PG",
    "pgs near me",
    "PGS near me",
    "PG near me",
    "find PG",
    "PGs near my college",
    "PGs near my office",
    "PG in Bangalore",
    "bangalore pgs",
    "paying guest Bangalore",
    "ladies pg bangalore",
    "gents pg bangalore",
    "zero brokerage pg",
    "PG management app",
    "tenant management",
    "3D building management",
  ],
  authors: [{ name: "PG-EG" }],
  applicationName: "PG-EG (PGEG)",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PG-EG",
  },
  formatDetection: { telephone: false },
  verification: {
    google: "googleba8369737f622c51",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
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
    title: "PG-EG (PGEG) — Find PGs & Manage Properties Digitally",
    description: "Search verified PGs in Bangalore or manage your PG property digitally with 3D floor tools. No hassle, just PG-EG (PGEG / EG-PG).",
    type: "website",
    url: APP_URL,
    siteName: "PG-EG (PGEG)",
    images: [{ url: `${APP_URL}/pg-eg-logo.png`, width: 512, height: 512, alt: "PG-EG PGEG Logo" }],
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "PG-EG (PGEG) — Find PGs Easily | EG-PG App Bangalore",
    description: "Find verified PGs in Bangalore with zero brokerage. 3D building view, rent tracker, and direct manager contact.",
    images: [`${APP_URL}/pg-eg-logo.png`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${APP_URL}/#organization`,
        "name": "PG-EG",
        "alternateName": ["PGEG", "pg-eg", "pgeg", "PG EG"],
        "url": APP_URL,
        "logo": `${APP_URL}/pg-eg-logo.png`,
        "description": "Smart PG discovery and 3D digital property management platform in Bangalore, India.",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Bengaluru",
          "addressRegion": "Karnataka",
          "addressCountry": "IN",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${APP_URL}/#website`,
        "url": APP_URL,
        "name": "PG-EG",
        "alternateName": ["PGEG", "pg-eg", "pgeg"],
        "publisher": { "@id": `${APP_URL}/#organization` },
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": `${APP_URL}/find-pg?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Brand & Organization Structured Data for Google Knowledge Graph & Chrome Sitelinks */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(brandSchema) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {/* Theme: apply before paint to prevent flash & filter known legacy 3D deprecation noise */}
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function(){
            var t = localStorage.getItem('pg-eg-theme');
            document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
            if (typeof console !== 'undefined' && console.warn) {
              var _origWarn = console.warn;
              console.warn = function() {
                if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].indexOf('THREE.Clock: This module has been deprecated') !== -1) {
                  return;
                }
                _origWarn.apply(console, arguments);
              };
            }
          })()
        `}</Script>
        {/* PWA: Service Worker registration */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                for (var r of regs) { r.unregister(); }
              });
              if ('caches' in window) {
                caches.keys().then(function(keys) {
                  for (var k of keys) { caches.delete(k); }
                });
              }
            } else {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                  .catch(function(err) { console.warn('[SW] Registration failed:', err); });
              });
            }
          }
        `}</Script>
        <ThemeProvider>
          <AuthProvider>
            <OfflineDetector />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import { MetadataRoute } from "next";
import { APP_URL } from "@/lib/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/bangalore", "/bangalore/*", "/pg/*", "/find-pg", "/terms", "/privacy"],
        disallow: [
          "/dashboard",
          "/dashboard/*",
          "/admin",
          "/admin/*",
          "/tenants",
          "/tenants/*",
          "/rents",
          "/rents/*",
          "/expenses",
          "/expenses/*",
          "/leads",
          "/leads/*",
          "/owner-profile",
          "/owner-profile/*",
          "/select-pg",
          "/select-pg/*",
          "/sign-in",
          "/sign-in/*",
          "/add-pg",
          "/add-pg/*",
          "/api/*",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/bangalore", "/bangalore/*", "/pg/*", "/find-pg"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}


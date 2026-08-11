import type { MetadataRoute } from "next"

const SITE_URL = "https://firstsuup.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/auth/", "/studio/", "/admin/", "/my/"]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  }
}

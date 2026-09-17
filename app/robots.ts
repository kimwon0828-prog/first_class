import { toParentUrl } from "@/shared/config/site-origins"

import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/auth/", "/studio/", "/admin/", "/my/"]
      }
    ],
    sitemap: toParentUrl("/sitemap.xml")
  }
}

/**
 * Public origins shared by server and client code.
 * S1 keeps production URLs fixed, including on localhost/preview builds.
 * Studio is a target contract only; routing and internal /studio links stay unchanged.
 */
export const PARENT_ORIGIN = "https://firstsuup.com"
export const STUDIO_ORIGIN = "https://studio.firstsuup.com"

const toSiteUrl = (origin: string, path: string) => {
  // Accept only root-relative paths. Never let a supplied URL replace the origin.
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) {
    throw new Error("Expected a root-relative path without whitespace or backslashes")
  }

  return `${origin}${path}`
}

export const toParentUrl = (path = "/") => toSiteUrl(PARENT_ORIGIN, path)
export const toStudioUrl = (path = "/") => toSiteUrl(STUDIO_ORIGIN, path)

/**
 * Host predicates (Phase S3A).
 *
 * Pure classification only — nothing here redirects, rewrites or reads a
 * request. Hostnames are derived from the origins above so there is one
 * source of truth.
 *
 * Development hosts are deliberately absent: `studio.localhost` and friends
 * are not part of the runtime contract yet, so they classify as neither.
 */
export const PARENT_HOSTNAMES = [
  new URL(PARENT_ORIGIN).hostname,
  `www.${new URL(PARENT_ORIGIN).hostname}`
] as const
export const STUDIO_HOSTNAMES = [new URL(STUDIO_ORIGIN).hostname] as const

// A Host header may carry a port and a trailing dot; neither changes the site.
const normalizeHostname = (hostname: string) =>
  hostname.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")

export const isStudioHost = (hostname: string) =>
  typeof hostname === "string" && (STUDIO_HOSTNAMES as readonly string[]).includes(normalizeHostname(hostname))

export const isParentHost = (hostname: string) =>
  typeof hostname === "string" && (PARENT_HOSTNAMES as readonly string[]).includes(normalizeHostname(hostname))

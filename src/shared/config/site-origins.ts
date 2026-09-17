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

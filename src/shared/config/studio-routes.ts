/**
 * Studio pathname contract shared by server and client code (Phase S3A).
 *
 * The Studio app lives under the internal `/studio` prefix today. On
 * `studio.firstsuup.com` the same screens are meant to be reachable without
 * that prefix — `/studio/applications` reads as `/applications`.
 *
 * S3A fixes that translation as pure functions only. Nothing calls them yet:
 * middleware, cookies, OAuth, `revalidatePath` and every internal `/studio`
 * href stay exactly as they were. Runtime rewriting is a later phase.
 *
 * Scope: pathnames only. Query strings and fragments are rejected so this
 * module never has to reason about URL composition — callers keep that
 * responsibility and reattach `?…` / `#…` themselves.
 */

export const STUDIO_INTERNAL_PREFIX = "/studio"

/**
 * Screens whose external path is not a plain prefix strip.
 *
 * Studio's auth screens are `/studio/sign-in` internally, but on the Studio
 * host they belong under `/auth/*` — the same shape Parent auth already uses.
 * Listed as pairs so both directions come from one source of truth.
 */
const STUDIO_AUTH_PATH_PAIRS = [
  ["/studio/sign-in", "/auth/sign-in"],
  ["/studio/sign-up", "/auth/sign-up"],
  ["/studio/sign-out", "/auth/sign-out"]
] as const

const INTERNAL_TO_EXTERNAL = new Map<string, string>(STUDIO_AUTH_PATH_PAIRS)
const EXTERNAL_TO_INTERNAL = new Map<string, string>(
  STUDIO_AUTH_PATH_PAIRS.map(([internal, external]) => [external, internal])
)

/**
 * Accept only a clean root-relative pathname.
 *
 * Duplicate slashes are rejected on the way in so no mapping can ever emit
 * `/studio//applications`. A single trailing slash is dropped rather than
 * rejected, so `/studio/` resolves like `/studio` instead of throwing.
 */
const normalizePathname = (pathname: string): string => {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) {
    throw new Error("Expected a root-relative pathname")
  }

  if (pathname.includes("//")) {
    throw new Error("Expected a pathname without duplicate slashes")
  }

  if (/[\\\u0000-\u0020\u007f]/.test(pathname)) {
    throw new Error("Expected a pathname without whitespace, backslashes or control characters")
  }

  if (pathname.includes("?") || pathname.includes("#")) {
    throw new Error("Expected a pathname without a query string or fragment")
  }

  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
}

/** True for `/studio` and anything below it. `/studiolike` is not a Studio path. */
export const isStudioInternalPath = (pathname: string): boolean => {
  if (typeof pathname !== "string") {
    return false
  }

  const [path] = pathname.split(/[?#]/)

  return path === STUDIO_INTERNAL_PREFIX || path.startsWith(`${STUDIO_INTERNAL_PREFIX}/`)
}

/**
 * `/studio/applications/abc` → `/applications/abc`, `/studio` → `/`.
 * Throws when the pathname is not a Studio internal path.
 */
export const toStudioExternalPath = (internalPath: string): string => {
  const path = normalizePathname(internalPath)

  const mapped = INTERNAL_TO_EXTERNAL.get(path)
  if (mapped) {
    return mapped
  }

  if (path === STUDIO_INTERNAL_PREFIX) {
    return "/"
  }

  if (!path.startsWith(`${STUDIO_INTERNAL_PREFIX}/`)) {
    throw new Error(`Expected a pathname under ${STUDIO_INTERNAL_PREFIX}`)
  }

  return path.slice(STUDIO_INTERNAL_PREFIX.length)
}

/**
 * `/applications/abc` → `/studio/applications/abc`, `/` → `/studio`.
 *
 * This is the Studio host's reading of a pathname. `/classes` also exists on
 * the Parent host; telling the two apart is the caller's job, by host.
 */
export const toStudioInternalPath = (externalPath: string): string => {
  const path = normalizePathname(externalPath)

  const mapped = EXTERNAL_TO_INTERNAL.get(path)
  if (mapped) {
    return mapped
  }

  if (path === "/") {
    return STUDIO_INTERNAL_PREFIX
  }

  return `${STUDIO_INTERNAL_PREFIX}${path}`
}

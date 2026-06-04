export type ProfileRole = "parent" | "academy" | "admin"

export const resolvePostAuthRedirect = (role: ProfileRole): string => {
  if (role === "parent") {
    return "/classes"
  }

  return "/studio"
}

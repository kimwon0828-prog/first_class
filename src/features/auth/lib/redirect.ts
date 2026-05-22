export type ProfileRole = "parent" | "teacher"

export const resolvePostAuthRedirect = (role: ProfileRole): string => {
  if (role === "parent") {
    return "/classes"
  }

  // Teacher is the only studio role in the MVP.
  return "/studio"
}

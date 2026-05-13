type PublicEnv = {
  supabaseUrl: string
  supabasePublishableKey: string
}

type PublicEnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

const getRequiredEnvValue = (key: PublicEnvKey) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}

export const getPublicEnv = (): PublicEnv => {
  return {
    supabaseUrl: getRequiredEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: getRequiredEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }
}

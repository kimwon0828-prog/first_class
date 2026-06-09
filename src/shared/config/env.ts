type PublicEnv = {
  supabaseUrl: string
  supabasePublishableKey: string
}

type PublicEnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"

const getRequiredEnvValue = (key: PublicEnvKey) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}

export const getPublicEnv = (): PublicEnv => {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is required")
  }

  return {
    supabaseUrl: getRequiredEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: publishableKey
  }
}

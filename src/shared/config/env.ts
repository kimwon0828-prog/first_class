type PublicEnv = {
  supabaseUrl: string
  supabasePublishableKey: string
}

export const getPublicEnv = (): PublicEnv => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required")
  }

  if (!supabaseKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required")
  }

  return {
    supabaseUrl,
    supabasePublishableKey: supabaseKey
  }
}

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadEnvConfig } from "@next/env"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

const DEMO_ACADEMY_EMAIL = "demo@firstsuup.com"
const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL"
const SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY"
const ACADEMY_PASSWORD_ENV = "DEMO_ACADEMY_PASSWORD"

const currentFilePath = fileURLToPath(import.meta.url)
const projectRoot = resolve(dirname(currentFilePath), "..")

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`)
  }

  return value
}

const getServiceRoleClient = (): SupabaseClient => {
  const supabaseUrl = readRequiredEnv(SUPABASE_URL_ENV)
  const serviceRoleKey = readRequiredEnv(SERVICE_ROLE_ENV)

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

const listAllUsers = async (supabase: SupabaseClient) => {
  const users: User[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    })

    if (error) {
      throw new Error(`Auth 사용자 조회 실패: ${error.message}`)
    }

    const pageUsers = data.users ?? []
    users.push(...pageUsers)

    if (pageUsers.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

const findSingleDemoAcademyUser = async (supabase: SupabaseClient) => {
  const allUsers = await listAllUsers(supabase)
  const matchedUsers = allUsers.filter((user) => user.email === DEMO_ACADEMY_EMAIL)

  if (matchedUsers.length !== 1) {
    throw new Error(
      `demo academy Auth 사용자가 정확히 1명이어야 합니다. actual=${matchedUsers.length}`
    )
  }

  return matchedUsers[0]
}

const main = async () => {
  loadEnvConfig(projectRoot)

  readRequiredEnv(SUPABASE_URL_ENV)
  readRequiredEnv(SERVICE_ROLE_ENV)
  const nextPassword = readRequiredEnv(ACADEMY_PASSWORD_ENV)

  const supabase = getServiceRoleClient()
  const user = await findSingleDemoAcademyUser(supabase)

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: nextPassword
  })

  if (error) {
    throw new Error(`demo academy 비밀번호 변경 실패: ${error.message}`)
  }

  console.log("[demo-password] demo@firstsuup.com 비밀번호 변경 완료")
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
  console.error(`[demo-password] ${message}`)
  process.exitCode = 1
})

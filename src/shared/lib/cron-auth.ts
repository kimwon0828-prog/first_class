// Vercel Cron 요청 인증.
//
// production 에서는 CRON_SECRET 이 반드시 있어야 하고, Bearer 로 일치해야 한다.
// 개발에서는 secret 이 없으면 열어 두되, 있으면 똑같이 검사한다.
//
// trial-reminders 에 있던 규칙을 그대로 옮긴 것이다. cron 이 늘어날 때마다
// 같은 인증을 복사하면 한 곳만 느슨해진다.

export type CronAuthMode = "public_dev" | "shared_secret"

export const resolveCronAuthMode = (request: Request): CronAuthMode => {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? ""
  const authorization = request.headers.get("authorization")?.trim() ?? ""

  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      throw new Error("missing_cron_secret_in_production")
    }

    if (authorization !== `Bearer ${cronSecret}`) {
      throw new Error("unauthorized_cron_request")
    }

    return "shared_secret"
  }

  if (!cronSecret) {
    return "public_dev"
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    throw new Error("unauthorized_cron_request")
  }

  return "shared_secret"
}

export const resolveCronErrorStatus = (message: string): number => {
  if (message === "unauthorized_cron_request") {
    return 401
  }
  if (message === "missing_cron_secret_in_production") {
    return 503
  }
  return 500
}

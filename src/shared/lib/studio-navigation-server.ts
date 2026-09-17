import "server-only"

import { getStudioNavigationPath } from "@/shared/config/studio-navigation"

import { getRequestHostname } from "./request-host"

/**
 * Server component 에서 Studio 내부 경로를 이 host 의 경로로 옮긴다.
 *
 * 링크가 여러 개인 화면은 resolver 를 한 번 받아서 재사용한다 — 화면마다
 * hostname 을 다시 읽지 않고, 경로 규칙도 S3D 의 pure helper 하나만 쓴다.
 *
 * Client 쪽은 이 함수를 쓰지 않는다. 거기서는 layout 이 내려준 값을
 * `useStudioNavigationPath` 로 읽는다 — render 중에 window 를 보지 않으려면
 * 서버가 먼저 정해서 내려줘야 하기 때문이다.
 */
export const getStudioNavigationPathResolver = async (): Promise<(internalPath: string) => string> => {
  const hostname = await getRequestHostname()

  return (internalPath: string) => getStudioNavigationPath({ internalPath, hostname })
}

/** 링크가 하나뿐인 자리를 위한 짧은 형태. */
export const resolveStudioNavigationPath = async (internalPath: string): Promise<string> => {
  const resolve = await getStudioNavigationPathResolver()

  return resolve(internalPath)
}

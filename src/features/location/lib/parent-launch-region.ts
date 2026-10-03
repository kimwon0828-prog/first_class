/** Parent discovery launch scope only; organization/Studio location data stays unchanged. */
export const PARENT_LAUNCH_REGION = {
  sidoNames: ["서울", "서울특별시"],
  sigungu: "노원구",
  label: "노원구",
  notice: "첫수업은 현재 노원구에서 먼저 만나보실 수 있어요."
} as const

export type ParentLaunchRegion = { sidoNames: readonly string[]; sigungu: string }

export const LEGACY_PARENT_LOCATION_KEYS = ["region", "radius", "sido", "sigungu", "bname"] as const

export function isInParentLaunchRegion(location: { sido?: string | null; sigungu?: string | null } | null | undefined, scope: ParentLaunchRegion) {
  return Boolean(location?.sido && scope.sidoNames.includes(location.sido) && location.sigungu === scope.sigungu)
}

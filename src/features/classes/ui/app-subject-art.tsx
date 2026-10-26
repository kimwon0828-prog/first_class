import Image from "next/image"

const subjects = new Set(["korean_language", "math", "english", "science", "social_history", "coding_it_robotics", "foreign_language", "music", "art_design", "sports_dance", "creative_mind", "other"])

export function AppSubjectArt({ code, size = 52 }: { code: string; size?: number }) {
  const name = subjects.has(code) ? code : "other"
  return <Image src={`/images/subjects-3d/${name}.png`} alt="" width={size} height={size} sizes={`${size}px`} />
}

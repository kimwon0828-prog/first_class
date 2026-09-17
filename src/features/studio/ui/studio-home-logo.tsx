"use client"

import Image from "next/image"
import Link from "next/link"

import { useStudioNavigationPath } from "@/features/studio/ui/studio-navigation-provider"
import styles from "./studio-home-logo.module.css"

type StudioHomeLogoProps = {
  className?: string
  logoClassName?: string
  width?: number
  height?: number
  priority?: boolean
}

export const StudioHomeLogo = ({
  className,
  logoClassName,
  width = 93,
  height = 30,
  priority = false
}: StudioHomeLogoProps) => {
  const homeHref = useStudioNavigationPath("/studio")

  return (
    <Link
      href={homeHref}
      aria-label="첫수업 대시보드로 이동"
      className={className ? `${styles.link} ${className}` : styles.link}
    >
      <Image
        src="/images/first-class-logo.png"
        alt="첫수업"
        width={width}
        height={height}
        priority={priority}
        className={logoClassName ? `${styles.logo} ${logoClassName}` : styles.logo}
      />
    </Link>
  )
}

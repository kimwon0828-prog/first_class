import type { ComponentProps, HTMLAttributes } from "react"
import { ParentBottomNav } from "./parent-bottom-nav"
import styles from "./parent-app-shell.module.css"

type Props = HTMLAttributes<HTMLElement> & {
  navigation?: false | Omit<ComponentProps<typeof ParentBottomNav>, "designVersion">
}
/** All Parent frames delegate navigation and its content clearance to this shell. */
export function ParentAppShell({ children, className, navigation, ...props }: Props) {
  return <main {...props} data-parent-design="v1" data-parent-app-shell
    className={`${className ?? ""} ${navigation === false ? "" : styles.withNavigation}`}>
    {children}
    {navigation === false ? null : <ParentBottomNav {...navigation} designVersion="v1" />}
  </main>
}

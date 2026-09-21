import { MyFrame } from "./my-frame"
import styles from "./page.module.css"
export default function Loading() {
  return <MyFrame><div className={styles.skeletons} role="status" aria-label="마이페이지 불러오는 중" aria-busy="true">
    {[0, 1, 2].map(key => <div className={styles.skeleton} key={key} aria-hidden="true" />)}
  </div></MyFrame>
}

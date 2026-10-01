import { MyFrame } from "./my-frame"
import styles from "./page.module.css"
export default function Loading() {
  return <MyFrame><div className={styles.skeletons} role="status" aria-label="마이페이지 불러오는 중" aria-busy="true">
    <div className={styles.skeletonProfile} aria-hidden="true"><span /><div><i /><i /></div></div>
    {[0, 1, 2].map(key => <div className={styles.skeletonGroup} key={key} aria-hidden="true"><i />{[0, 1].map(row => <div key={row}><span /><i /></div>)}</div>)}
  </div></MyFrame>
}

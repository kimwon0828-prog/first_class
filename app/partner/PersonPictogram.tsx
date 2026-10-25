import type { CSSProperties } from "react"

import styles from "./partner-v2.module.css"

const PEOPLE = 10

type PersonPictogramProps = {
  /** 0~100. 10명 중 몇 명인지로 바꿔 채운다. 마지막 사람은 소수점만큼 부분 채움. */
  value: number
}

export default function PersonPictogram({ value }: PersonPictogramProps) {
  const filled = (Math.min(Math.max(value, 0), 100) / 100) * PEOPLE

  return (
    <div className={styles.pictogram} aria-hidden="true">
      {Array.from({ length: PEOPLE }, (_, index) => {
        const ratio = Math.min(Math.max(filled - index, 0), 1)

        return (
          <span key={index} className={styles.person}>
            {ratio > 0 ? (
              <span
                className={styles.personFill}
                style={{ width: `${ratio * 100}%`, "--person-w": `${100 / ratio}%` } as CSSProperties}
              />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

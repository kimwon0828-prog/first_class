 "use client"
 
import { useMemo, useState } from "react"
 
 import styles from "./page.module.css"
 
 type HeroBanner = {
   id: string
 }
 
 type HeroBannerSliderProps = {
   banners: HeroBanner[]
 }
 
 export function HeroBannerSlider({ banners }: HeroBannerSliderProps) {
   const [activeIndex, setActiveIndex] = useState(0)
 
   const bannerIds = useMemo(() => banners.map((b) => b.id), [banners])
 
   return (
     <section>
      <div className={styles.heroTrack} aria-label="프로모션 배너">
        <div
          className={styles.heroTrackInner}
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {bannerIds.map((id) => (
            <article key={id} className={styles.heroCard}>
              <div className={styles.heroBg} />
              <div className={styles.heroOverlay} />
              <div className={styles.heroContent}>
                <div className={styles.heroBrand}>첫수업</div>
                <p className={styles.heroCopy}>
                  학원 선택의 시작은 상담이 아니라
                  <br />
                  <strong>첫 수업</strong>이어야 합니다.
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
 
       <div className={styles.heroDots} role="tablist" aria-label="배너 페이지">
         {bannerIds.map((id, index) => (
           <button
             key={id}
             type="button"
             role="tab"
             className={index === activeIndex ? `${styles.heroDot} ${styles.heroDotActive}` : styles.heroDot}
             aria-label={`${index + 1}번째 배너`}
             aria-selected={index === activeIndex}
            onClick={() => setActiveIndex(index)}
           />
         ))}
       </div>
     </section>
   )
 }

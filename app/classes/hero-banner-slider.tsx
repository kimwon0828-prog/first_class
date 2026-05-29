 "use client"
 
 import { useEffect, useMemo, useRef, useState } from "react"
 
 import styles from "./page.module.css"
 
 type HeroBanner = {
   id: string
 }
 
 type HeroBannerSliderProps = {
   banners: HeroBanner[]
 }
 
 export function HeroBannerSlider({ banners }: HeroBannerSliderProps) {
   const trackRef = useRef<HTMLDivElement | null>(null)
   const [activeIndex, setActiveIndex] = useState(0)
 
   const bannerIds = useMemo(() => banners.map((b) => b.id), [banners])
 
   useEffect(() => {
     const track = trackRef.current
     if (!track) return
 
     let rafId = 0
    const updateActiveIndex = () => {
      const items = Array.from(track.querySelectorAll<HTMLElement>(`[data-hero-item="true"]`))
      if (items.length === 0) return

      const trackRect = track.getBoundingClientRect()
      const trackCenterX = trackRect.left + trackRect.width / 2

      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < items.length; i += 1) {
        const rect = items[i].getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const distance = Math.abs(centerX - trackCenterX)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = i
        }
      }

      setActiveIndex((prev) => (prev === bestIndex ? prev : bestIndex))
    }

     const onScroll = () => {
       if (rafId) return
       rafId = window.requestAnimationFrame(() => {
         rafId = 0
        updateActiveIndex()
       })
     }
 
     track.addEventListener("scroll", onScroll, { passive: true })
    updateActiveIndex()
 
     return () => {
       track.removeEventListener("scroll", onScroll)
       if (rafId) {
         window.cancelAnimationFrame(rafId)
       }
     }
   }, [banners.length])
 
   return (
     <section>
       <div ref={trackRef} className={styles.heroTrack} aria-label="프로모션 배너">
         {bannerIds.map((id) => (
           <article key={id} className={styles.heroCard} data-hero-item="true">
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
 
       <div className={styles.heroDots} role="tablist" aria-label="배너 페이지">
         {bannerIds.map((id, index) => (
           <button
             key={id}
             type="button"
             role="tab"
             className={index === activeIndex ? `${styles.heroDot} ${styles.heroDotActive}` : styles.heroDot}
             aria-label={`${index + 1}번째 배너`}
             aria-selected={index === activeIndex}
             onClick={() => {
               const track = trackRef.current
               if (!track) return
               const items = track.querySelectorAll<HTMLElement>(`[data-hero-item="true"]`)
               const target = items[index]
               if (!target) return
              target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
             }}
           />
         ))}
       </div>
     </section>
   )
 }

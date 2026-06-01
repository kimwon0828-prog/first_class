 "use client"
 
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
 
 import styles from "./page.module.css"
 
 type HeroBanner = {
   id: string
 }
 
 type HeroBannerSliderProps = {
   banners: HeroBanner[]
 }
 
 export function HeroBannerSlider({ banners }: HeroBannerSliderProps) {
   const [activeIndex, setActiveIndex] = useState(0)
  const [dragOffsetPx, setDragOffsetPx] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [trackWidthPx, setTrackWidthPx] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    width: number
    decided: boolean
    dragging: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    width: 1,
    decided: false,
    dragging: false
  })
 
   const bannerIds = useMemo(() => banners.map((b) => b.id), [banners])
  const maxIndex = Math.max(0, bannerIds.length - 1)
  const gapPx = 5
  const peekPx = 20
  const slideWidthPx = Math.max(1, trackWidthPx - peekPx)
  const stepPx = slideWidthPx + gapPx

  useEffect(() => {
    const track = trackRef.current
    if (!track) {
      return
    }

    const update = () => {
      const nextWidth = track.getBoundingClientRect().width
      setTrackWidthPx(nextWidth)
    }

    update()
    const observer = new ResizeObserver(() => update())
    observer.observe(track)
    return () => observer.disconnect()
  }, [])
 
   return (
     <section>
      <div
        ref={trackRef}
        className={styles.heroTrack}
        aria-label="프로모션 배너"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) {
            return
          }

          const track = trackRef.current
          const width = track?.getBoundingClientRect().width ?? 1
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            width: width <= 0 ? 1 : width,
            decided: false,
            dragging: false
          }

          setDragOffsetPx(0)
          setIsDragging(false)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragRef.current.pointerId !== event.pointerId) {
            return
          }

          const dx = event.clientX - dragRef.current.startX
          const dy = event.clientY - dragRef.current.startY

          if (!dragRef.current.decided) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
              return
            }

            dragRef.current.decided = true
            dragRef.current.dragging = Math.abs(dx) > Math.abs(dy)
            setIsDragging(dragRef.current.dragging)
          }

          if (!dragRef.current.dragging) {
            return
          }

          const clamped = Math.max(-dragRef.current.width, Math.min(dragRef.current.width, dx))
          setDragOffsetPx(clamped)
        }}
        onPointerUp={(event) => {
          if (dragRef.current.pointerId !== event.pointerId) {
            return
          }

          const dx = event.clientX - dragRef.current.startX
          const shouldChange = Math.abs(dx) >= Math.min(60, Math.max(40, dragRef.current.width * 0.12))

          if (dragRef.current.dragging && shouldChange) {
            if (dx < 0) {
              setActiveIndex((prev) => Math.min(maxIndex, prev + 1))
            } else {
              setActiveIndex((prev) => Math.max(0, prev - 1))
            }
          }

          dragRef.current.pointerId = null
          dragRef.current.decided = false
          dragRef.current.dragging = false
          setDragOffsetPx(0)
          setIsDragging(false)
        }}
        onPointerCancel={() => {
          dragRef.current.pointerId = null
          dragRef.current.decided = false
          dragRef.current.dragging = false
          setDragOffsetPx(0)
          setIsDragging(false)
        }}
      >
        <div
          className={styles.heroTrackInner}
          style={{
            transform: `translateX(${-activeIndex * stepPx + dragOffsetPx}px)`,
            transition: isDragging ? "none" : undefined
          }}
        >
          {bannerIds.map((id) => (
            <article
              key={id}
              className={styles.heroCard}
              style={{ width: slideWidthPx }}
            >
              <Image
                src="/images/hero-banner-bg.png"
                alt="프로모션 배너"
                fill
                sizes="(max-width: 430px) 100vw, 430px"
                style={{ objectFit: "cover" }}
                priority={activeIndex === 0}
              />
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

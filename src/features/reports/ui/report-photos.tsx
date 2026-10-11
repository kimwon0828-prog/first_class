"use client"
import { useEffect, useRef, useState } from "react"
import { attachmentUrl, type ReportAttachment } from "../lib/report-attachments"
import styles from "./report-photos.module.css"

export function PhotoViewer({ photo, src, onClose }: { photo: Pick<ReportAttachment,"caption"|"width"|"height">; src: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [zoom,setZoom] = useState(1)
  useEffect(() => {
    const previous=document.activeElement as HTMLElement|null, dialog=ref.current
    const overflow=document.body.style.overflow
    document.body.style.overflow="hidden"; dialog?.showModal()
    return()=>{dialog?.close();document.body.style.overflow=overflow;previous?.focus()}
  },[])
  return <dialog ref={ref} className={styles.viewer} aria-label="사진 확대" onKeyDown={event=>{
    if(event.key!=="Tab")return
    event.stopPropagation()
    const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),[tabindex='0']")??[])
    const target=event.shiftKey&&document.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&document.activeElement===controls.at(-1)?controls[0]:null
    if(target){event.preventDefault();target.focus()}
  }} onCancel={e=>{e.preventDefault();onClose()}}>
    <div className={styles.viewerHead}><span>{photo.caption || "수업 사진·자료"}</span><div className={styles.viewerControls}>
      <button type="button" className={styles.button} aria-label="축소" disabled={zoom===1} onClick={()=>setZoom(x=>Math.max(1,x-0.5))}>−</button>
      <button type="button" className={styles.button} aria-label="확대" disabled={zoom===4} onClick={()=>setZoom(x=>Math.min(4,x+0.5))}>＋</button>
      <button type="button" className={styles.button} onClick={onClose}>닫기</button>
    </div></div>
    <div className={styles.viewport} tabIndex={0} aria-label="확대한 사진 이동 영역">
      {/* Private authenticated route: do not proxy via the public Next image cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={photo.caption || "첨부 사진 원본"} width={photo.width} height={photo.height} className={styles.zoomImage} style={{width:`${zoom*100}%`}} />
    </div>
  </dialog>
}
export function ReportPhotos({ attachments }: { attachments: readonly ReportAttachment[] }) {
  const [opened,setOpened]=useState<ReportAttachment|null>(null)
  const [failed,setFailed]=useState<string[]>([])
  const [retry,setRetry]=useState(0)
  if (!attachments.length) return null
  return <section className={styles.section} aria-label="수업 사진·자료"><h3>수업 사진·자료</h3>
    <div className={styles.parentList}>{attachments.map((photo,index)=><figure key={photo.id} className={styles.item}>
      {failed.includes(photo.id)?<div className={styles.failedImage} role="alert">사진을 불러오지 못했어요. <button type="button" className={styles.button} onClick={()=>{setRetry(x=>x+1);setFailed(ids=>ids.filter(id=>id!==photo.id))}}>다시 보기</button></div>:<button type="button" className={styles.imageButton} aria-label={`${index+1}번 사진 확대`} onClick={()=>setOpened(photo)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${attachmentUrl(photo.id)}?retry=${retry}`} alt={photo.caption||`수업 사진 ${index+1}`} width={photo.width} height={photo.height} className={styles.image} onError={()=>setFailed(ids=>[...ids,photo.id])}/>
      </button>}
      {photo.caption?<figcaption className={styles.text}>{photo.caption}</figcaption>:null}
    </figure>)}</div>
    {opened?<PhotoViewer photo={opened} src={attachmentUrl(opened.id)} onClose={()=>setOpened(null)}/>:null}
  </section>
}

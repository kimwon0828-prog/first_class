"use client"
import { useRef, useState, useEffect } from "react"
import { attachmentUrl, REPORT_PHOTO_LIMIT, REPORT_PHOTO_CAPTION, parseReportAttachments, validateClientPhoto, type ReportAttachment } from "../lib/report-attachments"
import { PhotoViewer } from "./report-photos"
import styles from "./report-photos.module.css"

type Pending = { key: string; file: File; error: string | null; uploading: boolean }
export function ReportPhotoEditor({ applicationId, value, onChange, disabled, onBlockedChange }: {
  applicationId: string; value: ReportAttachment[]; onChange: (photos: ReportAttachment[])=>void; disabled: boolean; onBlockedChange: (blocked:boolean)=>void
}) {
  const [pending,setPending]=useState<Pending[]>([])
  const [removed,setRemoved]=useState<{ photo: ReportAttachment; index: number }[]>([])
  const [error,setError]=useState("")
  const [opened,setOpened]=useState<ReportAttachment|null>(null)
  const input=useRef<HTMLInputElement>(null), current=useRef(value), mounted=useRef(true), busy=useRef(false)
  current.current=value
  const busyCount=pending.filter(p=>p.uploading).length
  useEffect(()=>{onBlockedChange(pending.length>0);return()=>onBlockedChange(false)},[pending.length,onBlockedChange])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const upload=async(item:Pending)=>{
    busy.current=true
    setPending(rows=>rows.map(row=>row.key===item.key?{...row,error:null,uploading:true}:row))
    try {
      await validateClientPhoto(item.file)
      const form=new FormData();form.set("file",item.file);form.set("applicationId",applicationId)
      const response=await fetch("/api/report-attachments",{method:"POST",body:form})
      const data=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(data?.error || "사진 업로드에 실패했어요. 다시 시도해 주세요.")
      const parsed=parseReportAttachments([data]);if(!parsed)throw new Error("사진 업로드 결과를 확인하지 못했어요.")
      if(!mounted.current)return
      onChange([...current.current,...parsed]);setPending(rows=>rows.filter(row=>row.key!==item.key))
    }catch(caught){if(mounted.current)setPending(rows=>rows.map(row=>row.key===item.key?{...row,uploading:false,error:caught instanceof Error?caught.message:"업로드에 실패했어요."}:row))}
    finally{busy.current=false}
  }
  const select=async(files:File[])=>{
    if(busy.current||disabled)return
    if(value.length+pending.length+files.length>REPORT_PHOTO_LIMIT){setError("사진은 최대 6장까지 첨부할 수 있어요.");return}
    setError("")
    // Sequential requests bound memory/network usage; every item remains visible on failure.
    const entries=files.map(file=>({key:crypto.randomUUID(),file,error:null,uploading:true}))
    setPending(rows=>[...rows,...entries]);busy.current=true
    for(const item of entries){if(!mounted.current)break;await upload(item)}
  }
  const move=(index:number,delta:number)=>{const next=[...value];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange(next)}
  return <section className={styles.section} aria-label="사진 첨부">
    <div className={styles.head}><h3>사진 첨부 <small>선택</small></h3><button type="button" className={styles.button} disabled={disabled||busyCount>0||value.length+pending.length>=REPORT_PHOTO_LIMIT} onClick={()=>input.current?.click()}>＋ 사진 추가</button></div>
    <input ref={input} className={styles.hidden} aria-label="첨부 사진 선택" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled||busyCount>0} onChange={event=>{void select(Array.from(event.target.files??[]));event.target.value=""}}/>
    <p className={styles.hint}>최대 6장 · 장당 4MiB · JPEG, PNG, WebP · 설명은 선택이에요.</p>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <div className={styles.grid}>{value.map((photo,index)=><div key={photo.id} className={styles.item}>
      <button type="button" className={styles.imageButton} aria-label={`${index+1}번 첨부 사진 확대`} onClick={()=>setOpened(photo)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentUrl(photo.id)} alt={photo.caption||`첨부 사진 ${index+1}`} width={photo.width} height={photo.height} className={`${styles.image} ${styles.editorImage}`}/>
      </button>
      <div className={styles.controls}>
        <button type="button" className={styles.button} disabled={disabled||busyCount>0||index===0} aria-label={`${index+1}번 사진 앞으로`} onClick={()=>move(index,-1)}>←</button>
        <button type="button" className={styles.button} disabled={disabled||busyCount>0||index===value.length-1} aria-label={`${index+1}번 사진 뒤로`} onClick={()=>move(index,1)}>→</button>
        <button type="button" className={styles.button} disabled={disabled||busyCount>0} aria-label={`${index+1}번 사진 삭제`} onClick={()=>{setRemoved(rows=>[...rows,{photo,index}]);onChange(value.filter(p=>p.id!==photo.id))}}>삭제</button>
      </div>
      <input aria-label={`${index+1}번 사진 설명 (선택)`} className={styles.caption} placeholder="사진 설명 (선택)" maxLength={REPORT_PHOTO_CAPTION} value={photo.caption} disabled={disabled} onChange={e=>onChange(value.map(p=>p.id===photo.id?{...p,caption:e.target.value}:p))}/>
    </div>)}</div>
    {pending.map(item=><div key={item.key} className={styles.text} role={item.error?"alert":"status"}>
      <span>{item.file.name} · {item.uploading?"업로드 중…":item.error}</span>
      {!item.uploading?<div className={styles.controls}><button type="button" className={styles.button} disabled={disabled||busyCount>0} onClick={()=>void upload(item)}>다시 시도</button><button type="button" className={styles.button} disabled={disabled||busyCount>0} onClick={()=>setPending(rows=>rows.filter(p=>p.key!==item.key))}>제외</button></div>:null}
    </div>)}
    {pending.length?<p className={styles.hint}>업로드를 완료하거나 실패한 사진을 제외한 뒤 기록을 저장해 주세요.</p>:null}
    {removed.length?<div className={styles.removed}><p className={styles.hint}>삭제는 기록 저장 시 반영돼요.</p>{removed.map(({photo,index})=><button key={photo.id} type="button" className={styles.button} disabled={disabled||busyCount>0||value.length+pending.length>=REPORT_PHOTO_LIMIT} onClick={()=>{const next=[...value];next.splice(Math.min(index,next.length),0,photo);onChange(next);setRemoved(rows=>rows.filter(p=>p.photo.id!==photo.id))}}>삭제 취소{photo.caption?` · ${photo.caption}`:""}</button>)}</div>:null}
    {opened?<PhotoViewer photo={opened} src={attachmentUrl(opened.id)} onClose={()=>setOpened(null)}/>:null}
  </section>
}

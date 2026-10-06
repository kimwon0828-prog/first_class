"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getStudioBookingDayAction, manageBookingTimesAction } from "../actions/manage-booking-times"
import { groupBookingOccurrences, previewBookingClosure, emptyBookingDay, visibleBookingOccurrences, bookingClassOptions, type BookingDay, type BookingClosure } from "../lib/booking-closures"
import { formatSelectedDateLabel } from "../lib/studio-schedule-month"
import styles from "./booking-time-dialog.module.css"
const clock = (at: string) => new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at))
export const bookingTimeLabel = (row: { startAt: string; endAt: string }) => `${clock(row.startAt)}~${clock(row.endAt)}`
export function BookingTimeDialog({dateKey: initialDate, initialClassId, todayKey, onClose, onChange}: {dateKey:string;initialClassId:string|null;todayKey:string;onClose:()=>void;onChange:(dateKey:string,closures:BookingClosure[])=>void}) {
 const dialog=useRef<HTMLDialogElement>(null), request=useRef(0), alive=useRef(true), inFlight=useRef(false)
 const [dateKey,setDateKey]=useState(initialDate),[classId,setClassId]=useState<string|null>(initialClassId),[day,setDay]=useState<BookingDay>(emptyBookingDay())
 const [selected,setSelected]=useState<string[]>([]),[selectedClosureIds,setSelectedClosureIds]=useState<string[]>([]),[reason,setReason]=useState(""),[loading,setLoading]=useState(true),[applying,setApplying]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState("")
 const changeRef=useRef(onChange);changeRef.current=onChange
 const load=useCallback(async()=>{const id=++request.current;setLoading(true);setError(null);try{const r=await getStudioBookingDayAction(dateKey);if(!alive.current||id!==request.current)return;if(r.error){setError(r.error);setDay(emptyBookingDay())}else{setDay(r.data);changeRef.current(dateKey,r.data.closures)}}catch{if(alive.current&&id===request.current)setError("예약 시간을 불러오지 못했습니다.")}finally{if(alive.current&&id===request.current)setLoading(false)}},[dateKey])
 useEffect(()=>{alive.current=true;if(!dialog.current?.open)dialog.current?.showModal();return()=>{alive.current=false}},[])
 useEffect(()=>{void load()},[load])
 const classes=useMemo(()=>bookingClassOptions(day),[day])
 const groups=useMemo(()=>groupBookingOccurrences(visibleBookingOccurrences(day).filter(o=>!classId||o.classId===classId)),[day,classId])
 const closePreview=previewBookingClosure(day,selected,classId,"close"),releaseBase=previewBookingClosure(day,selected,classId,"release")
 const releaseIds=[...new Set([...releaseBase.closureIds,...selectedClosureIds])]
 const releaseWindows=day.closures.filter(c=>releaseIds.includes(c.id)&&c.classId===classId)
 const releaseTargets=day.occurrences.filter(o=>(!classId||o.classId===classId)&&releaseWindows.some(c=>Date.parse(c.startAt)<Date.parse(o.endAt)&&Date.parse(c.endAt)>Date.parse(o.startAt)))
 const releasePreview={...releaseBase,targets:releaseTargets,closureIds:releaseWindows.map(c=>c.id),reservationCount:new Set(releaseTargets.flatMap(o=>o.reservationIds)).size,canApply:releaseWindows.length>0}
 const dismiss=()=>{if(!inFlight.current){dialog.current?.close();onClose()}}
 const past=dateKey<todayKey
 const apply=async(mode:"close"|"release")=>{
  const preview=mode==="close"?closePreview:releasePreview
  if(inFlight.current||!preview.canApply||past)return
  inFlight.current=true;setApplying(true);setError(null);setNotice("")
  try{const r=await manageBookingTimesAction({dateKey,classId,mode,slotKeys:mode==="release"?[]:selected,expectedTargets:preview.targets.map(o=>o.key),closureIds:preview.closureIds,reason:reason.trim()||null})
   if(r.error){setError(r.error);return}
   setSelected([]);setSelectedClosureIds([]);setNotice(mode==="close"?`예약 마감 ${r.changed}건을 적용했습니다.`:`예약 마감 ${r.changed}건을 해제했습니다.`);await load()
  }catch{setError("변경을 적용하지 못했습니다. 다시 시도해 주세요.")}
  finally{inFlight.current=false;setApplying(false)}
 }
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="booking-time-title" onCancel={e=>{e.preventDefault();dismiss()}} onClose={()=>{if(!applying)onClose()}}>
  <header className={styles.head}><div><p className={styles.eyebrow}>예약 시간 관리</p><h2 id="booking-time-title">{formatSelectedDateLabel(dateKey)}</h2><p>신규 예약을 마감할 시간을 선택하세요.</p></div><button type="button" className={styles.close} aria-label="예약 시간 관리 닫기" disabled={applying} onClick={dismiss}>×</button></header>
  <div className={styles.body}>
   <label className={styles.field}>선택 날짜<input type="date" value={dateKey} disabled={applying} onChange={e=>{if(e.target.value){setSelected([]);setSelectedClosureIds([]);setNotice("");setDateKey(e.target.value)}}}/></label>
   <label className={styles.field}>적용 과정<select aria-label="적용 과정" value={classId??""} disabled={loading||applying} onChange={e=>{setClassId(e.target.value||null);setSelected([]);setSelectedClosureIds([]);setNotice("")}}><option value="">전체 과정</option>{classId&&!classes.some(o=>o.value===classId)?<option value={classId}>선택 과정 · 현재 회차 없음</option>:null}{classes.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select></label>
   {loading?<p role="status">예약 시간을 불러오는 중입니다.</p>:groups.length===0?<p>이 날짜에 제공되는 예약 시간이 없습니다.</p>:<div className={styles.table}>
    <div className={styles.tableHead}><span>선택</span><span>시간 / 과정</span><span>예약 상태</span></div>
    {groups.map(group=>{const first=group[0],closed=group.filter(o=>o.closureIds.length>0).length,checked=group.every(o=>selected.includes(o.key)),reservations=new Set(group.flatMap(o=>o.reservationIds)).size
     const baseRestricted=group.some(o=>o.bookingStatus!=="open"),cutoff=Date.parse(first.startAt)<Date.now()+86400000
     const full=group.some(o=>o.reservationIds.length>=o.capacity)
     return <label key={`${first.startAt}/${first.endAt}`} className={`${styles.timeRow} ${checked?styles.selected:""}`}>
      <input type="checkbox" aria-label={`${bookingTimeLabel(first)} ${group.map(o=>o.classTitle).join(", ")}`} checked={checked} disabled={applying||past} onChange={()=>setSelected(current=>checked?current.filter(k=>!group.some(o=>o.key===k)):[...new Set([...current,...group.map(o=>o.key)])])}/>
      <span><strong>{bookingTimeLabel(first)}</strong><small>{[...new Set(group.map(o=>o.classTitle))].join(" · ")}</small></span>
      <span className={closed?styles.closed:styles.available}>{closed===group.length?"예약 마감":closed?"일부 과정 마감":baseRestricted?"기본 마감·비공개":full?"만석":cutoff?"24시간 예약 제한":"예약 가능"}<small>기존 예약 {reservations}건</small></span>
     </label>
    })}
   </div>}
   {day.closures.filter(c=>c.classId===classId).length>0?<section aria-label="저장된 예약 마감"><h3>이미 마감된 시간</h3>{day.closures.filter(c=>c.classId===classId).map(c=><label className={styles.timeRow} key={c.id}><input type="checkbox" checked={selectedClosureIds.includes(c.id)} disabled={applying||past} aria-label={`${bookingTimeLabel(c)} 저장된 마감 해제 선택`} onChange={()=>setSelectedClosureIds(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])}/><span>{bookingTimeLabel(c)}<small>{c.classId?"특정 과정":"학원 전체"}</small></span><span className={styles.closed}>예약 마감</span></label>)}</section>:null}
   <label className={styles.field}>사유 (선택)<textarea value={reason} maxLength={500} rows={2} disabled={applying} onChange={e=>setReason(e.target.value)} placeholder="학원 내부에만 표시됩니다."/></label>
   {selected.length>0||selectedClosureIds.length>0?<div className={styles.preview} aria-label="적용 대상 미리보기"><strong>마감 적용 대상 {closePreview.targets.length}회차</strong><ul>{closePreview.targets.map(o=><li key={o.key}>{o.classTitle} · {bookingTimeLabel(o)}</li>)}</ul>
    {releasePreview.closureIds.length>0?<p>해제 대상 마감 {releasePreview.closureIds.length}건 · 영향 {releasePreview.targets.length}회차{releaseWindows.map(c=><small key={c.id}> · {bookingTimeLabel(c)}</small>)}</p>:<p>선택한 과정 범위에서 해제할 마감이 없습니다. 학원 전체 마감은 전체 과정에서 해제하세요.</p>}
    <p>기존 예약 {new Set([...closePreview.targets,...releasePreview.targets].flatMap(o=>o.reservationIds)).size}건은 유지됩니다.<br/>일정 변경이 필요하면 별도로 처리해 주세요.</p>
   </div>:null}
   {day.closures.filter(c=>c.reason&&(!classId||!c.classId||c.classId===classId)).map(c=><p className={styles.reason} key={c.id}>{bookingTimeLabel(c)} · {c.classId?"과정 마감":"학원 전체 마감"} · 내부 사유: {c.reason}</p>)}
   {past?<p>지난 날짜는 조회만 가능합니다.</p>:null}
   {error?<div role="alert"><p>{error}</p><button type="button" disabled={applying} onClick={()=>void load()}>다시 불러오기</button></div>:null}
   {notice?<p role="status">{notice}</p>:null}
   <p className={styles.note}>마감 해제는 이 제한만 제거합니다. 만석·휴무·기본 마감·24시간 예약 제한은 유지됩니다.</p>
  </div>
  <footer className={styles.footer}><span>선택한 시간 <strong>{new Set([...closePreview.selected,...releaseWindows].map(o=>`${o.startAt}/${o.endAt}`)).size}개</strong><small>이 날짜에만 적용되며 기본 운영시간은 유지됩니다.</small></span><div><button type="button" disabled={loading||applying||past||!releasePreview.canApply} onClick={()=>void apply("release")}>선택 시간 마감 해제</button><button type="button" className={styles.primary} disabled={loading||applying||past||!closePreview.canApply} onClick={()=>void apply("close")}>{applying?"적용 중…":"선택 시간 마감"}</button></div></footer>
 </dialog>
}

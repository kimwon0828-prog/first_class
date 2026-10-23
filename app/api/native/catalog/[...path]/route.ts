import { projectNativeCatalogClass as project, projectNativeMapLocation } from "@/features/native/server/catalog-projection"
import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { getPublicAcademyClasses } from "@/features/academies/queries/get-public-academy-classes"
import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getPublicAcademyFeedback, getPublicClassFeedback } from "@/features/feedback/queries/get-public-feedback"
import { feedbackChipLabel, type PublicFeedbackSummary } from "@/features/feedback/lib/experience-feedback"
import { getPublicClassAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { LEARNER_GRADES } from "@/shared/constants/education-taxonomy"
import { resolveClassDiscoveryContext } from "@/features/classes/queries/resolve-class-discovery-context"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { loadAcademyCardDetails } from "@/features/native/server/academy-cards"
import { homeSection, loadCardSlots, publicSlotProjection, slotDurationMinutes, withinWeek, type CardSlotsResult } from "@/features/native/server/catalog-slots"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Only the web's existing public discovery projection is exposed here.
// The same public slot projection the class detail returns.
const publicSlots = publicSlotProjection
const eligibleGradesOf = (targetAge: string) => LEARNER_GRADES.filter(g=>isChildEligibleForClass(g.value,targetAge))
// Academy class cards: one batched read of the class detail's price/image/format/target grades (same public filter as the
// class detail) plus only the slots a card shows, read for all classes at once. The class detail keeps its full slot list.
// Missing values stay null (no detail row → no price, grades or duration are made up).
async function academyClassCards<T extends { id: string }>(cards: T[]) {
 const ids=cards.map(card=>card.id),client=getSupabaseServiceRoleClient(),now=Date.now()
 const [details,slots]=await Promise.all([
  loadAcademyCardDetails(client,ids).catch(()=>null),
  loadCardSlots(ids,now)
 ])
 return cards.map(card=>{
  const detail=details?.get(card.id),cardSlots=detail?slots.get(card.id)?.slots ?? []:[]
  return {...card,
   programType:detail?.programType ?? null, trialPrice:detail?.trialPrice ?? null, trialPriceConfirmed:detail?.trialPriceConfirmed ?? null,
   coverImageUrl:detail?.coverImageUrl ?? null, classFormat:detail?.classFormat ?? null,
   eligibleGrades:detail?.targetAge!=null?eligibleGradesOf(detail.targetAge):null, durationMinutes:slotDurationMinutes(cardSlots),
   slotsError:details===null?"class_detail_unavailable":slots.get(card.id)?.slotsError ?? null, slots:cardSlots}
 })
}
// Home and class-list items: the existing projection plus the card slots (added fields only).
const withSlots = (item: ClassSummary, slotsById: Map<string, CardSlotsResult>) => {
 const slots=slotsById.get(item.id)
 return {...project(item), slotsError:slots?.slotsError ?? null, slots:slots?.slots ?? []}
}
// Use only the existing public aggregate, never a parent's private feedback row.
const feedbackProjection = (summary: PublicFeedbackSummary) => ({ chips: summary.chips.map(({ id, count }) => ({ id, count, label: feedbackChipLabel(id) })) })
function respond(request: Request, body: unknown, status=200) {
 const response=Response.json(body,{status,headers:{"Cache-Control":"no-store"}})
 const origin=request.headers.get("origin")
 if(process.env.NODE_ENV==="development" && ["http://localhost:8081","http://127.0.0.1:8081"].includes(origin ?? "")) {
 response.headers.set("Access-Control-Allow-Origin",origin!);response.headers.set("Vary","Origin")
 }
 return response
}
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}) {
 try {
 const path=(await params).path,url=new URL(request.url)
 if(path.length===2 && path[0]==="academies") {
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(path[1])) return respond(request,{error:"not_found"},404)
  const academy=await getPublicAcademyPageByHandle(path[1])
  if(!academy) return respond(request,{error:"not_found"},404)
  const [cards,feedback]=await Promise.all([getPublicAcademyClasses(academy.organizationId),getPublicAcademyFeedback(academy.organizationId)])
  const classes=await academyClassCards(cards)
  const { organizationId,slug,name,branchName,address,phone,regionLabel,logoImageUrl,coverImageUrl,shortDescription,description,operatingHours,parkingInfo,directions }=academy
  return respond(request,{mapLocation:projectNativeMapLocation(academy.latitude,academy.longitude),organizationId,slug,name,branchName,address,phone,regionLabel,logoImageUrl,coverImageUrl,shortDescription,description,operatingHours,parkingInfo,directions,classes,feedback:feedbackProjection(feedback)})
 }
 if(path.length===1 && path[0]==="favorites") {
  const {data,error}=await getAllPublicClasses()
  if(error) return respond(request,{error:"catalog_unavailable"},503)
  return respond(request,{items:data.map(project)})
 }
 if(path.length===2 && path[0]==="classes" && /^[0-9a-f-]{36}$/i.test(path[1])) {
 const view=url.searchParams.get("view")
 if(view && view!=="summary" && view!=="availability") return respond(request,{error:"invalid_query"},400)
 if(view==="summary") {
  const {data,error}=await getPublicClassDetail(path[1])
  if(error) return respond(request,{error:"catalog_unavailable"},503)
  if(!data) return respond(request,{error:"not_found"},404)
  return respond(request,{...project(data),assignmentMode:data.assignmentMode})
 }
 if(view==="availability") {
  // A thin visibility check keeps unpublished classes unavailable without loading their whole introduction twice.
  const [visible,slots,feedback]=await Promise.all([
   getSupabaseServiceRoleClient().from("classes").select("id").eq("id",path[1]).eq("is_active",true).is("archived_at",null).maybeSingle(),
   getPublicClassAvailableSlots(path[1]),getPublicClassFeedback(path[1])
  ])
  if(visible.error) return respond(request,{error:"catalog_unavailable"},503)
  if(!visible.data) return respond(request,{error:"not_found"},404)
  return respond(request,{feedback:feedbackProjection(feedback),slotsError:slots.error,slots:publicSlots(slots)})
 }
 const [{data,error},slots,feedback]=await Promise.all([
  getPublicClassDetail(path[1]),getPublicClassAvailableSlots(path[1]),getPublicClassFeedback(path[1])
 ])
 if(error) return respond(request,{error:"catalog_unavailable"},503)
 if(!data) return respond(request,{error:"not_found"},404)
 return respond(request,{...project(data),feedback:feedbackProjection(feedback),assignmentMode:data.assignmentMode,slotsError:slots.error,slots:publicSlots(slots)})
 }
 if(path.length!==1 || !["home","classes","academies"].includes(path[0])) return respond(request,{error:"not_found"},404)
 const q=url.searchParams.get("q")??undefined,subjectCategory=url.searchParams.get("subjectCategory")??undefined,grade=url.searchParams.get("grade")
 const within=url.searchParams.get("within")
 if((q?.length??0)>100 || (subjectCategory?.length??0)>60 || (grade?.length??0)>30) return respond(request,{error:"invalid_query"},400)
 // within=7d (수업 목록만): 지금부터 7일 안에 신청 가능한 일정이 있는 수업만, 가장 빠른 일정 순.
 if(within!==null && (within!=="7d" || path[0]!=="classes")) return respond(request,{error:"invalid_query"},400)
 if(path[0]==="academies") {
 const items=await getAcademiesForList({launchRegion:PARENT_LAUNCH_REGION,includeLogos:true,sort:"name",query:q})
 return respond(request,{items:items.map(({id,displayName,subjectTags,bname,sigungu,logoImageUrl})=>({id,displayName,subjectTags,locationLabel:[sigungu,bname].filter(Boolean).join(" "),logoImageUrl:logoImageUrl??null}))})
 }
 // Launch-region academy discovery does not depend on the class/grade result. Start both immediately.
 const [context,academies]=await Promise.all([
  // 홈은 이번 주 수업을 고른 뒤 6개로 자르므로 앞의 몇 개만 미리 불러오지 않는다.
  resolveClassDiscoveryContext({q,subjectCategory}),
  path[0]==="home"?getAcademiesForList({launchRegion:PARENT_LAUNCH_REGION,includeLogos:true,sort:"name"})
   .then(data=>({data:data.slice(0,3),error:false})).catch(()=>({data:[],error:true})):Promise.resolve(null)
 ])
 if(context.error) return respond(request,{error:"catalog_unavailable"},503)
 // Same eligibility helper as web Home; no new matching score or age inference.
 let items=grade?context.classes.filter(item=>isChildEligibleForClass(grade,item.targetAge)):context.classes
 const organization=url.searchParams.get("organization")
 if(organization) items=items.filter(item=>item.organization?.id===organization)
 const now=Date.now(),slotsById=await loadCardSlots(items.map(item=>item.id),now)
 // 홈: 이번 주 신청 가능 수업(this_week) → 없으면 학년 조건만 적용한 전체를 일정 빠른 순(upcoming). 6개로 자르는 것은 그 뒤.
 const home=path[0]==="home"?homeSection(items,slotsById,now):null
 if(home) items=home.items.slice(0,6)
 else if(within==="7d") items=withinWeek(items,slotsById,now)
 return respond(request,{items:items.map(item=>withSlots(item,slotsById)),...(home?{section:home.section}:{}),categories:context.subjectCatalog.map(({id,code,name})=>({id,code,name})),locationLabel:context.locationFilterLabel,
 academies:academies?.data.map(({id,displayName,subjectTags,bname,sigungu,logoImageUrl})=>({id,displayName,subjectTags,locationLabel:[sigungu,bname].filter(Boolean).join(" "),logoImageUrl})),academiesError:academies?.error??false})
 } catch {return respond(request,{error:"catalog_unavailable"},503)}
}

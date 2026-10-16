import { getPublicAcademyPageByHandle } from "@/features/academies/queries/get-public-academy-page"
import { getPublicAcademyClasses } from "@/features/academies/queries/get-public-academy-classes"
import { getAllPublicClasses } from "@/features/classes/queries/get-public-classes"
import { getPublicAcademyFeedback, getPublicClassFeedback } from "@/features/feedback/queries/get-public-feedback"
import { feedbackChipLabel, type PublicFeedbackSummary } from "@/features/feedback/lib/experience-feedback"
import { formatRegularPrice } from "@/shared/lib/regular-price"
import { getPublicClassAvailableSlots } from "@/features/applications/queries/get-public-class-available-slots"
import { isHiddenPublicSlot } from "@/features/applications/lib/public-class-slots"
import { LEARNER_GRADES } from "@/shared/constants/education-taxonomy"
import { resolveClassDiscoveryContext } from "@/features/classes/queries/resolve-class-discovery-context"
import { getHomeAcademies } from "@/features/classes/queries/get-home-academies"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { getAcademiesForList } from "@/features/academies/queries/get-academies-for-list"
import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatStoredTargetGrades, isChildEligibleForClass } from "@/shared/constants/grade-options"
import type { ClassSummary } from "@/shared/lib/db/adapter"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Only the web's existing public discovery projection is exposed here.
const project = (item: ClassSummary) => ({
 id:item.id, title:item.title, programType:item.programType, subject:formatClassSubjectDisplayLabel(item),
 targetAge:formatStoredTargetGrades(item.targetAge), eligibleGrades:LEARNER_GRADES.filter(g=>isChildEligibleForClass(g.value,item.targetAge)), regularPriceLabel:formatRegularPrice({type:item.regularPriceType,amount:item.regularPriceAmount}), regularPriceNote:item.regularPriceNote, trialPrice:item.trialPrice, coverImageUrl:item.coverImageUrl,
 academyName:item.organization ? [item.organization.name,item.organization.branchName].filter(Boolean).join(" ") : null,
 organizationId:item.organization?.id ?? null, locationLabel:[item.organization?.sigungu,item.organization?.bname].filter(Boolean).join(" "),
 description:item.description, recommendedFor:item.recommendedFor, experiencePoints:item.experiencePoints,
 curriculum:item.curriculum, teacherIntro:item.teacherIntro, classFormat:item.classFormat,
 address:[item.organization?.address,item.organization?.addressDetail].filter(Boolean).join(" ")
})
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
  const [classes,feedback]=await Promise.all([getPublicAcademyClasses(academy.organizationId),getPublicAcademyFeedback(academy.organizationId)])
  const { organizationId,slug,name,branchName,address,phone,regionLabel,logoImageUrl,coverImageUrl,shortDescription,description,operatingHours,parkingInfo,directions }=academy
  return respond(request,{organizationId,slug,name,branchName,address,phone,regionLabel,logoImageUrl,coverImageUrl,shortDescription,description,operatingHours,parkingInfo,directions,classes,feedback:feedbackProjection(feedback)})
 }
 if(path.length===1 && path[0]==="favorites") {
  const {data,error}=await getAllPublicClasses()
  if(error) return respond(request,{error:"catalog_unavailable"},503)
  return respond(request,{items:data.map(project)})
 }
 if(path.length===2 && path[0]==="classes" && /^[0-9a-f-]{36}$/i.test(path[1])) {
 const {data,error}=await getPublicClassDetail(path[1]);
 if(error) return respond(request,{error:"catalog_unavailable"},503)
 if(!data) return respond(request,{error:"not_found"},404)
 const [slots,feedback]=await Promise.all([getPublicClassAvailableSlots(path[1]),getPublicClassFeedback(path[1])])
 return respond(request,{...project(data),feedback:feedbackProjection(feedback),assignmentMode:data.assignmentMode,slotsError:slots.error,slots:slots.data.filter(slot=>!isHiddenPublicSlot(slot)).map(({optionId,startAt,endAt,isClosed,remainingCount})=>({optionId,startAt,endAt,isClosed,remainingCount}))})
 }
 if(path.length!==1 || !["home","classes","academies"].includes(path[0])) return respond(request,{error:"not_found"},404)
 const q=url.searchParams.get("q")??undefined,subjectCategory=url.searchParams.get("subjectCategory")??undefined,grade=url.searchParams.get("grade")
 if((q?.length??0)>100 || (subjectCategory?.length??0)>60 || (grade?.length??0)>30) return respond(request,{error:"invalid_query"},400)
 if(path[0]==="academies") {
 const items=await getAcademiesForList({launchRegion:PARENT_LAUNCH_REGION,includeLogos:true,sort:"name",query:q})
 return respond(request,{items:items.map(({id,displayName,subjectTags,bname,sigungu,logoImageUrl})=>({id,displayName,subjectTags,locationLabel:[sigungu,bname].filter(Boolean).join(" "),logoImageUrl:logoImageUrl??null}))})
 }
 const context=await resolveClassDiscoveryContext({q,subjectCategory},path[0]==="home"&&!grade?{discoveryFetchLimit:6}:{})
 if(context.error) return respond(request,{error:"catalog_unavailable"},503)
 // Same eligibility helper as web Home; no new matching score or age inference.
 let items=grade?context.classes.filter(item=>isChildEligibleForClass(grade,item.targetAge)):context.classes
 const organization=url.searchParams.get("organization")
 if(organization) items=items.filter(item=>item.organization?.id===organization)
 if(path[0]==="home") items=items.slice(0,6)
 const academies=path[0]==="home"?await getHomeAcademies(context):null
 return respond(request,{items:items.map(project),categories:context.subjectCatalog.map(({id,code,name})=>({id,code,name})),locationLabel:context.locationFilterLabel,
 academies:academies?.data.map(({id,displayName,subjectTags,bname,sigungu,logoImageUrl})=>({id,displayName,subjectTags,locationLabel:[sigungu,bname].filter(Boolean).join(" "),logoImageUrl})),academiesError:academies?.error??false})
 } catch {return respond(request,{error:"catalog_unavailable"},503)}
}

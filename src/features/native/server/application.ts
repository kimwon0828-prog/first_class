import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getAppReviewClassDetailWithSafeProjection } from '@/features/classes/queries/public-class-safe-projection'
import { getSupabaseServiceRoleClient } from '@/integrations/supabase/service-role'
import { listAvailableScheduleSlotsByClassIdWithClient } from '@/shared/lib/db/supabase-adapter'
import { getPublicClassDetail } from '@/features/classes/queries/get-public-class-detail'
import { getPublicClassAvailableSlots } from '@/features/applications/queries/get-public-class-available-slots'
import { validateTrialApplicationForm } from '@/features/applications/lib/validate-trial-application'
import { isChildEligibleForClass } from '@/shared/constants/grade-options'
import { createTrialApplicationWithClient } from '@/shared/lib/db/supabase-adapter'
import { sendStudioNotificationSafely } from '@/features/notifications/sms/send-studio-notification'
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const reply = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}})
const fields = ['childId','childName','childGrade','childSchool','childNotes','subjectExperienceYn','subjectExperienceDuration','currentLevel','preferredRegularSchedule','goalType','goalNote','selectedScheduleOptionId','memo','privacyAgreed','thirdPartyAgreed','guardianAgreed']
// Invoked only after the existing bearer, role, deletion and phone gates.
export async function nativeApplication(request:Request,path:string[],db:SupabaseClient,userId:string,user?:User) {
 let body:Record<string,unknown>={}
 if(request.method==='POST') {
  if(!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'invalid_form'},415)
  const raw=await request.text();if(raw.length>16000)return reply({error:'invalid_form'},413)
  try {body=JSON.parse(raw)}catch{return reply({error:'invalid_form'},400)}
  if(!body||Array.isArray(body)||typeof body!=='object')return reply({error:'invalid_form'},400)
 }
 const classId=request.method==='GET'?path[1]:body.classId
 if(typeof classId!=='string'||!uuid.test(classId))return reply({error:'not_found'},404)
 const review = user?.app_metadata?.app_store_review === true
 let result
 try { result = review ? {data:await getAppReviewClassDetailWithSafeProjection(db,classId),error:null} : await getPublicClassDetail(classId) }
 catch { return reply({error:'not_found'},404) }
 if(result.error)return reply({error:'catalog_unavailable'},503)
 const item=result.data;if(!item)return reply({error:'not_found'},404)
 const [children,profile]=await Promise.all([
  db.from('children').select('id,name,grade,school_name,notes,current_level,interest_subjects,goal_note').eq('parent_id',userId).order('created_at',{ascending:false}),
  db.from('profiles').select('name,phone').eq('id',userId).maybeSingle()
 ])
 if(children.error||profile.error||!profile.data)return reply({error:'account_unavailable'},503)
 if(request.method==='GET')return reply({children:(children.data??[]).map(c=>({...c,eligible:isChildEligibleForClass(c.grade,item.targetAge)})),parentName:profile.data.name,parentPhone:profile.data.phone})
 const form=new FormData()
 for(const field of fields) {
  const value=body[field];if(value==null)continue
  if(typeof value!=='string'||value.length>2000)return reply({error:'invalid_form'},400)
  form.set(field,value)
 }
 const value=validateTrialApplicationForm(form)
 if(!value.ok)return reply({error:'invalid_form',message:value.message},400)
 const child=value.childId?(children.data??[]).find(c=>c.id===value.childId):null
 if(value.childId&&!child)return reply({error:'child_not_found'},403)
 const name=child?.name??value.childName,grade=child?.grade??value.childGrade
 if(!isChildEligibleForClass(grade,item.targetAge))return reply({error:'ineligible_grade'},400)
 const parentName=profile.data.name?.trim(),parentPhone=profile.data.phone?.trim()
 if(!parentName||!parentPhone||parentPhone.length<8)return reply({error:'parent_profile_required'},400)
 let slots
 try { slots = review ? {data:await listAvailableScheduleSlotsByClassIdWithClient({classId,supabase:getSupabaseServiceRoleClient(),reviewClient:db}),error:null} : await getPublicClassAvailableSlots(classId) }
 catch { return reply({error:'slots_unavailable'},503) }
 if(slots.error)return reply({error:'slots_unavailable'},503)
 const slot=slots.data.find(s=>s.optionId===value.selectedScheduleOptionId)
 if(!slot||slot.bookingStatus==='hidden')return reply({error:'invalid_schedule_slot'},409)
 if(slot.isClosed||slot.remainingCount<=0)return reply({error:'slot_capacity_reached'},409)
 try {
  const created=await createTrialApplicationWithClient(db,{
   parentId:userId,classId,childId:child?.id??null,childName:name,childGrade:grade,parentName,parentPhone,
   childSchool:child?.school_name??value.childSchool,childNotes:value.childNotes,interestSubjects:child?.interest_subjects??null,
   subjectExperienceYn:value.subjectExperienceYn,subjectExperienceDuration:value.subjectExperienceDuration,currentLevel:value.currentLevel,
   preferredRegularSchedule:value.preferredRegularSchedule,goalType:value.goalType,goalNote:value.goalNote,memo:value.memo,selectedScheduleOptionId:value.selectedScheduleOptionId
  },review?{privateReviewClassId:classId}:undefined)
  // Preserve web notification policy; a delivery failure never changes submission success.
  try {
   if(item.organization?.id)await sendStudioNotificationSafely({organizationId:item.organization.id,createdBy:userId,
    application:{id:created.id,classId:created.classId,parentId:userId,childName:created.childName,parentName,parentPhone,classTitle:item.title,
    requestedSlotAt:created.requestedSlotAt,confirmedSlotAt:created.confirmedSlotAt,selectedScheduleLabel:created.selectedScheduleLabel??null,
    assignedTeacherId:item.assignmentMode==='preassigned'?item.teacherId:null,assignedTeacherName:item.assignmentMode==='preassigned'?item.teacherName:null},
    teacherEventType:'teacher_trial_requested',adminEventType:'admin_trial_requested',skipTeacher:item.assignmentMode!=='preassigned'})
  }catch {console.warn('[native-application] notification delivery unavailable')}
  return reply({id:created.id,status:"new"},201)
 }catch(error) {
  const code=error instanceof Error?error.message:''
  const known=['duplicate_trial_application','invalid_schedule_slot','booking_cutoff_reached','schedule_booking_closed','schedule_date_booking_closed','schedule_booking_hidden','slot_capacity_reached','parent_phone_verification_required','missing_preassigned_teacher_for_application']
  return reply({error:known.includes(code)?code:'submission_unknown'},known.includes(code)?409:503)
 }
}

// Test fixtures only. Caller MUST use an explicitly loopback Supabase client.
exports.publishFixtureReport = async (db, applicationId) => {
  const app = await db.from('trial_applications').select('child_name,child_grade,completed_at,classes(title,program_type)').eq('id',applicationId).single()
  if(app.error) throw Error(app.error.message)
  const a=app.data,c=Array.isArray(a.classes)?a.classes[0]:a.classes
  const result=await db.from('experience_reports').insert({application_id:applicationId,version:1,status:'published',content_version:2,published_at:new Date().toISOString(),content:{experience:{type:c.program_type,date:a.completed_at||new Date().toISOString(),child:{displayName:a.child_name,grade:a.child_grade},academy:{name:'TEST 첫수업 학원'},class:{title:c.title}},observations:[{code:'sustained_engagement',label:'수업 활동에 집중해서 참여했어요.'}],summary:'TEST 리포트 전체 총평입니다. 피드백을 보내지 않아도 읽을 수 있어요.',recommendation:{course:'TEST 기초 과정',level:'기초',schedule:'화요일 오후 4시'}}}).select('id').single()
  if(result.error)throw Error(result.error.message)
  return result.data.id
}

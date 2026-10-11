import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { ALL_TRIAL_RESULT_OBSERVATION_OPTIONS, TRIAL_RESULT_OBSERVATION_OPTIONS, MATH_OBSERVATION_GROUPS, getReportSubjectCategory, getObservationGroups } from "@/features/studio/lib/trial-result-options"
import { buildExperienceReportSnapshotV3, buildExperienceReportSnapshotV2, decodeExperienceReportSnapshot, groupReportObservations, hasPublishableReportContent } from "@/features/reports/lib/experience-report-snapshot"

assert.equal(ALL_TRIAL_RESULT_OBSERVATION_OPTIONS.length,106)
assert.equal(new Set(ALL_TRIAL_RESULT_OBSERVATION_OPTIONS.map(o=>o.value)).size,106)
assert.deepEqual(MATH_OBSERVATION_GROUPS.map(g=>g.options.length),[3,3,3])
for(const code of ['math','school_math','thinking_math','competition_math','arithmetic','abacus']) assert.equal(getReportSubjectCategory(null,null,code),'math')
assert.equal(getReportSubjectCategory('music','violin','math'),'music')
assert.equal(getReportSubjectCategory(null,null,'즐거운 수학 교실'),null)
assert.equal(getObservationGroups('other')[0].options,TRIAL_RESULT_OBSERVATION_OPTIONS)
const source={programType:'trial_class',confirmedSlotAt:'2026-10-05T10:00:00+09:00',completedAt:null,childName:'격리 학생',childGrade:'초3',academyName:'격리 학원',classTitle:'수업 제목',observations:['math_applied_concept'],publicSummary:'짧은 총평',recommendedCourse:null,recommendedLevel:null,recommendedSchedule:null,note:'PRIVATE_CANARY'}
const result=buildExperienceReportSnapshotV3(source);assert.equal(result.status,'ok');if(result.status!=='ok')throw Error('missing snapshot')
assert.deepEqual(result.snapshot.observations,[{code:'math_applied_concept',label:'배운 개념을 문제에 적용했어요',group:{code:'understanding_today',label:'오늘 내용의 이해'}}])
assert.equal(groupReportObservations(result.snapshot.observations).length,1)
assert(!JSON.stringify(result.snapshot).includes('PRIVATE_CANARY'))
assert.deepEqual(decodeExperienceReportSnapshot(3,result.snapshot),result.snapshot)
const frozen=structuredClone(result.snapshot);frozen.observations[0].label='발행 당시 문구';frozen.observations[0].group!.label='발행 당시 영역';assert.deepEqual(decodeExperienceReportSnapshot(3,frozen),frozen)
assert.equal(decodeExperienceReportSnapshot(3,{...frozen,observations:[{...frozen.observations[0],group:{code:'a',label:'b',note:'private'}}]}),null)
assert.equal(decodeExperienceReportSnapshot(3,{...frozen,observations:[{code:'math_applied_concept',label:'missing domain'}]}),null)
const old=buildExperienceReportSnapshotV2({...source,observations:['active_participation']});assert.equal(old.status,'ok');if(old.status!=='ok')throw Error('missing V2')
assert.deepEqual(decodeExperienceReportSnapshot(2,old.snapshot),old.snapshot)
const {summary,...v1}=old.snapshot;void summary;assert.deepEqual(decodeExperienceReportSnapshot(1,v1),v1)
const textOnly=buildExperienceReportSnapshotV3({...source,observations:[]});assert.equal(textOnly.status,'ok');if(textOnly.status==='ok'){assert(hasPublishableReportContent(textOnly.snapshot));assert.equal(groupReportObservations(textOnly.snapshot.observations).length,0)}
// Cross-boundary equivalence with the actual publication RPC executed only in isolated DB.
if(process.env.MATH_DB_SNAPSHOT){
 const actual=JSON.parse(readFileSync(process.env.MATH_DB_SNAPSHOT,'utf8'))
 const built=buildExperienceReportSnapshotV3({programType:actual.experience.type,confirmedSlotAt:actual.experience.date,completedAt:null,childName:actual.experience.child.displayName,childGrade:actual.experience.child.grade,academyName:actual.experience.academy.name,classTitle:actual.experience.class.title,observations:actual.observations.map((o:{code:string})=>o.code),publicSummary:actual.summary,recommendedCourse:actual.recommendation.course,recommendedLevel:actual.recommendation.level,recommendedSchedule:actual.recommendation.schedule})
 assert.equal(built.status,'ok');if(built.status==='ok')assert.deepEqual(built.snapshot,actual)
 assert.deepEqual(decodeExperienceReportSnapshot(3,actual),actual)
}
console.log('PASS unique math codes, stored subject classification, optional domains, immutable labels/domains, V1/V2, privacy, summary-only and Studio V3 = actual isolated DB publication')

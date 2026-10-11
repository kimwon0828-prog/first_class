import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ADDITIONAL_SUBJECT_OBSERVATION_GROUPS} from '@/features/studio/lib/subject-observation-catalog'
import {ALL_TRIAL_RESULT_OBSERVATION_OPTIONS, getReportSubjectCategory, getObservationGroups, getObservationSubject, getObservationGroupSnapshot, TRIAL_RESULT_OBSERVATION_OPTIONS} from '@/features/studio/lib/trial-result-options'
import {buildExperienceReportSnapshotV3,decodeExperienceReportSnapshot,groupReportObservations} from '@/features/reports/lib/experience-report-snapshot'
const expected=['korean_language','english','science','social_history','coding_it_robotics','foreign_language','art_design','sports_dance','creative_mind']
assert.deepEqual(Object.keys(ADDITIONAL_SUBJECT_OBSERVATION_GROUPS),expected)
assert.equal(ALL_TRIAL_RESULT_OBSERVATION_OPTIONS.length,106);assert.equal(new Set(ALL_TRIAL_RESULT_OBSERVATION_OPTIONS.map(o=>o.value)).size,106)
const doc=readFileSync('docs/report-all-subject-observations-review.md','utf8')
const source={programType:'trial_class',confirmedSlotAt:'2026-10-10T14:00:00+09:00',completedAt:null,childName:'격리 학생',childGrade:'초3',academyName:'격리 학원',classTitle:'제목으로 판정하지 않음',publicSummary:'짧은 총평',recommendedCourse:null,recommendedLevel:null,recommendedSchedule:null,note:'PRIVATE_CANARY'}
for(const [category,groups] of Object.entries(ADDITIONAL_SUBJECT_OBSERVATION_GROUPS)){
 assert.deepEqual(groups.map(g=>g.options.length),[3,3,3]);assert.equal(getObservationGroups(category),groups)
 assert.equal(getReportSubjectCategory(category,'piano','math'),category);assert.equal(getReportSubjectCategory(null,null,category),null)
 for(const group of groups)for(const option of group.options){
  assert(doc.includes('`'+option.value+'` | '+option.label));assert.equal(getObservationSubject(option.value),category)
  assert.deepEqual(getObservationGroupSnapshot(option.value),{code:group.code,label:group.label})
  const built=buildExperienceReportSnapshotV3({...source,observations:[option.value]});assert.equal(built.status,'ok');if(built.status!=='ok')throw Error('snapshot')
  assert.deepEqual(built.snapshot.observations,[{code:option.value,label:option.label,group:{code:group.code,label:group.label}}]);assert.equal(groupReportObservations(built.snapshot.observations).length,1)
  assert(!JSON.stringify(built.snapshot).includes('PRIVATE_CANARY'))
  const frozen=structuredClone(built.snapshot);frozen.observations[0].label='전달 당시 문구';frozen.observations[0].group!.label='전달 당시 영역';assert.deepEqual(decodeExperienceReportSnapshot(3,frozen),frozen)
 }
 const empty=buildExperienceReportSnapshotV3({...source,observations:[]});assert.equal(empty.status,'ok');if(empty.status==='ok')assert.deepEqual(groupReportObservations(empty.snapshot.observations),[])
}
for(const unknown of ['other',null,'unknown','toString','__proto__'])assert.equal(getObservationGroups(unknown)[0].options,TRIAL_RESULT_OBSERVATION_OPTIONS)
assert(process.env.SUBJECT_DB_SNAPSHOTS,'Actual isolated RPC snapshots required')
const snapshots=JSON.parse(readFileSync(process.env.SUBJECT_DB_SNAPSHOTS,'utf8'))
assert.deepEqual(Object.keys(snapshots),expected)
for(const actual of Object.values(snapshots) as Array<ReturnType<typeof JSON.parse>>){
 const built=buildExperienceReportSnapshotV3({...source,programType:actual.experience.type,confirmedSlotAt:actual.experience.date,childName:actual.experience.child.displayName,childGrade:actual.experience.child.grade,academyName:actual.experience.academy.name,classTitle:actual.experience.class.title,observations:actual.observations.map((o:{code:string})=>o.code),publicSummary:actual.summary,recommendedCourse:actual.recommendation.course,recommendedLevel:actual.recommendation.level,recommendedSchedule:actual.recommendation.schedule})
 assert.equal(built.status,'ok');if(built.status==='ok')assert.deepEqual(built.snapshot,actual);assert.deepEqual(decodeExperienceReportSnapshot(3,actual),actual)
}
console.log('PASS 81 reviewed labels/codes, master-only classification, optional groups, frozen reader/privacy, all 9 Studio previews equal actual isolated V3 snapshots')

import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {MUSIC_OBSERVATION_GROUPS, MATH_OBSERVATION_GROUPS, TRIAL_RESULT_OBSERVATION_OPTIONS, getReportSubjectCategory, getObservationGroups, getObservationSubject, getObservationGroupSnapshot} from '@/features/studio/lib/trial-result-options'
import {buildExperienceReportSnapshotV3, decodeExperienceReportSnapshot, groupReportObservations} from '@/features/reports/lib/experience-report-snapshot'
assert.deepEqual(MUSIC_OBSERVATION_GROUPS.map(g=>g.options.length),[3,3,3])
assert.equal(getReportSubjectCategory('music','piano','math'),'music')
assert.equal(getReportSubjectCategory('music','violin','piano'),'music')
assert.equal(getReportSubjectCategory('music',null,'piano'),'music')
assert.equal(getReportSubjectCategory(null,null,'피아노 교실'),null)
assert.equal(getReportSubjectCategory(null,null,'piano'),null)
assert.equal(getReportSubjectCategory('math','piano','piano'),'math')
assert.equal(getObservationGroups('music'),MUSIC_OBSERVATION_GROUPS)
assert.equal(getObservationGroups('math'),MATH_OBSERVATION_GROUPS)
assert.equal(getObservationGroups('other')[0].options,TRIAL_RESULT_OBSERVATION_OPTIONS)
for(const group of MUSIC_OBSERVATION_GROUPS)for(const option of group.options){assert.equal(getObservationSubject(option.value),'music');assert.deepEqual(getObservationGroupSnapshot(option.value),{code:group.code,label:group.label})}
for(const subject of ['piano','violin','cello','flute','guitar','drums','vocal','composition']) {
 assert.equal(getReportSubjectCategory('music',subject,'math'),'music')
 assert.equal(getObservationGroups(getReportSubjectCategory('music',subject,null)),MUSIC_OBSERVATION_GROUPS)
}
assert.equal(getReportSubjectCategory(null,null,'music'),null)
const source={programType:'trial_class',confirmedSlotAt:'2026-10-10T14:00:00+09:00',completedAt:null,childName:'격리 피아노 학생',childGrade:'초3',academyName:'격리 학원',classTitle:'관찰 확인',observations:['music_followed_rhythm_or_sound'],publicSummary:'짧은 총평',recommendedCourse:null,recommendedLevel:null,recommendedSchedule:null,note:'PRIVATE_CANARY'}
const result=buildExperienceReportSnapshotV3(source);assert.equal(result.status,'ok');if(result.status!=='ok')throw Error('missing snapshot')
assert.deepEqual(result.snapshot.observations,[{code:'music_followed_rhythm_or_sound',label:'제시된 리듬이나 소리를 따라 표현했어요',group:{code:'performance_today',label:'오늘 활동의 수행'}}])
assert.equal(groupReportObservations(result.snapshot.observations).length,1)
assert(!JSON.stringify(result.snapshot).includes('PRIVATE_CANARY'))
const frozen=structuredClone(result.snapshot);frozen.observations[0].label='전달 당시 문장';frozen.observations[0].group!.label='전달 당시 영역';assert.deepEqual(decodeExperienceReportSnapshot(3,frozen),frozen)
const empty=buildExperienceReportSnapshotV3({...source,observations:[]});assert.equal(empty.status,'ok');if(empty.status==='ok')assert.equal(groupReportObservations(empty.snapshot.observations).length,0)
if(process.env.MUSIC_DB_SNAPSHOT){
 const actual=JSON.parse(readFileSync(process.env.MUSIC_DB_SNAPSHOT,'utf8'))
 const built=buildExperienceReportSnapshotV3({...source,programType:actual.experience.type,confirmedSlotAt:actual.experience.date,childName:actual.experience.child.displayName,childGrade:actual.experience.child.grade,academyName:actual.experience.academy.name,classTitle:actual.experience.class.title,observations:actual.observations.map((o:{code:string})=>o.code),publicSummary:actual.summary,recommendedCourse:actual.recommendation.course,recommendedLevel:actual.recommendation.level,recommendedSchedule:actual.recommendation.schedule})
 assert.equal(built.status,'ok');if(built.status==='ok')assert.deepEqual(built.snapshot,actual);assert.deepEqual(decodeExperienceReportSnapshot(3,actual),actual)
}
console.log('PASS music category-only selection, music/general/math separation, 9 unique choices, optional domains, frozen snapshot, privacy and Studio preview = isolated DB V3')

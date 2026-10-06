import { deriveCasesWorkflow, type CasesWorkflowInput, type CasesListItem } from "@/features/studio/lib/cases-workflow"
export const CASES_NOW = new Date("2026-09-30T03:00:00Z")
const base: CasesWorkflowInput = { status: "completed", registrationStatus: "undecided", canceledAt: null, noShowAt: null,
  confirmedBlockStartAt: null, confirmedBlockEndAt: null, confirmedSlotAt: "2026-09-29T06:00:00Z", scheduleStartTime: null, scheduleEndTime: null,
  recordFinalized: true, reportSent: true }
export const casesWorkflowFixtures: Array<{ name: string; input: CasesWorkflowInput; expected: [string, string | null, string, boolean] }> = [
  {name:"A",input:{...base,status:"new",confirmedSlotAt:null},expected:["신청 접수","schedule","결정 전",false]},
  {name:"B",input:{...base,status:"confirmed",confirmedSlotAt:"2026-10-01T06:00:00Z"},expected:["체험 예정","trial","결정 전",false]},
  {name:"C",input:{...base,recordFinalized:false,reportSent:false},expected:["체험 완료","record","결정 전",true]},
  {name:"D",input:{...base,reportSent:false},expected:["체험 완료","report","결정 전",true]},
  {name:"E",input:{...base},expected:["체험 완료","registration","결정 전",true]},
  {name:"F",input:{...base,registrationStatus:"pending"},expected:["체험 완료","consultation","고민 중",true]},
  {name:"G",input:{...base,registrationStatus:"enrolled"},expected:["체험 완료",null,"등록 완료",true]},
  {name:"H",input:{...base,registrationStatus:"not_enrolled"},expected:["체험 완료",null,"미등록",true]},
  {name:"I",input:{...base,registrationStatus:"enrolled",reportSent:false},expected:["체험 완료","report","등록 완료",true]},
  {name:"J",input:{...base,status:"canceled",recordFinalized:false},expected:["취소",null,"취소",true]},
  {name:"K",input:{...base,status:"canceled",noShowAt:"2026-09-29T07:00:00Z"},expected:["노쇼",null,"노쇼",true]},
  {name:"L",input:{...base,registrationStatus:"enrolled",...{nextContactAt:"2026-01-01T00:00:00Z",hasAnyConsultationHistory:false}},expected:["체험 완료",null,"등록 완료",true]}
]
export const createCasesFixtureItems = (): CasesListItem[] => casesWorkflowFixtures.map(({name,input},index)=>({
  id:`fixture-${name}`,student:{name:`학생 ${name}`,grade:"elem_3"},guardian:{name:"TEST 보호자",phone:"010-0000-0000"},
  klass:{title:index===2?"아주 긴 체험수업 이름의 말줄임과 컬럼 정렬 확인":"창의 체험수업",subject:"math"},assignee:{teacherName:index%2?null:"김선생"},
  registrationStatus:input.registrationStatus,registrationReasonIds:[],workflow:deriveCasesWorkflow(input,CASES_NOW),requestedSlotAt:"2026-09-29T06:00:00Z",confirmedSlotAt:input.confirmedSlotAt,
  latestRecord:{at:"2026-09-29T06:00:00Z",label:index===5?"상담 기록":"신청 접수"}
}))

// Closed-tab summary fixtures. Private note sentinel must never reach the rendered row.
export const createCasesSummaryFixtures = () => {
  const items = createCasesFixtureItems(), notEnrolled = items.find(item => item.id === "fixture-H")!
  const reasons = ["schedule_mismatch", "price_burden", "distance_or_transport", "child_fit"]
  return [
    ...[1, 2, 4, 0, 1].map((count, index) => ({ ...notEnrolled, id: `summary-${index}`,
      student: { ...notEnrolled.student, name: `결과 ${index + 1}` }, registrationReasonIds: reasons.slice(0, count),
      ...(index === 4 ? { registrationNote: "PRIVATE_NOTE_MUST_NOT_RENDER" } : {}) })),
    ...items.filter(item => ["fixture-G", "fixture-J", "fixture-K"].includes(item.id))
  ]
}

export const casesRegistrationFilterFixtures = [
  { name: "A", input: { ...base, registrationStatus: "not_enrolled" as const } },
  { name: "B", input: { ...base, registrationStatus: "not_enrolled" as const, reportSent: false } },
  { name: "C", input: { ...base, registrationStatus: "not_enrolled" as const, recordFinalized: false, reportSent: false } },
  { name: "D", input: { ...base, registrationStatus: "not_enrolled" as const, recordFinalized: false } },
  { name: "E", input: { ...base, registrationStatus: "enrolled" as const, reportSent: false } },
  { name: "F", input: { ...base, registrationStatus: "pending" as const } },
  { name: "G", input: { ...base, registrationStatus: "undecided" as const } },
  { name: "H", input: { ...base, registrationStatus: "not_enrolled" as const, status: "canceled" as const } },
  { name: "I", input: { ...base, registrationStatus: "not_enrolled" as const, noShowAt: "2026-09-29T07:00:00Z" } }
]
export const createCasesRegistrationFixtures = (): CasesListItem[] => casesRegistrationFilterFixtures.map(({ name, input }) => ({
  ...createCasesFixtureItems()[0], id: `registration-${name}`, student: { name: `결과 ${name}`, grade: "elem_3" },
  registrationStatus: input.registrationStatus, registrationReasonIds: input.registrationStatus === "not_enrolled" ? ["schedule_mismatch", "price_burden", "child_fit", "other"] : [],
  workflow: deriveCasesWorkflow(input, CASES_NOW)
}))

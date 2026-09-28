import type { StudioApplicationDetail, StudioTrialResult } from "@/shared/lib/db/adapter"
import type { ApplicationWorkflowEvidence } from "@/features/studio/lib/application-detail-workflow-state"

export const WORKFLOW_NOW = "2026-09-27T03:00:00.000Z"
export const createWorkflowApplication = (overrides: Partial<StudioApplicationDetail> = {}): StudioApplicationDetail => ({
  id: "workflow-test", classId: "test-class", classTitle: "피아노 시간", classProgramType: "trial_class",
  academyName: "첫수업 테스트 학원", teacherDisplayName: "테스트 선생님", organizationAddress: null,
  organizationAddressDetail: null, parentId: "test-parent", childName: "테스트 학생", childGrade: "초6",
  parentName: "테스트 보호자", parentPhone: "010-0000-0000", requestedScheduleBlockId: null,
  selectedScheduleLabel: "17:00 ~ 18:00", requestedSlotAt: "2026-09-26T08:00:00.000Z",
  confirmedSlotAt: "2026-09-26T08:00:00.000Z", registrationStatus: "undecided", status: "completed",
  goalType: null, createdAt: "2026-09-20T02:00:00.000Z", updatedAt: "2026-09-26T09:00:00.000Z",
  classSubject: "piano", classRegion: null, classAssignmentMode: "post_assign", scheduleStartTime: "17:00",
  scheduleEndTime: "18:00", confirmedBlockStartAt: "2026-09-26T08:00:00.000Z",
  confirmedBlockEndAt: "2026-09-26T09:00:00.000Z", assignedTeacherId: "test-teacher",
  assignedTeacherName: "테스트 선생님", contactedAt: null, scheduledAt: null,
  completedAt: "2026-09-26T09:00:00.000Z", canceledAt: null, noShowAt: null, enrolledAt: null,
  confirmedScheduleBlockId: "test-block", childSchool: "테스트 초등학교", childNotes: null,
  subjectExperienceYn: false, subjectExperienceDuration: null, currentLevel: "처음 배워요",
  preferredRegularSchedule: "평일 오후", goalNote: "기초를 탄탄히 배우고 싶어요.", consultationNote: null,
  trialFeedback: null, finalLevel: null, finalSchedule: null, registeredCourse: null,
  unregisteredReason: null, unregisteredReasonNote: null, lostAt: null, followUpNote: null,
  nextContactAt: null, lastActivityAt: null, memo: null, regularSchedulePreference: null,
  regularSchedulePreferenceNote: null, regularSchedulePreferenceUpdatedAt: null,
  interestSubjects: null, trialResult: null, consultationLogs: [], logs: [], ...overrides
})
export const createWorkflowRecord = (overrides: Partial<StudioTrialResult> = {}): StudioTrialResult => ({
  id: "test-record", applicationId: "workflow-test", observations: ["active_participation"],
  parentReaction: null, recommendedCourse: "피아노 기초반", recommendedLevel: "기초", recommendedSchedule: "주 2회",
  nextAction: null, note: "내부 전용 테스트 메모", publicSummary: "즐겁게 수업에 참여했어요.", createdBy: "test-teacher",
  createdAt: "2026-09-26T09:10:00.000Z", updatedAt: "2026-09-26T09:10:00.000Z", ...overrides
})
export const createWorkflowEvidence = (): ApplicationWorkflowEvidence => ({
  report: { error: null, version: null, publishedAt: null, changed: false, canPublish: false },
  parentDecision: { error: null, value: null, createdAt: null },
  registration: { error: null, result: null, resolvedAt: null }
})

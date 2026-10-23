import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSeoulTodayKey, shiftDateKey } from "@/features/studio/lib/studio-schedule-month"
import { getStudioClassListItems, getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { getStudioScheduleCalendar } from "@/features/studio/queries/get-studio-schedule-calendar"
import { StudioClassesManager, type StudioClassIntro } from "@/features/studio/ui/studio-classes-manager"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"
import styles from "./page.module.css"

type StudioClassesPageProps = {
  searchParams?: Promise<{ class?: string; date?: string; month?: string }>
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const MONTH_KEY = /^\d{4}-\d{2}$/
const WEEK_LENGTH = 7

export default async function StudioClassesPage({ searchParams }: StudioClassesPageProps) {
  const params = (await searchParams) ?? {}
  const studioPath = await getStudioNavigationPathResolver()
  const teacher = await requireTeacherStudioAccess()

  // 다음 7일(오늘 포함). 월이 바뀌는 주는 두 달을 읽는다 — 기존 월 단위 일정 조회를 그대로 쓴다(읽기 전용).
  const todayKey = getSeoulTodayKey()
  const weekDateKeys = Array.from({ length: WEEK_LENGTH }, (_, offset) => shiftDateKey(todayKey, offset))
  const weekMonths = [...new Set(weekDateKeys.map((dateKey) => dateKey.slice(0, 7)))]

  const [listResult, detailResult, ...weekResults] = await Promise.all([
    getStudioClassListItems(teacher.organizationId),
    getStudioClasses(teacher.organizationId),
    ...weekMonths.map((month) =>
      getStudioScheduleCalendar({ organizationId: teacher.organizationId, month, classId: null, teacherId: null })
    )
  ])
  const weekDates = new Set(weekDateKeys)
  const weekItems = weekResults.flatMap((result) => result.data.items).filter((item) => weekDates.has(item.specificDate))
  const weekError = weekResults.find((result) => result.error)?.error ?? null

  // 수업 소개 탭 글과 체험비 확인 여부. 목록 조회에는 없는 칸이라 기존 수업 조회에서 꺼낸다.
  const intros: Record<string, StudioClassIntro> = Object.fromEntries(
    detailResult.data.map((item) => [
      item.id,
      {
        description: item.description,
        recommendedFor: item.recommendedFor,
        experiencePoints: item.experiencePoints,
        curriculum: item.curriculum,
        classFormat: item.classFormat,
        trialPriceConfirmed: item.trialPriceConfirmed
      }
    ])
  )

  // "특정 날짜만 변경하기" 팝업: ?class 와 ?date 가 있을 때만 그 수업의 한 달 일정을 읽는다(수정 화면과 같은 조회).
  const popupClass = params.class ? listResult.data.find((item) => item.id === params.class && !item.archivedAt) : undefined
  const popupDate = params.date && DATE_KEY.test(params.date) ? params.date : null
  const popupMonth = params.month && MONTH_KEY.test(params.month) ? params.month : popupDate?.slice(0, 7) ?? null
  const popup =
    popupClass && popupDate && popupMonth
      ? {
          classId: popupClass.id,
          date: popupDate,
          month: popupMonth,
          ...(await getStudioScheduleCalendar({
            organizationId: teacher.organizationId,
            month: popupMonth,
            classId: popupClass.id,
            teacherId: null
          }).then((result) => ({ days: result.data.days, error: result.error })))
        }
      : null

  return (
    <div className={styles.page}>
      <StudioClassesManager
        items={listResult.data}
        error={listResult.error}
        intros={intros}
        todayKey={todayKey}
        weekDateKeys={weekDateKeys}
        weekItems={weekItems}
        weekError={weekError}
        popup={popup}
        header={{
          classesHref: studioPath("/studio/classes"),
          scheduleHref: studioPath("/studio/schedule"),
          newClassHref: studioPath("/studio/classes/new")
        }}
      />
    </div>
  )
}

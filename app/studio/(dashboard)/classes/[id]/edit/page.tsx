import Link from "next/link"
import { notFound } from "next/navigation"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClassFormOptions } from "@/features/studio/queries/get-studio-class-form-options"
import { getStudioClasses } from "@/features/studio/queries/get-studio-classes"
import { StudioClassForm } from "@/features/studio/ui/studio-class-form"
import styles from "../../new/page.module.css"

type StudioClassEditPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function StudioClassEditPage({ params }: StudioClassEditPageProps) {
  const { id } = await params
  const teacher = await requireTeacherStudioAccess()
  const [{ data: classes, error: classesError }, { data: teacherOptions, error: teacherOptionsError }] =
    await Promise.all([
      getStudioClasses(teacher.organizationId),
      getStudioClassFormOptions(teacher.organizationId)
    ])

  if (classesError) {
    throw new Error(classesError)
  }

  const targetClass = classes.find((item) => item.id === id)

  if (!targetClass) {
    notFound()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/studio/classes" className={styles.backLink} prefetch={false}>
            목록으로 돌아가기
          </Link>
        </div>

        <p className={styles.kicker}>파트너 센터</p>
        <h1 className={styles.title}>수업 수정</h1>
        <p className={styles.description}>기존 수업 정보와 예약 가능 시간을 최신 운영 상태에 맞게 정리해요.</p>
      </header>

      <section className={styles.guideCard}>
        <div className={styles.guideIcon} aria-hidden="true">
          i
        </div>
        <div className={styles.guideBody}>
          <p className={styles.guideTitle}>
            예약 가능 시간, 대표 이미지, 소개 문구는 학부모가 신청을 결정할 때 함께 참고하는 정보예요.
          </p>
          <p className={styles.guideDescription}>
            수정 후에는 수업 목록으로 돌아가 공개 상태와 노출 정보를 다시 확인해 주세요.
          </p>
        </div>
      </section>

      <StudioClassForm
        organizationId={teacher.organizationId}
        currentTeacherId={teacher.teacherId}
        teacherOptions={teacherOptions}
        teacherOptionsError={teacherOptionsError}
        initialItem={targetClass}
        variant="standalone"
        formId="studio-class-edit-form"
        updateSuccessHref="/studio/classes?success=updated"
      />
    </div>
  )
}

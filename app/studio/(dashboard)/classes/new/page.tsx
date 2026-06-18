import Link from "next/link"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioClassFormOptions } from "@/features/studio/queries/get-studio-class-form-options"
import { StudioClassForm } from "@/features/studio/ui/studio-class-form"
import styles from "./page.module.css"

export default async function StudioClassNewPage() {
  const teacher = await requireTeacherStudioAccess()
  const { data: teacherOptions, error: teacherOptionsError } = await getStudioClassFormOptions(
    teacher.organizationId
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/studio/classes" className={styles.backLink} prefetch={false}>
            수업 관리로 돌아가기
          </Link>
          <div className={styles.headerActions}>
            <Link href="/studio/classes" className={styles.secondaryButton} prefetch={false}>
              수업 관리
            </Link>
          </div>
        </div>

        <p className={styles.kicker}>운영자 센터</p>
        <h1 className={styles.title}>새 프로그램 등록</h1>
        <p className={styles.description}>학부모에게 노출될 체험수업과 레벨테스트 정보를 등록해요.</p>
      </header>

      <section className={styles.guideCard}>
        <div className={styles.guideIcon} aria-hidden="true">
          i
        </div>
        <div className={styles.guideBody}>
          <p className={styles.guideTitle}>
            수업명, 대상, 소개 문구는 학부모가 신청을 결정할 때 가장 먼저 보는 정보예요.
          </p>
          <p className={styles.guideDescription}>
            처음에는 비공개로 저장한 뒤, 내용을 확인하고 공개 상태로 전환해도 좋아요.
          </p>
        </div>
      </section>

      <StudioClassForm
        organizationId={teacher.organizationId}
        currentTeacherId={teacher.teacherId}
        teacherOptions={teacherOptions}
        teacherOptionsError={teacherOptionsError}
        variant="standalone"
        formId="studio-class-create-form"
        createSuccessHref="/studio/classes?success=created"
      />
    </div>
  )
}


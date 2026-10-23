import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioSignUpForm } from "@/features/studio/ui/studio-sign-up-form"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"
import { getRequestHostname } from "@/shared/lib/request-host"
import { V2ClockIcon } from "@/features/studio/ui/v2/v2-icons"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"
import styles from "./page.module.css"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
/** "10월 17일(토) 14:20" (날짜 표기 규칙 §1) */
const formatRequestedAt = (value: string | null) => {
  const parts = value ? getSeoulDateTimeParts(value) : null
  return parts ? `${parts.month}월 ${parts.day}일(${WEEKDAYS[parts.weekday]}) ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` : null
}

type SignupRequestRow = {
  id: string
  status: string
  organization_name: string
  branch_name: string | null
  representative_name: string | null
  business_registration_number: string | null
  business_registration_file_path: string | null
  academy_phone: string | null
  contact_phone: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null
  sido: string | null
  sigungu: string | null
  bname: string | null
  sigungu_code: string | null
  bcode: string | null
  rejection_reason: string | null
  created_at: string | null
}

export default async function StudioPendingPage() {
  const studioPath = await getStudioNavigationPathResolver()
  const session = await getSession()
  
  if (!session) {
    redirect(studioPath("/studio/sign-in"))
  }

  const profile = await getMyProfile()
  if (profile?.role === "academy" || profile?.role === "admin") {
    redirect(studioPath("/studio/cases"))
  }

  const supabase = await getSupabaseServerClient()
  const { data: signupRequest } = await supabase
    .from("teacher_signup_requests")
    .select(
      [
        "id",
        "status",
        "organization_name",
        "branch_name",
        "representative_name",
        "business_registration_number",
        "business_registration_file_path",
        "academy_phone",
        "contact_phone",
        "postal_code",
        "address_line1",
        "address_line2",
        "sido",
        "sigungu",
        "bname",
        "sigungu_code",
        "bcode",
        "rejection_reason",
        "created_at"
      ].join(", ")
    )
    .eq("user_id", session.user.id)
    .in("status", ["pending", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  
  if (!signupRequest && profile?.role === "parent") {
    /* 학부모 세션은 Parent origin 으로 내보낸다. 같은 host 로 보내면 되돌아온다. */
    redirect(getParentCrossProductHref({ pathname: "/classes", hostname: await getRequestHostname() }))
  }

  const request = (signupRequest as SignupRequestRow | null) ?? null
  // 신청자가 입력한 주소를 우선 보여주고, 행정지역 metadata 가 있으면 함께 노출한다.
  // legacy 학원가 값으로 fallback 하지 않는다.
  const requestAddressLabel = request
    ? [request.postal_code ? `(${request.postal_code})` : null, request.address_line1, request.address_line2]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" ") || null
    : null
  const requestRegionLabel = request
    ? formatAdministrativeRegionLabel({
        sido: request.sido,
        sigungu: request.sigungu,
        bname: request.bname
      })
    : null
  const isRejected = request?.status === "rejected"
  const rejectionReason = request?.rejection_reason?.trim() || "운영팀에 문의해 주세요."

  const documentName = request?.business_registration_file_path?.split("/").pop() ?? null
  const requestedAt = formatRequestedAt(request?.created_at ?? null)
  const contactPhone = request?.contact_phone?.trim() || null

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <StudioHomeLogo width={79} height={27} priority />
        {/* Studio 로그아웃의 canonical 경로는 /studio/sign-out 이다(studio-mypage-page · studio/access 와 같은 링크).
            반려 상태에서도 로그아웃은 항상 가능해야 한다 — 사용 권한과 세션 종료 권한을 묶지 않는다. */}
        <Link href={studioPath("/studio/sign-out")} prefetch={false} className={styles.topLink}>로그아웃</Link>
      </header>

      {isRejected ? (
        <div className={styles.content}>
          <div className={styles.hero}>
            <h1 className={styles.title}>신청이 반려됐어요</h1>
            <p className={styles.description}>아래에서 정보를 고친 뒤 다시 신청해 주세요.</p>
          </div>
          <section className={styles.rejection} aria-labelledby="rejection-title">
            <h2 id="rejection-title">반려 사유</h2>
            <p>{rejectionReason}</p>
          </section>
          {request ? (
            <section className={styles.card} aria-labelledby="resubmit-title">
              <div className={styles.cardHead}>
                <h2 id="resubmit-title">정보 수정하고 다시 신청</h2>
                <p>기존 신청 정보를 불러왔어요. 고칠 항목을 바꾼 뒤 다시 제출해 주세요.</p>
              </div>
              <StudioSignUpForm
                mode="resubmit"
                initialValues={{
                  organizationName: request.organization_name,
                  branchName: request.branch_name,
                  representativeName: request.representative_name,
                  businessRegistrationNumber: request.business_registration_number,
                  academyPhone: request.academy_phone,
                  contactPhone: request.contact_phone,
                  postalCode: request.postal_code,
                  addressLine1: request.address_line1,
                  addressLine2: request.address_line2,
                  region: {
                    sido: request.sido,
                    sigungu: request.sigungu,
                    bname: request.bname,
                    sigunguCode: request.sigungu_code,
                    bcode: request.bcode
                  },
                  businessRegistrationFilePath: request.business_registration_file_path
                }}
              />
            </section>
          ) : null}
        </div>
      ) : (
        <div className={`${styles.content} ${styles.contentNarrow}`}>
          <span className={styles.illust} aria-hidden="true"><V2ClockIcon size={52} /></span>
          <div className={`${styles.hero} ${styles.heroCenter}`}>
            <h1 className={styles.title}>학원 정보를 확인하고 있어요</h1>
            <p className={styles.description}>
              학원 정보와 사업자등록증을 확인하고 있어요. 보통 1영업일 안에 끝나고, 끝나면 {contactPhone ? <><span className={styles.nowrap}>{contactPhone}</span>(으)로</> : "담당자 전화번호로"} 연락드릴게요.
            </p>
          </div>

          <section className={styles.summary} aria-labelledby="summary-title">
            <h2 id="summary-title">신청한 내용</h2>
            {request ? (
              <dl>
                <div><dt>학원</dt><dd>{[request.organization_name, request.branch_name].filter(Boolean).join(" ")}</dd></div>
                <div><dt>주소</dt><dd>{requestAddressLabel ?? "주소 정보 없음"}{requestRegionLabel ? ` · ${requestRegionLabel}` : ""}</dd></div>
                <div><dt>서류</dt><dd>{documentName ? `${documentName} · 확인 중` : "확인 중"}</dd></div>
                <div><dt>신청일</dt><dd>{requestedAt ?? "-"}</dd></div>
              </dl>
            ) : <p className={styles.muted}>신청 정보를 불러오지 못했어요.</p>}
          </section>

          <section className={styles.next} aria-labelledby="next-title">
            <h2 id="next-title">승인되면 이렇게 시작해요</h2>
            <div>
              <strong>첫 수업 등록하기</strong>
              <p>체험수업이나 레벨테스트를 등록하고 운영 시간을 정하면 학부모 앱에 보여요.</p>
            </div>
            <div>
              <strong>선생님 등록하기</strong>
              <p>승인 후 설정 › 선생님에서 이름과 연락처를 등록해요.</p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

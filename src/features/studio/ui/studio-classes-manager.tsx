"use client"

import { useState } from "react"

import { submitToggleStudioClassActiveAction } from "@/features/studio/actions/toggle-studio-class-active"
import { StudioClassForm } from "@/features/studio/ui/studio-class-form"
import type { ClassSummary } from "@/shared/lib/db/adapter"

type StudioClassesManagerProps = {
  items: ClassSummary[]
  currentTeacherName: string
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

const PROGRAM_TYPE_LABELS: Record<ClassSummary["programType"], string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const StudioClassesManager = ({ items, currentTeacherName }: StudioClassesManagerProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedItem = items.find((item) => item.id === selectedId) ?? null

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.2fr) 420px" }}>
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={titleStyle}>프로그램 목록</h2>
            <p style={descriptionStyle}>같은 organization에 속한 프로그램만 조회하고 관리합니다.</p>
          </div>
          <button type="button" onClick={() => setSelectedId(null)} style={secondaryButtonStyle}>
            신규 등록
          </button>
        </div>

        {items.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
            아직 등록된 프로그램이 없습니다.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <article
                key={item.id}
                style={{
                  border: selectedId === item.id ? "1px solid #111827" : "1px solid #e5e7eb",
                  borderRadius: 14,
                  background: "#fff",
                  padding: 16
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: item.coverImageUrl ? "120px 1fr" : "1fr" }}>
                    {item.coverImageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.coverImageUrl}
                          alt={`${item.title} 대표 이미지`}
                          style={{
                            width: 120,
                            height: 90,
                            borderRadius: 12,
                            objectFit: "cover",
                            border: "1px solid #e5e7eb"
                          }}
                        />
                      </>
                    ) : null}
                    <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ color: "#111827", fontSize: 16, lineHeight: "22px" }}>{item.title}</strong>
                    <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
                      {PROGRAM_TYPE_LABELS[item.programType]} / {item.subject} / {item.region} / {item.targetAge}
                    </p>
                    <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: "20px" }}>
                      담당: {item.teacherDisplayName ?? item.teacherName ?? "미지정"} / 체험비: {formatPrice(item.trialPrice)}
                    </p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "4px 10px",
                        background: item.isActive ? "#dcfce7" : "#f3f4f6",
                        color: item.isActive ? "#166534" : "#4b5563",
                        fontSize: 12,
                        lineHeight: "18px",
                        fontWeight: 600
                      }}
                    >
                      {item.isActive ? "공개" : "비공개"}
                    </span>
                    <button type="button" onClick={() => setSelectedId(item.id)} style={secondaryButtonStyle}>
                      수정
                    </button>
                    <ToggleClassActiveButton classId={item.id} isActive={item.isActive} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <StudioClassForm
        key={selectedId ?? "create"}
        currentTeacherName={currentTeacherName}
        initialItem={selectedItem}
      />
    </div>
  )
}

const ToggleClassActiveButton = ({ classId, isActive }: { classId: string; isActive: boolean }) => {
  return (
    <form action={submitToggleStudioClassActiveAction}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="nextIsActive" value={String(!isActive)} />
      <button type="submit" style={secondaryButtonStyle}>
        {isActive ? "비공개 전환" : "공개 전환"}
      </button>
    </form>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const titleStyle = {
  margin: "0 0 8px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const descriptionStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const secondaryButtonStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  lineHeight: "18px",
  padding: "8px 12px",
  cursor: "pointer"
}

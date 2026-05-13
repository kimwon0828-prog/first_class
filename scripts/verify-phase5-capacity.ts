import { readFile } from "node:fs/promises"

import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"

type GlobalMockStore = typeof globalThis & {
  __firstClassMockApplications__?: Array<unknown>
}

const globalMockStore = globalThis as GlobalMockStore

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const run = async () => {
  globalMockStore.__firstClassMockApplications__ = []

  const parentId = "parent-verify-1"
  const classId = "class-1"

  const initialSlots = await mockDataAdapter.listAvailableScheduleSlotsByClassId(classId)
  const slotToClose = initialSlots.find((slot) => slot.id === "slot-2")
  if (!slotToClose) {
    throw new Error("검증용 슬롯(slot-2)을 찾지 못했습니다.")
  }
  assert(slotToClose.remainingCount === 1, "초기 remainingCount가 1이 아닙니다.")
  assert(slotToClose.isClosed === false, "초기 슬롯이 이미 마감 상태입니다.")

  const created = await mockDataAdapter.createTrialApplication({
    parentId,
    classId,
    childName: "테스트자녀",
    childGrade: "8세",
    requestedSlotAt: slotToClose.startAt,
    selectedScheduleBlockId: slotToClose.id,
    memo: null
  })

  const myApplications = await mockDataAdapter.listMyApplications(parentId)
  assert(
    myApplications.some((item) => item.id === created.id),
    "신청 성공 후 내 신청내역에 새 신청이 보이지 않습니다."
  )

  const slotsAfterApply = await mockDataAdapter.listAvailableScheduleSlotsByClassId(classId)
  const closedSlot = slotsAfterApply.find((slot) => slot.id === "slot-2")
  if (!closedSlot) {
    throw new Error("신청 후 슬롯(slot-2)을 찾지 못했습니다.")
  }
  assert(closedSlot.appliedCount === 1, "appliedCount가 정원 계산 결과와 다릅니다.")
  assert(closedSlot.remainingCount === 0, "remainingCount가 0으로 계산되지 않았습니다.")
  assert(closedSlot.isClosed === true, "정원이 찬 슬롯이 마감 처리되지 않았습니다.")

  let capacityErrorCaught = false
  try {
    await mockDataAdapter.createTrialApplication({
      parentId: "parent-verify-2",
      classId,
      childName: "다른자녀",
      childGrade: "9세",
      requestedSlotAt: closedSlot.startAt,
      selectedScheduleBlockId: closedSlot.id,
      memo: null
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "slot_capacity_reached") {
      capacityErrorCaught = true
    }
  }
  assert(capacityErrorCaught, "마감 슬롯에 대해 신청이 차단되지 않았습니다.")

  const applyFormSource = await readFile(
    "/Users/1to6/Desktop/첫수업 트레이/src/features/applications/ui/apply-form.tsx",
    "utf8"
  )
  assert(
    applyFormSource.includes("남은 {slot.remainingCount}자리"),
    "UI에 remainingCount 표시 코드가 없습니다."
  )
  assert(applyFormSource.includes(">마감<"), "UI에 마감 배지 코드가 없습니다.")
  assert(
    applyFormSource.includes("disabled={isPending || slot.isClosed}"),
    "UI에서 마감 슬롯 disabled 처리가 없습니다."
  )
  assert(
    applyFormSource.includes("Array.from({ length: 9 }"),
    "자녀 나이 드롭다운이 5세~13세 범위와 일치하지 않습니다."
  )

  console.log("PASS: 슬롯 remainingCount/isClosed, 마감 슬롯 선택 불가, 신청 후 내 신청 반영 검증 완료")
}

run().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})

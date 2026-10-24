"use client"

import type { RecontactPanelContext } from "@/features/students/lib/recontact-gate"
import type { StudentListRow, StudentTab } from "@/features/students/lib/student-grouping"
import { RecontactPanel } from "@/features/students/ui/recontact-panel"
import { StudentsBoard } from "@/features/students/ui/students-board"

/** 학생 목록 + 보내기 패널(§5.27). 고른 학생을 패널로 넘긴다. */
export function StudentsScreen({ rows, initialTab, panel }: { rows: StudentListRow[]; initialTab: StudentTab; panel: RecontactPanelContext }) {
  return (
    <StudentsBoard
      rows={rows}
      initialTab={initialTab}
      renderPanel={(selected, clearSelection) => (
        <RecontactPanel
          context={panel}
          recipients={selected.map((row) => ({ applicationId: row.applicationId, name: row.name, trialLabel: row.trialLabel }))}
          onSent={clearSelection}
        />
      )}
    />
  )
}

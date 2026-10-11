import { groupReportObservations, type ExperienceReportObservationSnapshot } from "@/features/reports/lib/experience-report-snapshot"

/** Both readers use the frozen labels. Never consult live subject configuration here. */
export function ReportObservations({ observations, listClassName, itemClassName, heading = "h4" }: {
  observations: readonly ExperienceReportObservationSnapshot[]; listClassName?: string; itemClassName?: string; heading?: "h3" | "h4"
}) {
  const Heading = heading
  return <>{groupReportObservations(observations).map(group => <div key={`${group.code}-${group.label ?? ""}`}>
    {group.label ? <Heading>{group.label}</Heading> : null}
    <ul className={listClassName}>{group.items.map(item => <li key={item.code} className={itemClassName}>{item.label}</li>)}</ul>
  </div>)}</>
}

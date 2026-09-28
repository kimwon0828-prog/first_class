import { STUDIO_DONUT_RADIUS, STUDIO_DONUT_VIEWBOX } from "./studio-dashboard-analytics"

/** Render geometry only. Counts, percentages and legend remain owned by analytics. */
export const buildStudioDonutArcs = (counts: number[], total: number) => {
  const center = STUDIO_DONUT_VIEWBOX / 2
  const point = (fraction: number) => {
    const angle = fraction * Math.PI * 2 - Math.PI / 2
    return [center + STUDIO_DONUT_RADIUS * Math.cos(angle), center + STUDIO_DONUT_RADIUS * Math.sin(angle)]
      .map(value => Number(value.toFixed(8))).join(" ")
  }
  let consumed = 0
  return counts.map(count => {
    const start = total > 0 ? consumed / total : 0
    consumed += count
    const end = total > 0 ? consumed / total : 0
    if (count <= 0 || total <= 0) return null
    // A full circle has no arc endpoints. Do not render zero-length dash segments.
    if (count === total) return { fullCircle: true, path: "" }
    return {
      fullCircle: false,
      path: `M ${point(start)} A ${STUDIO_DONUT_RADIUS} ${STUDIO_DONUT_RADIUS} 0 ${end - start > 0.5 ? 1 : 0} 1 ${point(end)}`
    }
  })
}

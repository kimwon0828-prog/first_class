import { STUDIO_DONUT_RADIUS, STUDIO_DONUT_STROKE, STUDIO_DONUT_VIEWBOX } from "./studio-dashboard-analytics"

/** Render geometry only. Counts, percentages and legend remain owned by analytics. */
export const buildStudioDonutArcs = (counts: number[], total: number) => {
  const center = STUDIO_DONUT_VIEWBOX / 2
  const outerRadius = STUDIO_DONUT_RADIUS + STUDIO_DONUT_STROKE / 2
  const innerRadius = STUDIO_DONUT_RADIUS - STUDIO_DONUT_STROKE / 2
  const point = (fraction: number, radius: number) => {
    const angle = fraction * Math.PI * 2 - Math.PI / 2
    return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)]
      .map(value => Number(value.toFixed(8))).join(" ")
  }
  let consumed = 0
  return counts.map(count => {
    const start = total > 0 ? consumed / total : 0
    consumed += count
    const end = total > 0 ? consumed / total : 0
    if (count <= 0 || total <= 0) return null
    // A full circle uses a circle primitive, with no segment boundary.
    if (count === total) return { fullCircle: true, path: "" }
    const largeArc = end - start > 0.5 ? 1 : 0
    return {
      fullCircle: false,
      // Explicit radial edges avoid browser stroke/dash endpoint approximation.
      // Adjacent segments share both endpoints; the inner arc runs backwards.
      path: `M ${point(start, outerRadius)} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${point(end, outerRadius)} L ${point(end, innerRadius)} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${point(start, innerRadius)} Z`
    }
  })
}

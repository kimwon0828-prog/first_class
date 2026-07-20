"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import type { AcademyMapOrganization } from "../queries/get-academies-for-map"
import { AcademyBottomSheet } from "./academy-bottom-sheet"
import { AcademiesMap } from "./academies-map"

type AcademiesExplorerProps = {
  academies: AcademyMapOrganization[]
  selectedRegionLabel: string
  selectedSubjectLabel: string | null
  selectedGradeLabel: string | null
  selectedSortLabel: string
  favoritesEnabled: boolean
}

export function AcademiesExplorer({
  academies,
  selectedRegionLabel,
  selectedSubjectLabel,
  selectedGradeLabel,
  selectedSortLabel,
  favoritesEnabled
}: AcademiesExplorerProps) {
  const initialActiveOrganizationId =
    academies.find((academy) => academy.hasCoordinates)?.id ?? academies[0]?.id ?? null
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(initialActiveOrganizationId)

  useEffect(() => {
    setActiveOrganizationId(initialActiveOrganizationId)
  }, [initialActiveOrganizationId])

  const handleActiveOrganizationChange = useCallback((organizationId: string) => {
    setActiveOrganizationId(organizationId)
  }, [])

  const markers = useMemo(
    () =>
      academies
        .filter((academy) => academy.hasCoordinates && academy.latitude !== null && academy.longitude !== null)
        .map((academy) => ({
          id: academy.id,
          label: academy.displayName,
          latitude: academy.latitude as number,
          longitude: academy.longitude as number
        })),
    [academies]
  )

  return (
    <>
      <AcademiesMap
        markers={markers}
        activeOrganizationId={activeOrganizationId}
        onActiveOrganizationChange={handleActiveOrganizationChange}
      />
      <AcademyBottomSheet
        academies={academies}
        activeOrganizationId={activeOrganizationId}
        onActiveOrganizationChange={handleActiveOrganizationChange}
        selectedRegionLabel={selectedRegionLabel}
        selectedSubjectLabel={selectedSubjectLabel}
        selectedGradeLabel={selectedGradeLabel}
        selectedSortLabel={selectedSortLabel}
        favoritesEnabled={favoritesEnabled}
      />
    </>
  )
}

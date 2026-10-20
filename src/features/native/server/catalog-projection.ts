import { formatRegularPrice } from "@/shared/lib/regular-price"
import { LEARNER_GRADES } from "@/shared/constants/education-taxonomy"
import { formatClassSubjectDisplayLabel } from "@/shared/lib/subject-master"
import { formatStoredTargetGrades, isChildEligibleForClass } from "@/shared/constants/grade-options"
import type { ClassSummary } from "@/shared/lib/db/adapter"

export const projectNativeCatalogClass = (item: ClassSummary) => ({
 id:item.id, title:item.title, programType:item.programType, subject:formatClassSubjectDisplayLabel(item),
 targetAge:formatStoredTargetGrades(item.targetAge), eligibleGrades:LEARNER_GRADES.filter(g=>isChildEligibleForClass(g.value,item.targetAge)), regularPriceLabel:formatRegularPrice({type:item.regularPriceType,amount:item.regularPriceAmount}), regularPriceNote:item.regularPriceNote, trialPrice:item.trialPrice, trialPriceConfirmed:item.trialPriceConfirmed ?? null, coverImageUrl:item.coverImageUrl,
 academyName:item.organization ? [item.organization.name,item.organization.branchName].filter(Boolean).join(" ") : null,
 organizationId:item.organization?.id ?? null, locationLabel:[item.organization?.sigungu,item.organization?.bname].filter(Boolean).join(" "),
 description:item.description, recommendedFor:item.recommendedFor, experiencePoints:item.experiencePoints,
 curriculum:item.curriculum, teacherIntro:item.teacherIntro, classFormat:item.classFormat,
 address:[item.organization?.address,item.organization?.addressDetail].filter(Boolean).join(" ")
})

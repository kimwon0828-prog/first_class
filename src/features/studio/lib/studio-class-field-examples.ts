import {
  normalizeStudioClassSubjectOption,
  type StudioClassSubjectOption
} from "@/features/studio/lib/studio-class-options"

export type StudioClassFieldExamples = {
  title: string
  description: string
  recommendedFor: string
  experiencePoints: string
  curriculum: string
}

const DEFAULT_FIELD_EXAMPLES: StudioClassFieldExamples = {
  title: "체험수업 제목을 입력해 주세요.",
  description: "수업에서 무엇을 배우고 어떤 방식으로 진행되는지 작성해 주세요.",
  recommendedFor: "이 수업이 어떤 아이에게 잘 맞는지 작성해 주세요.",
  experiencePoints: "아이들이 수업에서 하게 될 주요 활동을 작성해 주세요.",
  curriculum: "수업 진행 순서를 단계별로 작성해 주세요."
}

const SUBJECT_FIELD_EXAMPLES: Record<StudioClassSubjectOption, StudioClassFieldExamples> = {
  thinking_math: {
    title: "초등 수학 개념 진단 체험수업",
    description: "개념 이해도와 문제 해결 과정을 확인한 뒤 아이에게 맞는 수업 방식을 안내합니다.",
    recommendedFor:
      "개념은 알고 있지만 응용문제에서 어려움을 느끼거나, 현재 수학 수준을 정확히 확인하고 싶은 아이",
    experiencePoints: "개념 진단, 문제풀이 과정 확인, 오답 유형 분석, 맞춤 학습 피드백",
    curriculum:
      "1. 학습 수준 확인\n2. 개념 문제 풀이\n3. 응용 문제 풀이\n4. 결과 피드백 및 학습 방향 안내"
  },
  english: {
    title: "파닉스·리딩 레벨 확인 체험수업",
    description: "파닉스, 어휘, 리딩 수준을 확인하고 아이에게 적합한 영어 학습 단계를 안내합니다.",
    recommendedFor:
      "영어 읽기를 처음 시작하거나, 현재 리딩 레벨과 부족한 영역을 확인하고 싶은 아이",
    experiencePoints: "파닉스 확인, 어휘 활동, 리딩 수업, 말하기 활동, 맞춤 피드백",
    curriculum:
      "1. 영어 학습 경험 확인\n2. 파닉스·어휘 진단\n3. 리딩 활동\n4. 결과 피드백 및 반 배정 안내"
  },
  reading_writing: {
    title: "독해·글쓰기 진단 체험수업",
    description: "지문 이해와 글쓰기 활동을 통해 현재 독해력과 생각을 표현하는 능력을 확인합니다.",
    recommendedFor:
      "글을 읽고 핵심 내용을 파악하기 어렵거나, 자신의 생각을 글로 표현하는 데 어려움을 느끼는 아이",
    experiencePoints: "지문 읽기, 핵심 내용 찾기, 생각 정리, 글쓰기 활동, 맞춤 피드백",
    curriculum:
      "1. 독서·글쓰기 경험 확인\n2. 지문 독해 활동\n3. 생각 정리 및 글쓰기\n4. 결과 피드백 및 학습 방향 안내"
  },
  coding_robot_science: {
    title: "코딩·로봇 프로젝트 체험수업",
    description: "블록코딩, 로봇 또는 과학 프로젝트를 직접 완성하며 문제 해결 과정과 흥미도를 확인합니다.",
    recommendedFor:
      "게임이나 로봇 만들기에 관심이 있거나, 코딩을 처음 쉽고 재미있게 경험하고 싶은 아이",
    experiencePoints: "코딩 기초, 프로젝트 제작, 오류 수정, 창의적 문제 해결, 결과물 발표",
    curriculum:
      "1. 오늘의 프로젝트 소개\n2. 기본 기능 익히기\n3. 프로젝트 제작\n4. 실행 및 오류 수정\n5. 결과물 공유"
  },
  arts: {
    title: "음악·미술 표현 체험수업",
    description: "악기, 리듬 활동 또는 미술 재료를 활용해 아이의 표현 방식과 흥미를 자연스럽게 확인합니다.",
    recommendedFor:
      "악기 연주나 만들기, 그림 그리기에 관심이 있거나 다양한 예술 활동을 통해 자신을 표현해 보고 싶은 아이",
    experiencePoints: "재료 또는 악기 탐색, 기본 표현 활동, 작품·연주 경험, 맞춤 피드백",
    curriculum:
      "1. 오늘의 예술 활동 소개\n2. 재료·악기와 표현 방법 탐색\n3. 작품 또는 연주 활동\n4. 결과 공유 및 수업 방향 안내"
  },
  sports_dance: {
    title: "기초 체육·무용 움직임 체험수업",
    description: "기초 체력과 리듬감, 신체 표현 활동을 통해 아이에게 맞는 운동 수업 방식을 안내합니다.",
    recommendedFor:
      "몸을 움직이는 활동을 좋아하거나, 체육·무용 수업을 즐겁게 시작해 보고 싶은 아이",
    experiencePoints: "기초 움직임, 리듬 활동, 밸런스 훈련, 표현 동작, 맞춤 피드백",
    curriculum:
      "1. 몸풀기와 움직임 확인\n2. 기본 자세와 리듬 익히기\n3. 주제 동작 활동\n4. 결과 피드백 및 수업 방향 안내"
  }
}

export const getStudioClassFieldExamples = (
  subject: StudioClassSubjectOption | string | null | undefined
): StudioClassFieldExamples => {
  const normalized = normalizeStudioClassSubjectOption(subject)
  return normalized ? SUBJECT_FIELD_EXAMPLES[normalized] : DEFAULT_FIELD_EXAMPLES
}

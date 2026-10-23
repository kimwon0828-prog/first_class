# 첫수업 Studio 디자인 시스템 v2

파트너 센터(`/studio`) 전용 기준 문서. 학원 운영자가 쓰는 **업무 도구**의 규칙이다.
학부모 화면에는 적용하지 않는다(학부모는 `docs/PARENT_DESIGN_SYSTEM.md`).

AI 코딩 에이전트(Codex, Claude Code)는 `/studio` 하위 UI를 만들거나 고칠 때 이 문서를 먼저 읽고 따른다.
**여기 없는 값 · 패턴을 새로 만들지 않는다. 필요하면 구현하지 말고 보고한다.**

## 0. 기준과 전환 기간

| 항목 | 값 |
|---|---|
| Figma 파일 | `ZXrXxnX3ae33Hp81alIEmO` |
| 최종 화면 페이지 | "스튜디오 최종 (2026-10-22)" `2148:4668` |
| 디자인 규칙 | `2148:4687` |
| 부품 원본 | "스튜디오 디자인 v2 (2026-10)" 페이지의 "0. 컴포넌트 v2" `2024:42`, StatusBadge `2002:100`(리디자인 v1 페이지) |
| 사이드바 기준 화면 | 수업·일정 `2148:6043` |
| 설정 탭 기준 화면 | 설정 · 학원 정보 `2148:6742`, 설정 · 선생님 `2148:6939` |
| 수업·일정 기준 화면 (3단계) | 수업 탭 `2148:6043`, 전체 일정 탭 `2178:144`, 예약 시간 관리 팝업 `2178:373` |
| 신청 기준 화면 (4단계) | 목록 `2148:5142`, 상세·일정 확정 `2148:5195`, 기록 작성 `2148:5324`, 리포트 보내기 `2148:5463`, 등록 결과 `2148:5579`, 기존 예약 가져오기 `2148:5719` |
| 홈 기준 화면 (5단계) | 홈 · 오늘 할 일 `2148:4963` |

값은 Figma MCP(`get_design_context` · `get_variable_defs`)로 확인한 것만 적었다. 추측한 값은 없다.
Figma에 그려지지 않아 코드에서 정한 것(hover · focus · disabled 등)은 해당 절에 **[코드 결정]**으로 표시했다.

**전환 기간 (2026-10 리뉴얼 1단계 ~)**
- 1단계에서 바뀐 것: 앱 셸(사이드바), 설정 탭 틀, v2 토큰, v2 부품. 각 화면의 본문은 아직 그대로다.
- 아직 v2로 옮기지 않은 본문은 `globals.css`의 기존 토큰(`--brand-*`, `--text-*`, `--border` …)을 쓴다.
  그 화면을 고칠 때만 `docs/studio-design-system-legacy.md`(이전 문서)를 참고한다.
- 화면을 v2로 옮길 때는 그 화면의 CSS를 `--sv2-*` 토큰과 `src/features/studio/ui/v2/` 부품으로 바꾼다.
  한 화면 안에서 두 체계를 섞지 않는다.

## 1. 디자인 규칙 (Figma `2148:4687`)

학부모 앱 v2와 같은 토큰 · 글꼴 · 말투를 쓴다.

| 규칙 | 내용 |
|---|---|
| 흰 바탕 | 회색 배경 위 흰 카드 대신, 흰 바탕 + 연회색 상자(`surface/fill` #F3F4F3)로 묶는다. |
| 초록은 진행 · 선택에만 | 주 버튼(#1B7A26), 선택된 칩 · 탭 · 메뉴(연한 초록 + 진한 초록 글자). 장식에 쓰지 않는다. |
| 보조 버튼은 연한 초록 | 표의 행 버튼은 연한 초록(tonal). 흰 테두리 버튼(outline)은 화면 상단 보조 행동. |
| 한 화면 주 버튼 1개 | "지금 할 일" 카드의 버튼만 진한 초록(primary)으로. |
| 그림자 없음 | 선(`line/default` #E6E9E7) 또는 배경 차이로만 구분. 팝오버만 예외. |
| 학원은 원형, 수업은 과목 3D | 학원 로고는 원형. 수업 사진이 없으면 과목 3D 아이콘. 3D 아이콘은 흰 바탕 위에만. |
| 학부모 화면 미리보기 | 기록 · 수업 등록 화면 오른쪽에 학부모 앱 화면을 같이 보여준다. |
| 집중 화면은 사이드바 숨김 | 수업 등록처럼 단계가 있는 화면은 위 단계 + 아래 고정 버튼. |
| 말투 | "~해요"체. 막는 문구 대신 다음에 할 일을 알려준다. |
| 날짜 표기 | `10월 17일(토) 16:00` — 요일을 꼭 함께. |

## 2. 레이아웃

| 항목 | 값 |
|---|---|
| 기준 폭 | 1440px (데스크톱 우선) |
| 사이드바 | 240px, 흰 바탕, 오른쪽 1px `line/default` |
| 본문 여백 | 좌우 48px, 위 36px, 아래 56px |
| 본문 세로 간격 | 24px (`space/24`) |
| 화면 제목 | 30px / Bold / line-height 1.32 / letter-spacing -0.7px / `ink/900` |
| 블록 제목 (예: "선생님 3명") | 20px / Bold / -0.5px / `ink/900` |
| 블록 설명 | 14px / Medium / -0.2px / `ink/500` |

## 3. 토큰

파일: `app/studio/studio-v2-tokens.css` (Studio layout에서만 불러온다).
Figma 변수 `brand/700` → CSS `--sv2-brand-700`처럼 `/`를 `-`로 바꾸고 `--sv2-` 접두를 붙인다.
**키 컬러(`brand/500` #2AAD38, `brand/700` #1B7A26)는 바꾸지 않는다.**

### 3.1 Color

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--sv2-brand-50` | #EEF7EF | 선택 상태 배경, tonal 버튼 배경 |
| `--sv2-brand-200` | #BFDFC3 | tonal 버튼 hover 테두리 **[코드 결정]** (Figma 홈 화면에서도 사용) |
| `--sv2-brand-500` | #2AAD38 | 로고 · 진행 막대. 글자 · 버튼 배경에 쓰지 않는다 |
| `--sv2-brand-700` | #1B7A26 | 주 버튼 배경, 선택된 글자 · 테두리 |
| `--sv2-brand-800` | #145C1D | 주 버튼 hover **[코드 결정: 값은 Figma 변수]** |
| `--sv2-ink-900` | #111312 | 제목 · 본문 |
| `--sv2-ink-700` | #454B48 | 메뉴 글자, 보조 본문 |
| `--sv2-ink-500` | #626966 | 설명 · 캡션, 아이콘 기본색 |
| `--sv2-ink-400` | #8A908D | 칩 건수, placeholder |
| `--sv2-ink-300` | #AEB4B1 | 토글 꺼짐 |
| `--sv2-line-default` | #E6E9E7 | 테두리 · 구분선 |
| `--sv2-line-subtle` | #EEF0EF | 표의 행 구분선, Section 헤더 아래 선 |
| `--sv2-surface-white` | #FFFFFF | 바탕 |
| `--sv2-surface-fill` | #F3F4F3 | 연회색 상자, 중립 배지 · 아바타 |
| `--sv2-surface-ground-green` | #F4F7F3 | (Figma 홈 화면에서 사용) |
| `--sv2-state-warn-fg` / `-bg` | #8A4B00 / #FFF4E5 | amber 배지 |
| `--sv2-state-alert` | #E5484D | 경고 점 · 입력 오류 테두리 |
| `--sv2-state-danger-fg` / `-bg` | #B4232A / #FDECEC | red 배지 (Figma에서 변수가 아닌 고정값) |
| `--sv2-subject-math-fg` / `-bg` | #245EA8 / #E8F0FB | blue 배지, 수학 과목 |
| `--sv2-subject-coding-bg` | #E7F3FA | 코딩 과목 |
| `--sv2-subject-english-bg` | #F1ECFB | 영어 과목 |

Figma에서 확인한 과목 색은 위 셋뿐이다. 다른 과목 색이 필요하면 Figma 변수를 먼저 확인하고 이 표에 더한다.

### 3.2 Radius

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--sv2-radius-badge` | 6px | 상태 배지, "파트너" 표시 |
| `--sv2-radius-chip-time` | 10px | 시간 칩(일정 칸) |
| `--sv2-radius-control` | 12px | 버튼 · 입력 · 메뉴 항목 · 작은 상자 |
| `--sv2-radius-card` | 16px | 카드 · Section · 규칙 상자 |
| `--sv2-radius-sheet` | 20px | 큰 패널 · 시트 |
| `--sv2-radius-pill` | 999px | 칩 · 아바타 · 토글 · 건수 |

### 3.3 Space

`--sv2-space-4 · 8 · 12 · 16 · 20 · 24 · 32`. 간격은 이 값만 쓴다.
부품 안쪽 치수(버튼 좌우 · 칩 8/14 · 입력 좌우 14 등)는 Figma 부품 값 그대로이며 §5에 적었다.

### 3.4 글꼴 · 글자

- 글꼴: **Pretendard Variable** (`--sv2-font`). Figma는 Noto Sans KR로 그려져 있지만 제품 글꼴은 Pretendard로 정했다.
  공식 배포본 woff2(v1.3.9, OFL)를 `app/studio/fonts/`에 두고 `app/studio/layout.tsx`가 `next/font/local`로 Studio 화면에만 적용한다
  (`[data-studio-root]`). 외부 CDN · npm 패키지를 쓰지 않는다. 라이선스 파일을 항상 함께 둔다.
- Figma 글자 스타일

| 이름 | 값 |
|---|---|
| 첫수업/Body | 15 / line-height 22 / Regular / -0.2px |
| 첫수업/Caption | 13 / 18 / Medium / -0.2px |
| 첫수업/Badge | 12 / 16 / Bold / 0 |

- 숫자가 줄 맞춰 바뀌는 곳(건수 · 남은 일수 · 표)은 `font-variant-numeric: tabular-nums`.

## 4. 앱 셸

### 4.1 사이드바 (`src/features/studio/ui/studio-shell.tsx`)

위에서 아래로:

1. **로고 + "파트너"** — 로고 높이 약 25px, "파트너"는 `surface/fill` · 11px Bold `ink/700` · 6px 모서리.
2. **학원 카드** — `line/default` 테두리 · 12px 모서리 · 10/12 여백. Avatar 36 + 학원명(14 Bold `ink/900`) + "원장 · 관리자"(12 Medium `ink/500`) + 아래 화살표 16.
   누르면 내 계정(`/studio/mypage`)으로 간다 **[코드 결정: Figma는 목적지 미정]**. 학원명이 길면 말줄임.
3. **메뉴** — 홈 · 신청 · 수업·일정 · 분석. 항목 높이 44, 좌우 12, 모서리 12, 아이콘 20 + 간격 12, 글자 15.
   - 기본: 글자 Medium `ink/700`, 아이콘 `ink/500`. hover: `surface/fill` **[코드 결정]**.
   - 선택: 배경 `brand/50`, 글자 Bold `brand/700`, 아이콘 `brand/700`.
4. (빈 공간)
5. **현재 플랜** — `surface/fill` 상자, 14 여백, 12 모서리. 플랜 이름(13 Bold) + 체험 중일 때만 "N일 남음"(12 Bold `brand/700`)과 진행 막대(흰 바탕 위 `brand/500` 6px, 지난 비율).
   누르면 플랜·결제로 간다. 데이터는 기존 구독 정보를 읽기만 한다(`get-studio-sidebar-plan.ts`).
6. **도움말·문의** — 기존 고객센터 메일(`COMPANY_EMAIL_HREF`).
7. **설정** — 설정 탭 중 하나라도 열려 있으면 선택 상태.

메뉴 묶음과 활성 판정은 `src/features/studio/lib/studio-nav.ts` 한 곳에서 정한다. **URL은 바꾸지 않는다.**

| 메뉴 | 누르면 | 선택으로 보는 경로 |
|---|---|---|
| 홈 | `/studio` | `/studio` (정확히 일치) |
| 신청 | `/studio/cases` | `/studio/cases/*`, `/studio/applications/*`, `/studio/unregistered` |
| 수업·일정 | `/studio/classes` | `/studio/classes/*`, `/studio/schedule/*` |
| 분석 | `/studio/analytics` | `/studio/analytics` (아이콘 `V2ChartIcon`, Figma nav/분석) |
| 설정 | `/studio/mypage/profile` | 설정 탭의 모든 경로(§4.2) |

- "학생" 메뉴는 기능이 생기는 2차에서 추가한다.
- 메뉴 건수: "신청" 옆에 일정 확정이 필요한 신청 수를 보인다. 신청 화면 "신규 신청" 칩과 같은 조건 · 같은 조회
  (`countStudioCases(view: active, filter: schedule_needed)`). 0이거나 조회에 실패하면 숨긴다.
  모양: pill · 좌우 8 · 12/16 Bold, 기본 `surface/fill` + `ink/700`, 선택된 메뉴에서는 `brand/700` + white.
  "홈" 옆에는 오늘 할 일 수(홈 "가장 먼저"의 N과 같은 조회 · 같은 판정, `buildStudioDashboardView().actionTotalCount`)를 보인다.
- 메뉴 링크는 hover/focus로 의도를 보인 뒤에만 prefetch 한다(첫 렌더에 dynamic route를 몰아 받지 않게).
- 좁은 화면(< 720px)에서는 사이드바를 위쪽 가로 줄로 접는다 **[코드 결정: Studio 모바일 디자인 없음]**.

### 4.2 설정 탭 (`src/features/studio/ui/studio-settings-frame.tsx`)

화면 제목 "설정" → 24px → [왼쪽 탭 180px | 40px | 내용].
탭 항목: 10/14 여백, 12 모서리, 15px. 기본 Medium `ink/700`, 선택 `brand/50` + Bold `brand/700`.

| 탭 | 기존 화면 |
|---|---|
| 학원 정보 | `/studio/mypage/profile`(공개 프로필), `/studio/settings`(공식정보 수정 요청) |
| 선생님 | `/studio/teachers` |
| 플랜·결제 | `/studio/billing` |
| 내 계정 | `/studio/mypage` |

- "운영 시간" 탭은 넣지 않는다.
- 각 폴더의 `layout.tsx`가 이 틀을 씌운다. 권한 확인은 각 page의 `requireTeacherStudioAccess`가 그대로 한다.
- 탭 안 화면은 자기 페이지 제목(h1) · 뒤로가기 · 바깥 여백을 갖지 않는다(틀이 갖는다). 행동 버튼과 설명은 그대로 둔다.
  내용 디자인은 아직 기존 화면이다.

### 4.3 화면 안 하위 탭 (`studio-classes-schedule-tabs.tsx`, Figma 2178:232)

수업·일정 메뉴 안의 "수업 | 전체 일정". 글자 15, 탭 사이 24, 글자 아래 8 띄우고 2px 선.
기본 Medium `ink/500`(선 없음), 선택 Bold `brand/700` + `brand/700` 선. 탭 줄 아래 전체에 `line/default` 1px.
두 화면을 합치기 전까지는 기존 두 URL(`/studio/classes`, `/studio/schedule`)을 오가는 링크다.
3단계부터 이 탭은 두 화면 공통 머리(`studio-classes-schedule-header.tsx`, §5.12) 안에 들어간다.

## 5. 부품 (`src/features/studio/ui/v2/`)

v2로 옮긴 화면(사이드바 · 설정 틀 · 수업·일정 탭 · 수업 등록/수정 · 특정 날짜 팝업 · 3단계의 수업 탭 · 전체 일정 탭 · 예약 시간 관리 팝업 · 4단계의 신청 목록 · 상세 · 기존 예약 가져오기 · 5단계의 홈)에서만 쓴다. 나머지 화면 본문은 아직 기존 부품이다.

### 5.1 Button — `V2Button`, `v2ButtonClassName` (Figma `2024:145`)

| size | 높이 | 좌우 | 글자 | 아이콘 |
|---|---|---|---|---|
| lg | 52 | 20 | 16 / 22 Bold | 18 |
| md | 44 | 16 | 15 / 20 Bold | 18 |
| sm | 36 | 12 | 13 / 20 Bold | 16 |

| variant | 배경 | 글자 | 테두리 | 쓰임 |
|---|---|---|---|---|
| primary | `brand/700` | white | — | 한 화면 1개 |
| tonal | `brand/50` | `brand/700` | — | 표의 행 버튼 |
| outline | white | `ink/900` | `line/default` | 화면 상단 보조 행동 |
| ghost | 없음 | `ink/700` | — | 덜 중요한 행동 |

공통: 모서리 12, 아이콘–글자 간격 6.
**[코드 결정]** hover — primary `brand/800`, tonal 테두리 `brand/200`, outline · ghost 배경 `surface/fill`.
focus — 2px `brand/700` 외곽선(2px 띄움). disabled — 투명도 0.4.
`<button>`이 아닌 링크를 버튼 모양으로 그릴 때는 `v2ButtonClassName({ variant, size })`를 쓴다.

### 5.2 Chip — `V2Chip` (Figma `2024:152`)

필터 · 단일 선택. 8/14 여백, pill, 간격 4, 글자 14/20(칩 높이 38에서 역산).
- 기본: 흰 바탕 + `line/default`, 라벨 Medium `ink/700`, 건수 `ink/400`.
- 선택: `brand/50` + `brand/700` 테두리, 라벨 Bold `brand/700`, 건수 `brand/700`.
- 선택 여부는 `aria-pressed`로도 알린다. **[코드 결정]** hover(비선택) `surface/fill`.
- 주소를 바꾸는 필터(신청 목록)는 링크라서 `v2ChipClassName({ selected })` · `v2ChipPartClassName`으로 같은 모양을 그린다.

### 5.3 StatusBadge — `V2StatusBadge` (Figma `2002:100`)

3/8 여백, 6 모서리, 12/16 Bold(첫수업/Badge).

| tone | 배경 | 글자 |
|---|---|---|
| green | `brand/50` | `brand/700` |
| amber | `state/warn-bg` | `state/warn-fg` |
| gray | `surface/fill` | `ink/500` |
| red | `state/danger-bg` | `state/danger-fg` |
| blue | `subject/math-bg` | `subject/math-fg` |

어떤 상태가 어떤 tone인지는 지금처럼 `src/features/studio/lib/application-status-labels.ts`가 정한다. 라벨 · tone 판정을 부품 안에서 다시 만들지 않는다.

화면 전용 표시 상태(DB 값 아님): `in_trial` 체험 진행 중(blue) — 확정 + 체험 시간 중, `completion_needed` 완료 확인 필요(amber) — 확정 + 예정 종료 시각 경과 · 완료 처리 전(4단계). 판정은 `trial-completion.ts`의 `getTrialProgressState` 하나만 쓴다.

### 5.4 TextField — `V2TextField` (Figma `2024:168`)

라벨(14/20 Bold `ink/900`) → 8 → 입력(높이 48, 좌우 14, 12 모서리, `line/default`, 첫수업/Body) → 8 → 도움말(첫수업/Caption `ink/500`).
**[코드 결정]** focus 테두리 `brand/700`, 오류 테두리 `state/alert` + 도움말 자리에 오류 문구(`state/danger-fg`), placeholder `ink/400`, disabled 배경 `surface/fill`.

### 5.5 Select — `V2Select` (Figma 수업 등록 화면 `2173:186`)

TextField와 같은 틀. 입력 높이 44, 좌우 14, 글자 14 Medium, 오른쪽에 아래 화살표 16(`ink/500`).
브라우저 기본 `<select>`를 쓰고 모양만 덮는다. Figma 화면의 선택 입력 도움말은 12px이지만 TextField 부품과 맞춰 Caption(13)으로 통일했다 **[코드 결정]**.

### 5.6 Toggle — `V2Toggle` (Figma `2024:177`)

44 × 26, 손잡이 지름 20(안쪽 3). 꺼짐 `ink/300`, 켜짐 `brand/700`, 손잡이 white.
checkbox + `role="switch"` — form에 그대로 제출된다.

### 5.7 접이식 Section — `V2Section` (Figma `2173:144` 접힘 · `2173:916` 펼침)

흰 바탕 + `line/default` 테두리, 16 모서리.
- 헤더: 16/20 여백, 간격 10. 원 글자 24(접힘 `surface/fill` + `ink/500`, 펼침 `brand/700` + white) · 제목 16 Bold · 접혔을 때만 오른쪽 요약(13 Medium `ink/500`) · 화살표 18(접힘 >, 펼침 v).
- 본문: 위에 `line/subtle` 1px, 여백 20/20/24, 항목 간격 24.
- `<details>`로 만든다(JS 없이 열고 닫힘, 키보드 · 스크린리더 지원).

### 5.8 Avatar — `V2Avatar` (Figma `2024:166`)

원형, 기본 36(목록 행 40). 첫 글자 Bold `ink/700`, 크기는 지름 × 14/36.
배경 기본 `surface/fill`, `tone="brand"`이면 `brand/50`. 이미지가 있으면 원을 채우고, 깨지면 첫 글자로 돌아간다.
Figma 사이드바 예시는 학원 과목색(`subject/coding-bg`)을 배경으로 쓰지만, 셸은 학원 과목을 모르므로 기본 배경을 쓴다.

### 5.9 Dialog — `V2Dialog` (Figma 2178:959)

브라우저 기본 `<dialog>.showModal()`. 너비 기본 880(`width`로 조정), 모서리 20, 그림자 대신 어두운 배경 덮개(팝오버 예외).
- 머리: 22/24/16 여백, 제목 20 Bold, 설명 13 Medium `ink/500`, 오른쪽 X 20.
- 본문: 4/24/20 여백, 넘치면 본문만 스크롤.
- 발: 위 `line/subtle` 1px, 16/24 여백, 간격 10, 왼쪽 안내 12 `ink/500` + 오른쪽 [닫기] outline md.
  `footerActions`를 주면 [닫기] 오른쪽에 붙는다(예약 시간 관리 2178:373의 [선택 시간 마감 (N개)] primary md).
- 작업 중(`busy`)에는 닫기 · Esc · 바깥 누름으로 닫히지 않는다. **[코드 결정]** 배경 덮개 `ink/900` 40%.

### 5.10 SubjectIcon3D — `V2SubjectIcon3D` (Figma 1986:154)

과목 3D 아이콘. Figma 시트 한 장(`public/images/studio/subject-3d-sprite.png`)을 과목별 위치로 잘라 보인다.
키는 DB 과목 대분류 코드(12종), 모르면 "기타". 52px 이상 자리 · 흰 바탕 위에서만 쓴다.
예외(Figma에 그려진 그대로): 수업 탭 목록 행은 흰 원 44 안에 28, 선택한 수업 머리는 흰 상자 64(모서리 16) 안에 44.

### 5.11 화면 패턴 — 수업 등록 · 수정 (Figma 2173:423 · 2173:722 · 2173:1081 · 2178:602)

- 집중 화면이지만 사이드바는 아직 보인다(사이드바 숨김은 별도 단계, §7).
- 머리: "← 수업·일정"(13 `ink/500`) · 제목 28 Bold · 설명 14 → 20 → 임시 보관 안내(`surface/fill` 상자) → 20 → 본문.
- 본문 1104 = [접이식 Section 720 | 24 | 미리보기 360]. Section 사이 12.
- Section 안 한 줄: [라벨 116 · 14 Bold | 16 | 입력]. 입력 높이 44 · 모서리 12 · 14 Medium, 도움말 12 `ink/500`. 체험 운영(C)만 라벨을 위에 쌓는다.
- 체험 운영 그룹: `surface/fill` 상자 · 모서리 12 · 여백 18 · 간격 16. 예약 가능 시간 상자는 흰 바탕 · 모서리 10, 시간 칩은 `brand/50` + `brand/700`.
- 미리보기: 흰 카드 · 테두리 · 모서리 16, 이미지 칸 150(없으면 SubjectIcon3D 72), 키-값 줄(라벨 84 · 13), `line/subtle` 구분선, [수업 미리보기] outline md + [저장] primary lg.
- 특정 날짜만 변경하기 팝업: 왼쪽 달력 카드(테두리 · 모서리 14 — Figma에 적힌 값) + 오른쪽 날짜 패널.
  달력 칸 38 · 모서리 10 · 예약 시간 있는 날 Bold + 4px 점(초록 `brand/500` 운영일, 주황 `state/warn-fg` 마감·숨김 있는 날), 선택 `brand/700`.
  시간 카드 `surface/fill` · 모서리 12, 추가 카드는 `line/default` 점선 테두리. 입력 높이 40 · 모서리 10.

### 5.12 화면 패턴 — 수업·일정 머리 · 수업 탭 (Figma 2148:6043)

**머리 (두 탭 공통, `studio-classes-schedule-header.tsx`)**
- 제목 "수업·일정"(§2 화면 제목) + 설명(15 Regular `ink/500`) | [예약 시간 관리] outline md | [+ 수업 등록] primary md, 아래 끝 맞춤 · 간격 12.
- 20 아래에 하위 탭(§4.3). 본문 틀은 §2(위 36 · 좌우 48 · 아래 56 · 세로 24).

**수업 탭 본문** = 위 줄(상태 Chip 4개 + 검색 입력 320) → [수업 목록 300 | 32 | 선택한 수업].
- 목록 머리: "수업 N개" 15 Bold + 오른쪽 "공개 · 비공개 · 종료" 13 Medium `ink/500`. 좌우 4, 아래 6.
- 목록 행: 여백 12 · 모서리 16 · 간격 12, 행 사이 6. [과목 아이콘(§5.10 예외) | 수업명 15 + 보조 13 `ink/500`("대상 학년 · 다음 7일 N회") | StatusBadge].
  선택 행 `brand/50` + 수업명 Bold `brand/700`. hover `surface/fill` **[코드 결정]**.
- 수업 상태 배지: 운영 중 green · 비공개 gray · 종료 gray.
- 선택한 수업 머리: 아이콘 상자 64 | 수업명 24 Bold(-0.5) + 배지 / 요약 14 Medium `ink/700`("유형 · 학년 · 길이 · 가격 · 담당 방식") | [학부모 화면 보기] ghost sm · [수업 정보 수정] outline sm(연필 16) · ⋯ 행 메뉴(공개 전환 · 종료 · 복구 · 영구 삭제).
- 상세 탭: 글자 15, 탭 사이 28, 글자 아래 12 띄우고 2px 선, 탭 줄 아래 `line/default` 1px. 선택 Bold `brand/700`. 탭은 "체험 일정 · 수업 소개" 둘(Figma의 "신청 받는 방법"은 기능이 없어 넣지 않는다).
- 블록 제목 17 Bold(-0.2), 옆 보조 13 Medium `ink/500`, 오른쪽 ghost sm 버튼.
- 운영 시간 줄: `surface/fill` · 모서리 12 · 14/16 · 간격 16. [요일 140 · 15 Bold | 시간 · 간격 · 정원 14 Medium | 생기는 시간 14 Medium `ink/500`]. 줄 사이 10.
- 다음 7일: 7칸 · 간격 8. 칸 `surface/fill`(오늘은 `surface/ground-green`) · 모서리 12 · 10/8/12 · 최소 높이 170 · 간격 6.
  날짜 머리 = 요일 13 Medium(평일 `ink/500`, 토 `subject/math-fg`, 일 `state/danger-fg`) + 날짜 15 Bold + "오늘" 11 Bold `brand/700`.
  회차 칸: 모서리 `chip-time` · 8/10 · 간격 1, 시간 15 Bold + 보조 12 Medium.
  기본 흰 바탕 + `line/default`("모집 0/4" · "이 날만 · 0/4"), 신청 있음 `brand/50` + 1.5px `brand/700` + 글자 `brand/700`("신청 1/4"),
  마감 · 숨김 흰 바탕 · 투명도 0.8 · 시간 `ink/300` 취소선("마감" · "숨김").
  빈 날 "일정 없음" 12 `ink/300`, 아래 "+ 이 날만 추가" 12 `ink/400`. 칸 전체가 버튼 — 누르면 특정 날짜 팝업(§5.11)을 그 날짜로 연다.
- 아래 안내 13 Medium `ink/500`.

### 5.13 화면 패턴 — 예약 시간 관리 팝업 (Figma 2178:373)

- V2Dialog 너비 720. 본문 항목 간격 18.
- 위 줄: [선택 날짜 — 입력 200] 16 [적용 수업 — Chip "전체 공개 수업" · "수업 골라서"(간격 6)]. 라벨 13 Bold, 라벨–입력 8.
- 입력 상자(날짜 · 수업 선택 · 사유): 높이 40 · 좌우 12 · 모서리 10(`chip-time`) · 13 Medium, 앞 아이콘 16(`Icon/calendar`).
- 안내 12 Medium `ink/500`.
- 시간 표: 테두리 `line/default` · 모서리 12. 행 12/16 · 간격 12 · [선택 36 | 시간 / 수업 | 예약 상태 240]. 머리 행 `surface/fill` · 12 Bold `ink/500`.
  시간 14 Bold + 수업 12 Medium `ink/500`. 예약 상태 = StatusBadge + "기존 예약 N건" 12 `ink/500`. 고른 행 `brand/50` **[코드 결정]**.
  상태 tone: 예약 가능 green · 예약 마감 · 일부 수업 마감 amber · 만석 · 기본 마감·비공개 · 24시간 예약 제한 gray.
- Studio/Checkbox(2012:491/492/495): 18 · 모서리 5 · 테두리 1.5 `line/default`. 켜짐 `brand/700` + 흰 체크 14. 사용 불가 `surface/fill`.
- 이미 마감된 시간: `surface/fill` · 모서리 12 · 14/16. 제목 13 Bold, 줄 [체크 | 시간 · 수업 13 Bold / 범위 · 내부 사유 12 | "체크하면 마감 해제" 12].
- 적용 대상 미리보기: `brand/50` · 모서리 12 · 12/16 · 간격 10 · info 16 + 13 Medium `ink/700`.
- 발: 안내 + [닫기] + (해제할 마감이 있을 때만 [선택 마감 해제 (N건)] outline md) + [선택 시간 마감 (N개)] primary md.

### 5.14 화면 패턴 — 전체 일정 탭 (Figma 2178:144)

- 머리(§5.12) → 위 줄: [‹] 기간 16 Bold [›] (ghost sm) · [오늘] outline sm · 일/주/월 세그먼트 · (오른쪽) 필터 선택 3개. 간격 10.
- 세그먼트: `surface/fill` 틀 · 안쪽 3 · 모서리 10 · 항목 간격 2. 항목 6/14 · 모서리 8 · 13. 기본 Medium `ink/500`, 선택 흰 바탕 + Bold `ink/900`.
- 필터 선택: 너비 140 · 높이 40 · 좌우 12 · 모서리 10 · 13 Medium, "선생님 · 전체"처럼 이름과 값을 한 칸에. 오른쪽 chevron 14.
- 주 보기: 7칸 · 간격 8. 날짜 칸 `surface/fill` · 모서리 14 · 12/10 · 간격 8.
  날짜 머리 = 요일 13 Medium(일 `state/alert`, 나머지 `ink/500`) + 날짜 16 Bold + "오늘" 12 Bold `brand/700`. 머리를 누르면 예약 시간 관리 팝업.
  빈 날 "체험 없음" 12 `ink/400`.
- 예약 마감 띠: `state/warn-bg` · 모서리 8 · 6/8 · 11 Bold `state/warn-fg`. 누르면 그 날짜 · 그 수업으로 예약 시간 관리 팝업.
- 신청 카드: 흰 바탕 · 1px `line/subtle` · 모서리 10 · 안쪽 10 · 간격 4.
  시간 14 Bold · "이름 · 학년" 12 Bold · 수업 11 Medium `ink/500` · 담당 11 Medium `ink/500`(일정 확정 전 · 확정인데 미배정이면 "담당 미배정" `state/alert`) · StatusBadge.
  일정 확정이 필요한 신청(신규 · 검토 중)은 1.2px `state/warn-fg` 테두리. 취소는 시간 `ink/400`. 카드를 누르면 신청 상세.
- 일 보기: 같은 날짜 칸 하나를 본문 폭으로, 카드는 200 이상 칸으로 나눠 채운다 **[코드 결정: Figma에 일 보기 없음]**.
- 월 보기: 7칸 · 간격 8, 칸 = 주 보기 날짜 칸과 같은 바탕 · 모서리 14 · 안쪽 10 · 최소 높이 132, 이번 달이 아닌 칸은 흰 바탕 + `line/subtle`.
  칸 안 신청은 흰 줄(모서리 8 · 6/8 · 12) — 상태 색 점 6(tone별 배지 글자색: green `brand/700` · amber `state/warn-fg` · blue `subject/math-fg` · gray `ink/400` · red `state/danger-fg`) · 시간 Bold · 이름(넘치면 말줄임), 상태 글자는 화면 읽기용으로만. 최대 3개 + "+N개 더보기" **[코드 결정: Figma에 월 보기 없음]**.
  칸 빈 곳을 누르면 일 보기, 날짜 숫자를 누르면 예약 시간 관리 팝업(리뉴얼 전과 같음).
- 아래 안내: info 14 + 12 Medium `ink/500`.

### 5.15 화면 패턴 — 신청 목록 (Figma 2148:5142)

- 머리: 제목 "신청"(§2) + 설명 | 검색(`surface/fill` · 높이 40 · 너비 280 · 좌우 14 · 모서리 12 · 아이콘 18 + 14 Medium) | [기존 예약 가져오기] outline sm(내려받기 16).
- 보기 탭: §4.3 하위 탭 모양으로 "진행 중 · 완료·종료"(기존 두 보기). 그 아래 상태 필터 칩(§5.2, 링크). Figma의 칩 묶음(일정 확정 · 체험 예정 · 기록 작성 …)과 칩 옆 건수는 기존 필터 값 · 조회에 없어 쓰지 않는다.
- 표: 머리 아래 `line/default`, 행 아래 `line/subtle`, 행 16/8 · 칸 사이 16. 칸 [학생 200 | 진행 상태 160 | 체험수업·일정 1fr | 등록 상태 150 | 담당 130 | 지금 할 일 150 오른쪽 끝].
  학생 16 Bold + 학년 14 Medium `ink/500` / 보호자 13. 진행 · 등록 상태는 StatusBadge(공용 tone) + 아래 13 `ink/500` 한 줄.
  담당: 원 28(`surface/fill`, 첫 글자 11 Bold) + 이름 14. 미배정은 원 `state/danger-bg` "?" + 이름 `state/danger-fg`.
  지금 할 일: 행 전체가 상세로 가는 링크라 tonal sm 버튼 모양의 글자만 둔다(누르면 그 단계 칸으로). 할 일이 없으면 13 `ink/400`.
- 행 hover `surface/fill` **[코드 결정]**. 아래 줄: "N건 중 a–b건" + 페이지 이동(ghost sm).

### 5.16 화면 패턴 — 신청 상세 (Figma 2148:5195)

- 틀: 위 28 · 좌우 48 · 아래 56 · 세로 24. 맨 위 "‹ 신청"(Icon/back 18 + 14 Medium `ink/500`).
- 학생 머리: 과목 3D 아이콘 원 64(아이콘 40) | 이름 28 Bold(-0.7) + 학년 17 Bold `ink/500` + 단계 배지 / 수업 · 일정 · 담당 15 `ink/700` / 보호자 · 연락처 · 신청일 14 `ink/500` | [전화] [문자] outline sm.
- 6단계: `surface/fill` · 모서리 16 · 18/20. 원 28 · 선 2. 지난 단계 `brand/500` + 체크, 지금 `brand/700` + 숫자, 남은 단계 흰 원 + `ink/400`. 글자 14(지금 Bold `brand/700`).
  단계는 저장된 값에서 계산만 한다(`getApplicationDetailSteps`): 신청 접수 · 일정 확정 · 체험 · 기록 작성 · 리포트 보내기 · 등록 결과. 취소 · 불참 · 등록 결과 확정이면 지금 단계가 없다.
- "지금 할 일" 카드: 1px `brand/200` · 모서리 16 · 안쪽 28 · 간격 18. 라벨 14 Bold `brand/700` · 제목 22 Bold(-0.5) · 설명 15 `ink/700`. 할 일이 없는 상태(체험 전 대기 · 취소 · 결과 확정)는 테두리 `line/default` · 라벨 `ink/500`.
  화면의 주 버튼(primary lg)은 이 카드 안에만 둔다. 무엇이 지금 할 일인지는 `deriveApplicationDetailWorkflow`가 정한다.
- 일정 확정: 체험 시간 카드(모서리 `chip-time` · 12/16 · `brand/50` + 1.5px `brand/700`, 학부모가 고른 시간 하나) → 담당 선생님 선택(높이 48, 비워 두면 미배정) → [이 일정으로 확정] primary lg … [신청 취소] ghost md 오른쪽 끝. "다른 시간 보기 · 제안"은 기능이 없어 넣지 않는다.
- 아래: [진행 기록 · 등록 상담 메모 | 오른쪽 400] 사이 40. 진행 기록 제목 20 Bold, 줄 = 점 10(최신 `brand/500`, 나머지 `line/default`) + 15 Medium + 시각 13.
  오른쪽: 신청 정보(`surface/fill` · 모서리 16 · 안쪽 24 · 줄 [라벨 92 · 14 `ink/500` | 값 14]) → 담당 선생님 → 학부모 의향(`surface/fill`) → 학부모 피드백 → 리포트 · 체험 기록 카드(테두리 `line/default` · 모서리 16 · 안쪽 24 · 간격 10).

### 5.17 화면 패턴 — 기록 작성 · 리포트 보내기 (Figma 2148:5324 · 2148:5465)

- 기록 작성은 V2Dialog(너비 1104) [입력 | 40 | 학부모 화면 340]. Figma는 화면 전환이지만 저장 전 확인 · 닫기 확인 흐름을 지키려고 팝업으로 둔다 **[코드 결정]**. 자동 저장은 없다.
  관찰 항목: 과목 그룹 제목 14 Bold `ink/700` + Chip(§5.2). 위에 "N / 7개"(13, 7개면 `state/warn-fg` Bold) — 저장 RPC가 7개를 넘으면 거절해서 8번째 칩은 막는다(`TRIAL_RESULT_OBSERVATION_MAX`).
  선생님 이야기: 라벨 15 Bold + "N / 1000자" · 텍스트 칸 모서리 12 · 안쪽 16 · 최소 높이 120. 추천 반 · 추천 레벨 입력 높이 48 두 칸. 추천 요일 · 시간대는 Chip.
  학원 메모는 이 팝업에 넣지 않는다 — 저장이 따로인 "등록 상담 메모"(상세 아래)다.
- 리포트 보내기: [지금 할 일 카드 | 40 | 학부모 화면 360]. 확인 목록 `surface/fill` · 모서리 12 · 14/16 · 간격 10 · 체크 18 `brand/700`(없는 항목은 `ink/400`).
  경고 `state/warn-bg` · 모서리 12 · 12/14 · 13 Medium `state/warn-fg`("보낸 뒤에는 고칠 수 없어요."). [학부모에게 보내기] primary lg(보내기 18) [기록 수정] outline lg(연필 18).
  요금제 잠금 · 막힌 이유(학부모 계정 없음 등)는 경고 자리에 같은 모양으로. 리포트 거두기는 연결하지 않는다.
- 학부모 화면: 휴대폰 틀 대신 흰 카드(테두리 `line/default` · 모서리 20 · 18/20/24). 위 라벨 "학부모에게 이렇게 보여요" 14 Bold `brand/700` 가운데. §7 "학부모 앱 화면 미리보기 틀"이 정해지면 바꾼다.

### 5.18 화면 패턴 — 등록 결과 (Figma 2148:5579)

- 결과 카드 4개(결정 전 · 고민 중 · 등록 완료 · 미등록 — `REGISTRATION_STATES` 라벨) · 간격 12. 카드 흰 바탕 · `line/default` · 모서리 16 · 16/18, 라벨 16 Bold + 안내 13. 고른 카드 `brand/50` + 1.5px `brand/700`.
- 고민 중 · 미등록이면 이유 Chip(여러 개) + 메모(학원만 봐요). Figma의 "다시 연락할 날"은 기능이 없어 넣지 않는다. [결과 저장] primary lg.

### 5.19 화면 패턴 — 기존 예약 가져오기 (Figma 2148:5719)

- 틀은 §5.16과 같다. 제목 30 + 설명 → 안내(`state/warn-bg`: 알림이 가지 않고 리포트를 보낼 수 없음) → 단계(원 26 · 선 40 · 14 Bold: 파일 올리기 · 확인하기 · 가져오기).
- 파일 상자: `surface/fill` · 모서리 16 · 16/20 · 간격 12, 내려받기 22 + 파일 이름 15 Bold + 요약 13 | [양식 받기] ghost sm. 아래 [파일 고르기](outline sm 모양) + [파일 확인].
- 확인 표: 머리 아래 `line/default`, 행 아래 `line/subtle`, 행 12/8. 확인 필요 행 `state/warn-bg`, 오류 행 `state/danger-bg`. 확인 칸 = StatusBadge(정상 green · 확인 필요 amber · 오류 red) + 안내 13.
- 아래: 안내 14 `ink/500` | [취소] outline lg [N건 가져오기] primary lg.

### 5.20 화면 패턴 — 홈 · 오늘 할 일 (Figma 2148:4963)

배치는 Figma 그대로다. 데이터가 없으면 카드를 빼거나 바꾸지 않고 같은 카드 모양에 빈 상태 문구만 둔다. Figma에 없는 요소는 홈에 두지 않는다(성과 분석은 "분석" 메뉴로 옮겼다).

- 틀: 위 32 · 좌우 48 · 아래 56 · 세로 32(Figma 홈 값).
- 머리(간격 12): 날짜 · 시각 14 Medium `ink/500`("10월 23일 금요일 · 오후 8:25") → 시간대 인사 28 Bold(-0.7)("좋은 아침이에요 / 좋은 오후예요 / 좋은 저녁이에요, 원장님")
  | 검색(`surface/fill` · 260 × 40 · 모서리 12 · 좌우 14 · 아이콘 18 + 14 Medium, placeholder `ink/400`) — Enter면 신청 목록 검색(`/studio/cases?q=`) | [수업 등록] outline md(더하기 18). 알림 종은 기능이 없어 넣지 않는다.
- 첫 줄 [가장 먼저 | 20 | 오늘 체험 400], 두 칸 높이를 맞춘다.
  - 가장 먼저(`StudioHomeFirstTask`): `surface/ground-green` · 모서리 20 · 안쪽 28 · 간격 20.
    머리: "가장 먼저"(`brand/700` pill · 4/10 · 12 Bold white) + "오늘 할 일 N개 중 M번째" 13 Medium `ink/500` | 점(20×6 · 모서리 3 · 간격 4, 지금 `brand/500` · 나머지 `brand/200`, 최대 5).
    **[코드 결정]** 점 양옆 화살표(24 원, ghost)로 한 장씩 넘긴다(화면 상태만).
    몸: 과목 원 72(흰 바탕 · `line/default`) 안에 3D 48 | 제목 24 Bold(-0.5, 사람 중심 문장) / 학년 · 수업 · 일시 15 `ink/700`.
    버튼: 일정 확정 단계는 [✓ 이 시간으로 확정] primary lg(상세 일정 확정과 같은 서버 액션 · 학부모 희망 시간 그대로) + [다른 시간 보기] outline lg(상세 `#confirm-schedule`) + 오른쪽 안내 13 Medium `ink/500`.
    희망 시간이 지났거나 확정할 일정이 없으면 [일정 확정하러 가기] 하나. 다른 단계는 주 버튼 하나(상세 해당 칸으로 이동).
  - 오늘 체험: 흰 바탕 + `line/default` · 모서리 20 · 24/24/16 · 간격 4. "오늘 체험 N명"(20 Bold, 숫자 `brand/700`) | "수업·일정 ›" 13 Medium `ink/500`.
    줄 12/0 · 간격 14: 시각 16 Bold(폭 50, 체험 중이면 `brand/700`) · 점 10(체험 중 `brand/500`, 나머지 `line/default`) · 이름 · 학년 15 Bold + 배지(공용 표시 상태) / 수업 · 담당 13 Medium `ink/500`(미배정 `state/danger-fg`) · 오른쪽 tonal sm [완료](진행 중 · 완료 확인 필요) / [배정](담당 미배정).
    줄 전체가 상세로 가는 링크다(완료 · 배정은 상세에서). 오늘 체험이 없으면 "오늘 체험은 없어요" + 다가오는 체험 3건까지 작게(13).
- 체험에서 등록까지: 제목 20 Bold + "체험 예정 N명은 오늘 체험 · 수업·일정에서 봐요" 13 `ink/500` | "신청 전체보기 ›" 14 Medium `ink/500`. 칸 4개 사이 8 + 화살표 20(`ink/400`, 위 16).
  칸: `surface/fill` · 모서리 16 · 안쪽 12 · 간격 8. 머리 15 Bold + 건수 pill(흰 바탕 · 1/8 · 12 Bold `ink/700`) / 설명 12 Medium `ink/500`.
  카드: 흰 바탕 · 모서리 12 · 안쪽 14 · 간격 10. [3D 32 · 간격 10 · 이름 15 Bold + 학년 13 / 수업 13 `ink/700`] / 일시 12 `ink/500` / [상태 12 | tonal sm(확정 · 기록 쓰기 · 보내기 · 결과 입력)].
  상태 글자: 일정 확정 "N일째 기다림"(`state/warn-fg`) · 당일 "오늘 신청", 기록 작성 "N일째", 리포트 "아직 안 보냄", 등록 결과 "학부모 의견 있음"(`brand/700`) · 없으면 보낸 날짜.
  일정 확정 칸 첫 카드(가장 오래 기다린 신청)는 1.5px `brand/500` 테두리. "완료 확인 필요"(공용 판정)는 기록 작성 칸 맨 앞 · 상태 `state/warn-fg` · [완료 확인].
  **[코드 결정]** Figma 그대로 연회색 칸 위에 흰 카드를 둔다(§8 예외: 단계 보드). 칸마다 2장 + "N건 더 보기 ›". 카드 · 버튼은 상세로 이동만.
  건수 · 카드는 `getStudioCaseStageBoard`(신청 목록과 같은 조회 조건 · `deriveCasesWorkflow` 판정 · 정렬).
- 아래 3칸(같은 너비 · 간격 20 · 높이 맞춤). 카드 안쪽 24 · 간격 12 · 모서리 16, 제목 16 Bold.
  - 이번 달 등록 전환(흰 바탕 + `line/default`): "N월 등록 전환" | "분석 ›". 비율 34 Bold(-0.7) + "M월보다 ±N%p" 14 Bold `brand/700` / "체험 N명 중 M명이 등록했어요" 13 / 최근 6개월 막대(간격 6 · 모서리 4 · `line/default`, 이번 달 `brand/500` · 달 11 Medium).
    값은 기존 `buildStudioDashboardMetrics`를 달마다(신청일 cohort) 부른 것(등록 ÷ (등록 + 미등록)). 결과가 없는 달은 막대 0 · "-". 무료 플랜이면 같은 카드에 요금제 안내.
  - 학부모 의견(`surface/fill`): 메시지 18(`brand/700`) + 제목 + "새 글 N"(최근 7일, 12 Bold `brand/700`) / 인용 16 Regular / "학생(학년) 보호자" 13 `ink/500` | "답하기 ›" 13 Bold `brand/700`(신청 상세로 이동).
  - 다시 연락할 학생(흰 바탕 + `line/default`): 제목 | "학생 ›"(신청 목록 고민중) / "N명" 34 Bold + "고민 중" 14 Bold `ink/500` / 아바타 32(흰 테두리 2 · 겹침 -8) 3개 + "+N".
    Figma의 안내 문장과 [토요일 반 안내 보내기]는 문자 기능이 없어 넣지 않는다(2차).

### 5.21 화면 패턴 — 분석 (홈의 성과 분석을 옮김)

- 틀은 §2(위 36 · 좌우 48 · 아래 56 · 세로 24). 제목 "분석" 30 + 기간 설명 14 `ink/500` | 인포그래픽 보기 · 기간 칩.
- 흐름 카드 `surface/fill`, 도넛 카드 흰 바탕 + `line/default`(모서리 16 · 안쪽 24). 도넛 색: 체험 완료 · 등록 `brand/500`, 불참 `state/danger-fg`, 취소 · 미등록 `ink/400`, 진행 전 `line/default`.
- 아래 [미등록 사유(`surface/fill`) | 최근 등록 결과(흰 바탕 + `line/default`)]. 계산 · 조회는 홈에 있을 때와 같다. 2차 분석 화면이 생기면 바뀐다.

## 6. 아이콘 (`v2-icons.tsx`)

- Figma `Icon/*` 원본 path를 그대로 옮긴다. stroke 1.8, 메뉴 아이콘 viewBox 20, 나머지 24.
- 색은 `currentColor` — CSS가 정한다. 상태별로 색칠한 SVG를 따로 두지 않는다.
- 아이콘 패키지를 쓰지 않는다. 필요한 아이콘은 Figma "Icons v2"(`2024:43`) · "Icons"(리디자인 v1)에서 path를 가져와 더한다.
- 5단계에서 더한 것: `V2ChartIcon`(nav/분석, viewBox 20).
- 4단계에서 더한 것: `V2SearchIcon`(18), `V2DownloadIcon` · `V2PhoneIcon` · `V2MessageIcon`(16), `V2BackIcon` · `V2SendIcon`(18).
- 3단계에서 더한 것: `V2PencilIcon`(버튼 안 16), `V2CheckIcon`(Studio/Checkbox 안 14, viewBox 14), `V2DateIcon`(`Icon/calendar` 2002:53, 24 — 메뉴의 `V2CalendarIcon`과 모양이 다르다).

## 7. 아직 정하지 않은 것 (2단계 이후)

아래는 Figma에 그려져 있지만 1단계 범위가 아니라 코드 규칙을 만들지 않았다. 해당 화면을 옮길 때 Figma를 다시 확인하고 이 문서에 먼저 적는다.

- 화면별 본문 패턴: 학생, 2차 분석 (수업·일정은 3단계 §5.12~5.14, 신청은 4단계 §5.15~5.19, 홈은 5단계 §5.20, 분석(이전)은 §5.21로 정했다)
- "학생" 메뉴
- 집중 화면(수업 등록)의 사이드바 숨김 · 위 단계 · 아래 고정 버튼
- 학부모 앱 화면 미리보기 틀(수업 등록 화면 오른쪽은 아직 요약 카드)
- 표(목록) 행 · 머리글 규격, 팝오버 · 모달 · 토스트

## 8. 하지 말 것

- 이 문서에 없는 색 · 간격 · 모서리 · 그림자를 새로 만들지 않는다.
- 초록을 장식(아이콘 색, 큰 면, 일러스트)에 쓰지 않는다. 진행 버튼과 선택 상태에만.
- 한 화면에 primary 버튼을 둘 이상 두지 않는다.
- 카드에 그림자를 주지 않는다(팝오버만 예외).
- 회색 바탕 위에 흰 카드를 얹지 않는다(예외: 홈 단계 보드 §5.20).
- 한 화면 안에서 v2 토큰(`--sv2-*`)과 기존 토큰(`--brand-*`, `--text-*`)을 섞지 않는다.
- 상태 라벨 · tone을 화면마다 다시 정하지 않는다(§5.3).

## 9. 작업 절차 (에이전트)

1. 이 문서를 읽는다.
2. 고칠 화면의 Figma 노드를 찾아 `get_design_context` · `get_variable_defs`로 값을 확인한다.
3. 값이 §3 토큰에 있으면 토큰을, 부품이 §5에 있으면 부품을 쓴다.
4. 문서에 없는 규칙이 필요하면 구현하지 말고 보고한다. 규칙을 바꿔야 하면 문서를 먼저 고친다.

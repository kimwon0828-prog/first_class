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
3. **메뉴** — 홈 · 신청 · 수업·일정. 항목 높이 44, 좌우 12, 모서리 12, 아이콘 20 + 간격 12, 글자 15.
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
| 설정 | `/studio/mypage/profile` | 설정 탭의 모든 경로(§4.2) |

- "학생", "분석" 메뉴는 기능이 생기는 2단계에서 추가한다.
- 메뉴 건수: "신청" 옆에 일정 확정이 필요한 신청 수를 보인다. 신청 화면 "신규 신청" 칩과 같은 조건 · 같은 조회
  (`countStudioCases(view: active, filter: schedule_needed)`). 0이거나 조회에 실패하면 숨긴다.
  모양: pill · 좌우 8 · 12/16 Bold, 기본 `surface/fill` + `ink/700`, 선택된 메뉴에서는 `brand/700` + white. "홈" 건수는 아직 없다.
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

## 5. 부품 (`src/features/studio/ui/v2/`)

v2로 옮긴 화면(사이드바 · 설정 틀 · 수업·일정 탭 · 수업 등록/수정 · 특정 날짜 팝업)에서만 쓴다. 나머지 화면 본문은 아직 기존 부품이다.

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
- 발: 위 `line/subtle` 1px, 16/24 여백, 왼쪽 안내 12 `ink/500` + 오른쪽 [닫기] outline md.
- 작업 중(`busy`)에는 닫기 · Esc · 바깥 누름으로 닫히지 않는다. **[코드 결정]** 배경 덮개 `ink/900` 40%.

### 5.10 SubjectIcon3D — `V2SubjectIcon3D` (Figma 1986:154)

과목 3D 아이콘. Figma 시트 한 장(`public/images/studio/subject-3d-sprite.png`)을 과목별 위치로 잘라 보인다.
키는 DB 과목 대분류 코드(12종), 모르면 "기타". 52px 이상 자리 · 흰 바탕 위에서만 쓴다.

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

## 6. 아이콘 (`v2-icons.tsx`)

- Figma `Icon/*` 원본 path를 그대로 옮긴다. stroke 1.8, 메뉴 아이콘 viewBox 20, 나머지 24.
- 색은 `currentColor` — CSS가 정한다. 상태별로 색칠한 SVG를 따로 두지 않는다.
- 아이콘 패키지를 쓰지 않는다. 필요한 아이콘은 Figma "Icons v2"(`2024:43`) · "Icons"(리디자인 v1)에서 path를 가져와 더한다.

## 7. 아직 정하지 않은 것 (2단계 이후)

아래는 Figma에 그려져 있지만 1단계 범위가 아니라 코드 규칙을 만들지 않았다. 해당 화면을 옮길 때 Figma를 다시 확인하고 이 문서에 먼저 적는다.

- 화면별 본문 패턴: 홈(지금 할 일), 신청 목록 · 상세 단계(②~⑥), 수업·일정(왼쪽 목록 + 오른쪽 상세, 다음 7일 칸), 분석, 학생
- "홈" 메뉴 건수 배지, "학생" · "분석" 메뉴
- 집중 화면(수업 등록)의 사이드바 숨김 · 위 단계 · 아래 고정 버튼
- 학부모 앱 화면 미리보기 틀(수업 등록 화면 오른쪽은 아직 요약 카드)
- 표(목록) 행 · 머리글 규격, 팝오버 · 모달 · 토스트

## 8. 하지 말 것

- 이 문서에 없는 색 · 간격 · 모서리 · 그림자를 새로 만들지 않는다.
- 초록을 장식(아이콘 색, 큰 면, 일러스트)에 쓰지 않는다. 진행 버튼과 선택 상태에만.
- 한 화면에 primary 버튼을 둘 이상 두지 않는다.
- 카드에 그림자를 주지 않는다(팝오버만 예외).
- 회색 바탕 위에 흰 카드를 얹지 않는다.
- 한 화면 안에서 v2 토큰(`--sv2-*`)과 기존 토큰(`--brand-*`, `--text-*`)을 섞지 않는다.
- 상태 라벨 · tone을 화면마다 다시 정하지 않는다(§5.3).

## 9. 작업 절차 (에이전트)

1. 이 문서를 읽는다.
2. 고칠 화면의 Figma 노드를 찾아 `get_design_context` · `get_variable_defs`로 값을 확인한다.
3. 값이 §3 토큰에 있으면 토큰을, 부품이 §5에 있으면 부품을 쓴다.
4. 문서에 없는 규칙이 필요하면 구현하지 말고 보고한다. 규칙을 바꿔야 하면 문서를 먼저 고친다.

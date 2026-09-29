# Studio Dashboard donut rendering V2 — local visual review

2026-09-29. Production 배포와 git 반영 없음.

**로컬 렌더 계약은 통과했지만, 사용자가 본 Production arc 증상의 정확한 원인은 아직 확정되지 않았다.** 실제 문제 브라우저의 인증된 DOM을 읽지 못했고, 같은 main arc 코드로 실제 localhost Dashboard를 실행했을 때 Chromium / WebKit / Firefox에서는 그 증상이 재현되지 않았다. Synthetic HTML의 성공을 Production 문제 해결 증거로 취급하지 않는다.

## 기준과 재현

- origin/main: `1e6f7de90ba1f5a55f97b5e9da0597ef09c075ab`.
- 최신 READY Production 배포: `dpl_5KuqkyYYYFLKkfQ15StwnspRszWX`, 동일 SHA. `studio.firstsuup.com` alias 연결 확인.
- 따라서 배포 메타데이터상 arc 변경은 포함되어 있다. 사용자가 열어 둔 탭의 이전 RSC/DOM/cache 잔존 여부는 미확인이다.
- 로컬 HEAD는 `02060e7d2fe41e5dd7ac10f403029b5e8193869a`이며 기존 dirty 작업을 보존했다. main과의 Dashboard 페이지 차이는 이전 dash/arc 렌더러였다. main의 page/helper를 재현 기준으로 가져온 뒤 변경했다. main merge나 reset은 하지 않았다.
- 원래 프로젝트 `/Users/1to6/Desktop/첫수업 트레이`, `http://localhost:3000/studio`에서 실제 인증 → 로컬 Supabase → 기존 query → 기존 metrics → 실제 Dashboard 컴포넌트를 사용했다. 테스트용 HTML/별도 앱으로 대체하지 않았다.
- 별도 로컬 TEST 조직에 fixture를 작성했다. Production DB/Auth 쓰기, migration, 알림 발송 없음. `.env.local`은 바꾸지 않고 검수 서버 프로세스에만 로컬 DB 환경변수를 주입했다.

## 원인 분리: main의 기존 arc

실제 DOM에서 취소 path는 `M 60 8 A 52 52 0 0 1 60 112`, 진행 path는 `M 60 112 A 52 52 0 0 1 60 8`이었다.

| 후보 | 관찰 |
|---|---|
| A 내부 경계 닫기 오류 | 기존 path는 열린 centerline arc이며 `Z`/내부 arc가 없다. fill=none, stroke 폭 14다. |
| B 180도 flag 오류 | 시작 -90°→90°, 다음 90°→270°. largeArc=0, sweep=1이며 정상이다. |
| C 부동소수점 gap/overlap | 두 path 끝점 `(60,112)`와 시작/마지막 `(60,8)`이 정확히 동일하다. |
| D cap/join | 계산된 cap=butt, join=miter. 단일 arc 내부에 corner join이 없다. |
| E mask/center hole | mask/clipPath 없음. 중앙 숫자는 HTML overlay이며 hole을 자르지 않는다. |
| F 비율/서브픽셀 | viewBox 120×120, 실제 SVG 112×112. X/Y 배율 동일(112/120), path transform 없음. 부모 x=729.5 같은 분수 위치는 있지만 arc 결함은 재현되지 않았다. 부모 overflow=visible, SVG overflow=hidden이나 외곽 r=59는 viewBox 안이다. |
| G 0% path | 0/0/2/2에서 track 1개 + 유효 path 2개뿐이다. |
| H 기타 | 문제 브라우저의 실제 DOM/cache/GPU 환경은 확인이 필요하다. 현재 근거로 특정 엔진 버그나 arc 계산 오류를 단정하지 않는다. |

이전 dash 방식은 같은 실제 카드 DOM에서 50/50 하단의 작은 꺾임을 재현했다. `pathLength=100`을 제거하고 `2π×52`의 canonical circumference를 쓰는 circle 방식도 꺾임이 남았다. 따라서 **원인이 pathLength 정규화뿐이었다는 설명은 근거가 부족하다.** zero path를 제외한 비교에서도 발생했으므로 zero path만의 문제도 아니다. 이 비교는 브라우저가 stroke/dash를 그린 출력의 문제를 보여 주지만, Production arc 증상의 원인을 증명하지는 않는다. SVG 길이/arc 의미는 [W3C SVG paths](https://www.w3.org/TR/SVG/paths.html)를 기준으로 확인했다.

## 최종 렌더링

부분 segment는 **fill 기반 닫힌 annular sector**다. 외곽 반지름 59, 내곽 반지름 45로 이전 r=52/stroke=14와 동일한 시각 크기다. 외곽은 시계방향, 내곽은 반시계방향 arc이며 양끝은 같은 각도의 직선으로 연결한다. path stroke는 none이므로 dash endpoint/cap 계산에 의존하지 않는다. 인접 segment는 외곽·내곽 양쪽 끝점을 정확히 공유하며 추가 overlap/epsilon/gap을 넣지 않았다.

현재 0/0/2/2의 실제 path:

```svg
M 60 1 A 59 59 0 0 1 60 119 L 60 105 A 45 45 0 0 0 60 15 Z
M 60 119 A 59 59 0 0 1 60 1 L 60 15 A 45 45 0 0 0 60 105 Z
```

100%는 경계 없는 circle primitive로 그린다. 0%는 shape를 만들지 않는다. 전체 0은 기존 neutral track만 남긴다. SVG intrinsic width/height와 CSS aspect-ratio=1, height=auto를 명시했다. CSS 색 토큰, 표시 크기, 중앙 숫자, legend 순서/문구/비율식, typography, analytics는 유지했다. 등록 결과 카드도 같은 renderer를 쓴다. 공유 인포그래픽은 별도 renderer이며 수정하지 않았다.

## 수정 파일

- `app/studio/(dashboard)/page.tsx`: actual Dashboard path rendering과 SVG intrinsic ratio.
- `app/studio/(dashboard)/page.module.css`: path fill/color 및 square sizing.
- `src/features/studio/lib/studio-dashboard-donut.ts`: 명시적 외곽/내곽 annular geometry.
- `scripts/verify-studio-dashboard-donut.ts`: 9개 분포, shared endpoints, 반지름, 방향, radial closing 검사.
- `scripts/verify-studio-dashboard-donut-browser.cjs`: actual localhost route + local DB fixture + 3개 브라우저 + DOM/SVG/legend 검사 및 screenshot.
- `scripts/verify-studio-dashboard-schedule-charts.ts`: main의 기존 verifier에서 구 centerline geometry 검사를 새 geometry verifier로 교체. 일정 검사는 그대로 보존.
- 이 문서.

## 검증 결과

9개 fixture: 50/50, 100/0, 0/100, 25/25/25/25, 50/25/25/0, 1/99, 33/33/34, 전체0, 0/0/2/2.

- Chromium / WebKit / Firefox에서 실제 Dashboard를 조회하고 모든 fixture screenshot을 확인했다.
- 0/0/2/2는 각 브라우저 1440/1024/768px 추가 검사. 총 33개 DOM/visual case PASS, pageerror 0.
- 실제 화면의 링 내부 234,600개 색상 sample PASS. 일반 antialias 경계 1px 부근을 제외하고 검사했으며, 50/50 상·하단 radial boundary는 별도 sample로 확인했다. PNG의 subpixel clipping padding을 반영했다. 픽셀 검사만으로 모든 환경의 렌더링을 보증하지 않는다.
- 각 화면에서 SVG 112×112, total/각 count/percent/legend ordering, zero omission, mask/clipPath 없음 확인. 등록 결과 도넛도 DOM 값/geometry 계약 검사.
- 768px의 기존 legend 줄바꿈은 그대로이며 donut는 원형이다. 요청 범위에 따라 layout/typography를 추가 변경하지 않았다.
- `npm run typecheck`, `npm run lint`, `npm run build`(47/47), `git diff --check` PASS.
- Dashboard Phase 1.1, Dashboard Final Polish, Studio UX Phase 1, conversion analytics, conversion report, 전용 donut geometry verifier PASS.
- main의 schedule/charts verifier는 **main의 기존 schedule selector를 임시 로더로 읽어** PASS. 원래 로컬의 선행 일정 작업 파일은 그대로 보존했으므로 이를 main과 동일하다고 주장하지 않는다. 이 검증은 donut 변경을 main에 놓았을 때 기존 일정 계약을 유지하는지 확인한 것이다.
- 기존 dirty 파일 해시 변경 0. analytics/DB/adapter 파일 변경 0. git index 비어 있음. commit/push/main 반영 없음.

## 시각 검수와 남은 확인

현재 localhost:3000은 로컬 DB 전용이고 실제 Dashboard에 완료0/노쇼0/취소2/진행2를 남겨 두었다. `donut-review` 브라우저 창은 로컬 TEST 계정으로 로그인되어 있다. 검수 프로세스 종료 후 일반 `npm run dev`는 기존 `.env.local`을 다시 사용하므로 동일 로컬 fixture 화면을 보려면 `/tmp/donut-rendering-v2/start.cjs`로 실행한다.

증거: `/Users/1to6/Desktop/첫수업 아카이브/2026-09-29-donut-v2/`의 screenshots, DOM JSON, 로그와 검증 결과. 인증정보는 증거 폴더에 복사하지 않았다.

**남은 항목: 사용자가 증상을 본 Production 탭의 실제 DOM/path 및 캐시 상태 확인.** 그 확인 전까지 정확한 Production 근본 원인 확정, 또는 해당 환경에서 수정이 검증되었다고 보고하지 않는다. 이 결과는 로컬 렌더러 변경안의 시각 검수 준비 완료를 뜻한다.

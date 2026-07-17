# Handoff: ZAMAK 자막 번역기 리디자인 (2개 시안)

## Overview

ZAMAK은 자막 파일(.srt/.vtt)을 업로드하면 약 2분 만에 AI 번역된 자막 파일을 내려주는 서비스입니다.
기존 팬덤용 사이트를 **B2B 납품까지 고려한 전문적·기술적이지만 가볍고 쉬운** 제품으로 리디자인했습니다.
이 패키지에는 **서로 다른 사용자 우선순위를 가진 2개 시안**이 들어 있습니다:

| | 시안 A — ZAMAK Pro | 시안 B — ZAMAK Simple |
|---|---|---|
| 우선 사용자 | 전문가 · B2B (반복/대량 작업) | 일반 사용자 (처음 온 사람) |
| 구조 | 워크스페이스형 (내비 + 좌우 분할 + 설정 레일) | 가이드 스텝형 (4스텝 위저드, 단일 컬럼) |
| 액센트 | 쿨 블루 | 웜 그린 |
| 파일 | `ZAMAK Pro.html` | `ZAMAK Simple.html` |

두 시안은 같은 브랜드(ZAMAK), 같은 4단계 플로우(업로드 → 정보/설정 → 진행 → 완료), 같은 타이포 체계를 공유합니다.

## About the Design Files

이 번들의 HTML 파일들은 **HTML로 제작된 디자인 레퍼런스(인터랙티브 프로토타입)** 입니다.
프로덕션 코드가 아니므로 그대로 복사해 쓰지 마세요. 과제는 이 디자인을 **타깃 코드베이스의 기존 환경**(React, Vue, Svelte, 기존 ZAMAK 코드 등)과 그 코드베이스의 패턴/라이브러리로 **재구현**하는 것입니다.
아직 프레임워크가 정해지지 않았다면 프로젝트에 가장 적합한 것을 선택해 구현하세요. (프로토타입 자체는 React 18 + Babel standalone으로 작성되어 있어 React 코드베이스라면 컴포넌트 구조를 거의 그대로 참고할 수 있습니다.)

각 HTML 하단의 떠 있는 **"DEMO" 내비게이션 바는 프로토타입 전용 장치**입니다(4개 상태를 강제 전환). 실제 제품에는 구현하지 마세요. 좌상단의 `←` backlink(`../index.html`로 가는 링크)도 시안 비교용이므로 제외합니다.

## Fidelity

**High-fidelity (hifi)** 입니다. 색·타이포·간격·라운딩·상태(hover/focus)·카피까지 최종 의도대로 만들어졌습니다.
코드베이스의 기존 컴포넌트 라이브러리를 사용하되, 시각 결과물은 이 프로토타입과 픽셀 수준으로 일치시키는 것을 목표로 하세요.
단, 데이터는 모두 목업입니다(파일명, 줄 수 1,243, 토큰 ~38K, 예상 시간, 스페인어 대사 쌍 등) — 실제 값으로 대체하세요.

---

## 공통 디자인 언어

### 타이포그래피
- **본문/UI**: `Pretendard` (CDN: jsdelivr `pretendard.min.css`), fallback `system-ui, sans-serif`
- **수치/파일명/타임코드/기술 readout**: `JetBrains Mono` (Google Fonts, 400–700)
- 모노 폰트는 "기술적 신뢰감"의 핵심 장치 — 파일명, %, 토큰 수, 타임코드, 언어코드(KO/EN)에 일관 적용
- 안티앨리어싱: `-webkit-font-smoothing: antialiased`

### 브랜드 마크
두 개의 마름모(45° 회전한 라운드 사각형)가 겹친 형태 — "합금(alloy)" 모티프:
- 앞: 액센트 컬러, 뒤: 잉크색 90% + `mix-blend-mode: multiply`, 대각선 offset(4–5px)
- 워드마크: "ZAMAK", weight 800, letter-spacing -0.02em

### 컬러 (oklch)
공통 잉크/표면 (A는 블루 기운 hue 255–258, B는 웜 hue 68–84):

| 토큰 | 시안 A (Pro) | 시안 B (Simple) |
|---|---|---|
| `--bg` | `oklch(0.984 0.003 255)` | `oklch(0.987 0.006 84)` |
| `--surface` | `#ffffff` | `#ffffff` |
| `--surface-2` | `oklch(0.975 0.004 255)` | `oklch(0.975 0.008 84)` |
| `--border` | `oklch(0.918 0.006 255)` | `oklch(0.925 0.008 80)` |
| `--border-strong` | `oklch(0.86 0.01 255)` | `oklch(0.87 0.012 78)` |
| `--ink` | `oklch(0.24 0.02 258)` | `oklch(0.26 0.013 68)` |
| `--ink-2` | `oklch(0.46 0.02 258)` | `oklch(0.49 0.013 68)` |
| `--ink-3` | `oklch(0.62 0.015 258)` | `oklch(0.64 0.011 70)` |
| `--accent` | `oklch(0.55 0.17 256)` 쿨 블루 | `oklch(0.57 0.115 162)` 웜 그린 |
| `--accent-press` | `oklch(0.48 0.17 256)` | `oklch(0.5 0.115 162)` |
| `--accent-soft` | `oklch(0.955 0.03 256)` | `oklch(0.955 0.035 162)` |
| `--accent-line` | `oklch(0.84 0.07 256)` | `oklch(0.86 0.06 162)` |
| `--good` (A만) | `oklch(0.62 0.13 158)` / soft `oklch(0.96 0.04 158)` | — (accent가 success 겸용) |
| `--warn` (A만) | `oklch(0.72 0.13 70)` | — |

### 라운딩 & 그림자
| | A (Pro) | B (Simple) |
|---|---|---|
| 카드 radius | 12px (`--radius`), 8px (sm) | 18px (`--radius`), 12px (sm) — 더 부드러운 인상 |
| 버튼 radius | 9–10px | 13–14px |
| 카드 그림자 | `0 1px 2px oklch(0.4 0.03 258/.05), 0 8px 24px oklch(0.4 0.03 258/.05)` | `0 1px 2px oklch(0.4 0.02 80/.04), 0 12px 32px oklch(0.45 0.03 80/.06)` |

### 버튼 (공통 패턴)
- `btn-primary`: 액센트 배경, 흰 텍스트, hover 시 `--accent-press`. B는 추가로 액센트색 그림자 `0 2px 8px accent/0.28`
- `btn-ghost`: 흰 배경 + `--border-strong` 테두리, hover 시 `--surface-2`
- 모든 버튼: `white-space: nowrap; flex-shrink: 0` (플렉스 컨테이너 안에서 찌그러짐 방지 — 중요), 내부 SVG는 고정 크기(A: 16px, B: 18px) + `flex: none`
- 크기 — A: 13.5px/10px 16px (lg: 14.5px/13px 18px), B: 15px/13px 22px (block: 16px/16px, 전폭)

### 인풋 (공통 패턴)
- 테두리 `--border-strong`(B는 1.5px), radius A: 8px / B: 12px
- focus: 테두리 `--accent` + ring `box-shadow: 0 0 0 3~4px var(--accent-soft)`, `outline: none`
- 레이블: 12–13px, weight 600, `--ink-2`, 아래 6–7px

### "AI 자동 감지" 배지 (공통 핵심 장치)
액센트색 점(5px 원) + 작은 텍스트(10.5–11.5px, weight 600, 액센트색). 메타데이터가 AI로 채워졌음을 표시.
- A: 레이블 옆 인라인 (`감지`, `AI 자동 감지됨`)
- B: 알약형 배지 `AI가 자동으로 찾았어요` (accent-soft 배경, radius 999px)

### 도착어 선택 (다국어 확장 대비)
지원 언어: 한국어 KO(기본), English EN, 日本語 JA, Español ES, Français FR, 中文 ZH.
언어 코드는 항상 JetBrains Mono로 병기.

---

## 시안 A — ZAMAK Pro (워크스페이스형)

### 정보 구조
- 고정 탑바(56px, sticky, `backdrop-filter: blur(8px)`, 반투명 흰 배경): 브랜드 + 내비(번역·용어집·기록·팀) + 우측(언어 pill `KO → KO`, PRO 플랜 배지, 아바타)
  - 내비 활성 탭: `--surface-2` 배경 라운드(7px), 13px/500
  - PRO 배지: 11px/700, accent-soft 배경 + accent-line 테두리, radius 6px
- 본문 캔버스: `max-width: 1080px`, 중앙 정렬, 상단 브레드크럼(12px, `--ink-3`, `워크스페이스 / 새 작업`)
- 메인 그리드: `grid-template-columns: 1fr 360px; gap: 20px` (콘텐츠 + 우측 레일)

### 화면 1 — 업로드
- 페이지 헤드: H1 22px/800 "새 번역 작업" + 서브 13.5px `--ink-2`
- **드롭존** (좌측 컬럼): 1.5px dashed `--border-strong`, radius 12px, padding 40px 28px, 중앙 정렬
  - 아이콘 타일 46px, radius 11px, accent-soft 배경 + accent-line 테두리, 업로드 SVG 22px 액센트색
  - "자막 파일을 끌어다 놓으세요" 16px/700 + "여러 파일을 한 번에 올려 배치로 처리할 수 있어요." 13px
  - `파일 선택` primary 버튼, 아래 포맷 칩(`.srt` `.vtt` `.ass` — 모노 11px, surface-2 칩) + "최대 5MB · UTF-8"
  - dragover 상태: 테두리 `--accent`, 배경 `--accent-soft`
- 드롭존 아래 카드: **도착어** select (커스텀 화살표, 8px radius)
- 우측 카드: **최근 작업** 리스트 — 상태 점(7px 원: 완료=good, 검수 대기=warn) + 모노 파일명(11.5px, ellipsis) + 상대시간(11px). hover 시 row에 surface-2 배경. → B2B의 "반복 작업" 멘탈모델 지원
- UX 의도: 업로드 전에도 도착어를 미리 보여줘 "무엇이 나올지" 예측 가능

### 화면 2 — 구성 (정보 + 설정 통합 워크스페이스)
- 상단 **파일바**: good-soft 배경 + good 테두리, radius 10px — 파일 아이콘 타일(30px) + 모노 파일명(12.5px, ellipsis) + "1,243줄 · SRT · 48KB" + `파일 변경` ghost 버튼
- 좌측 카드 — **작품 정보** (AI 자동 감지됨 배지): 2열 그리드(gap 14px)
  - 필드: 제목 / 개봉 연도 / 장르 / 제작 국가 (각각 "감지" 배지), 시대 배경, **추가 컨텍스트**(선택, textarea, placeholder: "등장인물 말투·호칭, 고유명사 표기, 배경 설정 등…")
- 우측 **설정 레일** (`position: sticky; top: 88px`, 섹션 사이 1px 구분선):
  1. **도착어** select
  2. **AI 모델** — 라디오 카드 3개 (Gemini 3.1 Flash Lite "빠름·경제적" / Gemini 3 Flash "속도·품질 균형" / Gemini 3.1 Pro "최고 품질·정밀"). 선택 시 accent 테두리 + accent-soft 배경. 우측에 품질 미터(5×14px 세로 바 4개, 채워진 만큼 accent)
  3. **번역 방식** — 세그먼트 컨트롤(전체 번역 | 청크 병렬), 아래 11.5px 설명문이 선택에 따라 변경:
     - 전체: "파일 전체를 한 컨텍스트로 번역 — 문맥 일관성이 가장 높습니다."
     - 청크: "구간을 나눠 병렬 처리 — 긴 파일에서 더 빠릅니다."
  4. **예상 readout** (모노 12px, surface-2 박스): `예상 소요 ~2분 10초 / 1,243줄 · ~38K 토큰 / 모델명` → **번역 시작** primary 전폭 버튼
- UX 의도: 기존 2단계(정보→설정)를 한 워크스페이스로 합쳐 클릭 수 감소, 설정 변경↔정보 수정 왕복 제거

### 화면 3 — 진행
- 중앙 760px. 좌측 큰 % 숫자(모노 40px/700) + 우측 상태 텍스트("번역 중…" + 모노 파일명)
- 진행 바: 8px, radius 6px, surface-2 트랙 + accent 필, `transition: width .3s`
- **4단계 스테이지 트래커**: 분석(20%) → 번역(85%) → 검수(97%) → 패키징(100%). 각: 11px 점(done=good 채움, active=accent 채움) + 연결선(done 구간 good) + 라벨 12px + 상태 모노 10.5px(완료/진행 중/대기)
- **실시간 번역 스트림 테이블**: 2열(원문 · ES | 번역 · KO), 헤더 10.5px uppercase, 행마다 모노 타임코드(10px) + 대사 12.5px, 최근 4행만 표시, 새 행 fade-in(`opacity 0→1, translateY 4px, .35s`)
- 하단 readout (모노 11.5px): `처리 N/1,243줄 · 속도 ~9.4 줄/s · 남은 시간 Ns`
- `백그라운드로 보내기` ghost 버튼 — 작업을 떠나도 됨을 암시 (B2B 멀티태스킹)
- 시뮬레이션: 140ms 틱, 초반 +2.2/중반 +3.1/후반 +1.4씩 증가, 100% 도달 650ms 후 완료 화면 자동 전환

### 화면 4 — 완료
- good 체크 원(38px) + "번역 완료" H1 + "SRT 타임코드를 그대로 유지하며 1,243줄을 번역했습니다."
- **다운로드 카드**: 파일 아이콘 타일(42px, accent-soft) + 모노 파일명(`…_KO.srt`) + 메타(SRT · 49KB · UTF-8 · 1,243줄) + `미리보기` ghost + `다운로드` primary
  - 다운로드는 Blob으로 실제 .srt 생성 (`원본명_KO.srt`)
- **통계 4그리드**: 1,243 번역된 줄 / 2분 04초 소요 시간 / 3.1 Flash 사용 모델 / 100% 타임코드 보존 (값: 모노 19px/700)
- **번역 미리보기** 카드: 진행 화면과 동일한 2열 스트림 4행 + 헤더 우측 `ES → KO` 모노
- 하단 액션: `새 작업` / `재번역` / `팀과 공유` ghost 버튼 행 (gap 10px)

---

## 시안 B — ZAMAK Simple (가이드 스텝형)

### 정보 구조
- 탑바 64px (테두리 없음, 배경과 동화): 브랜드 + 우측 언어 pill("한국어", radius 999px)
- 본문: 단일 컬럼 `max-width: 600px` 중앙 정렬
- **4스텝 프로그레스** (모든 화면 상단 고정 표시): 파일 → 정보 → 번역 → 완료
  - 점 30px 원: 대기=흰 배경+border-strong 테두리+회색 숫자 / 활성=accent 채움+흰 숫자+`box-shadow: 0 0 0 5px accent-soft` 글로우 / 완료=accent 채움+체크 아이콘
  - 점 사이 2px 연결선, 지나온 구간 accent
- 모든 화면: 중앙 정렬 헤드라인(27px/800, letter-spacing -0.03em) + 서브(15px, `--ink-2`) — **대화체 카피**가 이 시안의 핵심

### 화면 1 — 파일
- 헤드: "자막을 올려주세요" / "한 번의 업로드로 끝. 평균 2분이면 자연스러운 번역 자막을 받아요."
- 드롭존: 2px dashed, radius 18px, padding 48px, **전체가 클릭 가능**, hover에도 accent-soft 배경 (저관여 사용자를 위한 큰 히트 영역)
  - 아이콘 타일 64px/radius 18px, "파일을 여기에 끌어다 놓으세요" 19px/700, `파일 선택` primary lg
  - "SRT · VTT 형식 지원 · 최대 5MB" 12.5px
- **도착어 카드**: "어떤 언어로 바꿔드릴까요?" + 3×2 언어 버튼 그리드(언어명 14px + 모노 코드 11px, 선택 시 accent 테두리+soft 배경) — select보다 1탭, 한국어 기본 선택
- 하단 **안심 라인**: "⏱ 평균 2분 소요 · 타임코드 100% 보존 · 설치 없이 바로" (13.5px, 점 구분)

### 화면 2 — 정보
- 헤드: "이 작품이 맞나요?" / "AI가 파일을 분석했어요. 맞으면 그대로, 틀리면 고쳐주세요."
- **감지 카드**: 포스터 placeholder(62×88px, 사선 스트라이프 패턴, "POSTER" 라벨 — 실제 구현 시 TMDB 등 포스터 이미지) + 제목 18px/700 + "2024 · 드라마/스릴러 · 스페인" + `AI가 자동으로 찾았어요` 배지
- 수정 폼 카드: 제목/연도, 장르/국가 2열 + "참고할 내용이 있다면 · 선택" textarea (placeholder: "예: 주인공은 친구에게 반말, 의사에게는 존댓말을 써요.")
- **고급 설정 아코디언** (기본 접힘 — 이 시안의 핵심 장치): 헤더 "고급 설정 · AI 모델, 번역 방식" + 회전 셰브론. 펼치면:
  - 도착어 / AI 모델(Flash Lite | **Gemini 3 Flash [추천]** | Pro) / 번역 방식(**전체 번역 [추천]** | 빠른 분할) — 알약 버튼, `추천` 태그는 accent 배경 흰 글씨 10px
  - 추천값이 기본 선택 → 안 열어도 그대로 진행 가능 (스마트 기본값)
- 하단: `이전` ghost + `번역 시작 →` primary(flex:1)

### 화면 3 — 번역 (진행)
- **원형 프로그레스 링**: 172px SVG, 반지름 78, stroke 11px round-cap, surface-2 트랙 + accent, `-90°` 회전 시작, `stroke-dashoffset` 트랜지션 .3s. 중앙: % 42px/800 + "번역 중" 12px
- 상태 문구(17px/700)가 진행률 따라 변경: <25% "파일을 분석하고 있어요" / <92% "열심히 번역하고 있어요" / 이후 "마지막으로 다듬는 중이에요"
- 서브: "N / 1,243줄 · 약 N초 남음"
- **"방금 번역한 대사" 카드**: 원문(13.5px, ink-3) + 번역(15px/600) 1쌍씩 교체 — A의 스트림 테이블의 라이트 버전
- 안심 문구: "창을 닫아도 번역은 계속 진행돼요." (13px, 중앙)
- 시뮬레이션: 150ms 틱, 완료 후 650ms 뒤 자동 전환

### 화면 4 — 완료
- 축하 헤드: accent-soft 원 72px + 체크 34px, "번역이 완료됐어요!" / "1,243줄을 2분 만에 번역했어요. 타임코드는 그대로예요."
- 다운로드 카드(중앙 정렬): 모노 파일명 칩(surface-2, ellipsis) + **`번역 자막 다운로드` primary 전폭 버튼** (실제 Blob .srt 다운로드)
- 요약 3카드: 1,243 번역된 줄 / 2분 04초 걸린 시간 / 100% 타임코드 보존 (값 21px/800)
- 번역 미리보기: 원문(12.5px ink-3) 위 + 번역(14.5px/500) 아래로 쌓은 3행
- `새 파일 번역하기` ghost 전폭

---

## Interactions & Behavior

### 공통
- 화면 전환: 상태 기반 단일 페이지(라우팅 또는 state). 진행→완료는 자동 전환
- 진행 시뮬레이션은 프로토타입용 — 실제로는 서버 진행 이벤트(SSE/WebSocket/폴링)에 바인딩
- 드롭존: dragover/dragleave/drop 처리, dragover 시 시각 피드백
- 완료 다운로드: 번역된 SRT를 `{원본파일명}_{언어코드}.srt`로 저장
- 트랜지션 기본값: 0.12–0.2s ease (버튼/카드/인풋), 진행 바 0.3s

### A 전용
- 모델 라디오 카드 / 세그먼트 토글 즉시 반영, 설명문 동기 변경
- 최근 작업 행 클릭 → 해당 작업으로 이동(프로토타입에선 구성 화면으로)
- 스트림 새 행 fade-in 애니메이션

### B 전용
- 고급 설정 아코디언 펼침/접힘 (셰브론 180° 회전 .2s)
- 언어 그리드/알약 버튼 단일 선택 토글
- 스텝 점 활성 글로우(box-shadow ring)

## State Management

```
appState:
  screen: 'upload' | 'config' | 'progress' | 'done'   // B: step 0–3
  targetLang: 'KO' (기본) | 'EN' | 'JA' | 'ES' | 'FR' | 'ZH'
  file: { name, lines, format, sizeKB } | null
  metadata: { title, year, genre, country, era?, context? }  // AI 감지 + 사용자 수정
  model: 'lite' | 'flash' (기본) | 'pro'
  method: 'whole' (기본) | 'chunk'
  progress: { pct, processedLines, stage, recentPairs[] }
  result: { fileName, durationSec, modelUsed, timecodePreserved }
```

데이터 요구: 파일 업로드/파싱 API, 메타데이터 자동 감지 API(+ B는 포스터 이미지), 번역 작업 생성/진행 스트림/결과 다운로드 API.

## Design Tokens
위 "공통 디자인 언어"의 컬러/라운딩/그림자 표 참조. 간격 스케일은 4px 기반(8/10/12/14/16/18/20/22/24/28…), 카드 패딩 A: 16–20px, B: 22px.

## Assets
- 외부 이미지 에셋 없음. 아이콘은 전부 인라인 SVG(24×24 viewBox, stroke 2, round cap/join) — 업로드, 파일, 체크, 다운로드, 셰브론, 화살표, 스왑. 코드베이스의 아이콘 셋(예: Lucide — 동일 스타일)으로 대체 가능
- 브랜드 마크는 CSS로 그림 (위 "브랜드 마크" 참조)
- 폰트: Pretendard(jsdelivr CDN), JetBrains Mono(Google Fonts) — 셀프호스팅 권장
- B의 포스터는 placeholder — 실제 구현 시 메타데이터 API의 포스터 이미지 사용

## Files
- `ZAMAK Pro.html` — 시안 A 인터랙티브 프로토타입 (4화면, React 18 + Babel)
- `ZAMAK Simple.html` — 시안 B 인터랙티브 프로토타입 (4화면, React 18 + Babel)
- `Concept Gallery.html` — 두 시안 비교 갤러리 (참고용; 프리뷰 이미지 경로는 원본 프로젝트 기준이라 깨질 수 있음)
- `screenshots/preview-pro.png`, `screenshots/preview-simple.png` — 업로드 화면 레퍼런스 캡처

> 구현 순서 제안: 디자인 토큰(CSS 변수) → 공통 컴포넌트(버튼/인풋/카드/배지) → 화면별 조립 → 진행 스트림 실데이터 연결.

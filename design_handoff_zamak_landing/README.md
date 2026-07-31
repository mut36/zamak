# Handoff: ZAMAK 랜딩페이지 (신규 론칭)

## Overview
ZAMAK은 자막(자막 파일) AI 번역 서비스입니다. 사용자가 `.srt` / `.vtt` / `.ass` / `.smi` 자막 파일을 업로드하면, 한글 자막 표준 규칙과 CPS(초당 글자 수)에 맞춰 자연스러운 한국어 자막으로 번역해 최고 10초 안에 내려줍니다.

이 랜딩페이지는 **신규 론칭 마케팅 페이지**로, "왜 ZAMAK을 써야 하는가"를 5개 섹션에 걸쳐 설명하고 상단·중간·하단에서 세 번 `무료로 시작하기` CTA로 전환을 유도합니다. 인터랙티브 데모 2개(번역 엔진 비교, CPS 프로필 비교)가 핵심 설득 장치입니다.

## About the Design Files
이 번들에 들어 있는 HTML 파일은 **HTML로 만든 디자인 레퍼런스**입니다. 의도한 외형과 동작을 보여주는 프로토타입이며, 그대로 프로덕션에 복사해 쓸 코드가 아닙니다.

작업의 목표는 **이 HTML 디자인을 대상 코드베이스의 기존 환경에서 재현하는 것**입니다 (React / Next.js / Vue / Astro 등). 기존 프로젝트가 있다면 그 프로젝트의 확립된 패턴과 라이브러리(컴포넌트 규약, 스타일링 방식, 라우팅)를 따르고, 아직 환경이 없다면 프로젝트에 가장 적합한 프레임워크를 선택해 구현하세요.

**참고:** `.dc.html` 파일은 자체 런타임(`support.js`)에서 동작하는 포맷입니다. 마크업은 인라인 스타일 기반 HTML이고, 하단 `<script type="text/x-dc">` 블록의 `class Component`는 React 클래스 컴포넌트와 동일한 의미론(`state`, `setState`, `componentDidMount`)을 가집니다. `renderVals()`가 리턴하는 객체는 템플릿의 `{{ 이름 }}` 자리에 주입되는 값들입니다 — 즉 render 함수의 지역 변수로 읽으면 됩니다. `<sc-for list as>`는 `.map()`, `<x-dc>` 래퍼는 컴포넌트 루트로 옮기면 됩니다.

## Fidelity
**High-fidelity (hifi).** 색상, 타이포그래피, 간격, 인터랙션, 최종 카피가 모두 확정된 상태입니다. 아래 명세된 값 그대로 픽셀 단위로 재현하세요. 단, 카피 중 수치(CPS 값, 지원 언어 수 등)는 **디자인 예시값**이며 실제 서비스 실측치로 교체가 필요할 수 있습니다 — 아래 "확인 필요 항목" 참고.

## Design Language
Apple의 시스템 디자인(Human Interface 기반 랜딩 관용구 — `#f5f5f7` 캔버스, 반투명 sticky nav, 크고 타이트한 헤드라인, 큰 라운드 카드, 절제된 컬러)에 ZAMAK 브랜드 변주를 얹었습니다.

변주의 축 3개:
1. **잉크 블랙 + 옐로** — Apple의 블루 액센트 대신 `#161614` / `#FFD400`. 옐로는 자막의 노란 글자와 진행 표시에서 온 색으로, **면적을 아주 좁게** 씁니다 (강조 텍스트, 진행 바, 화살표, 타임코드).
2. **자막 박스 모티프 = 각진 모서리 (radius 1px)** — 로고 뱃지와 포맷 칩만 각지게 처리해 "자막 바" 느낌을 냅니다. 그 외 모든 카드·버튼은 라운드(12~24px). 이 대비가 의도된 규칙이므로 **각진 요소를 라운드로 통일하지 마세요.**
3. **모노스페이스 = 기계 영역** — JetBrains Mono는 타임코드, 파일 확장자, 언어 코드, 로고 워드마크에만. 산문에는 절대 쓰지 않습니다.

### 로고
워드마크 `ZAMAK.` — 마지막 마침표만 `#FFD400`. "문장을 완성한다"는 의미. nav에서는 잉크 블랙 배경의 각진(radius 1px) 뱃지 안에, 푸터에서는 배경 없이 회색 텍스트로 사용합니다.

---

## Design Tokens

### Colors
| 토큰 | 값 | 용도 |
|---|---|---|
| `canvas` | `#f5f5f7` | 페이지 기본 배경, CPS 섹션 배경 |
| `surface` | `#ffffff` | 비교 섹션·기능 섹션 배경, 카드 표면 |
| `ink` | `#161614` | 브랜드 다크 (nav 로고 뱃지, 다크 섹션 배경, 주요 버튼) |
| `ink-deep` | `#101012` | 자막 프리뷰 화면 (영상 화면을 상징, ink보다 더 어둡게) |
| `text-primary` | `#1d1d1f` | 본문·헤드라인 |
| `text-secondary` | `#6e6e73` | 서브 카피 |
| `text-tertiary` | `#86868b` | 라벨, 캡션 |
| `text-quaternary` | `#a1a1a6` | 각주, 취소선 텍스트 |
| `text-nav` | `#424245` | nav 링크 |
| `on-ink` | `#FAF9F5` | 다크 배경 위 텍스트 (순백 아님 — 따뜻한 오프화이트) |
| `accent` | `#FFD400` | 옐로 액센트 |
| `accent-tint` | `rgba(255,212,0,0.07)` | ZAMAK 선택 시 결과 카드 배경 |
| `accent-border` | `rgba(255,212,0,0.8)` | ZAMAK 선택 시 결과 카드 보더 |
| `hairline` | `rgba(0,0,0,0.06)` | nav 하단 보더 |
| `hairline-light` | `rgba(0,0,0,0.05)` | 섹션 구분선 |
| `hairline-footer` | `rgba(0,0,0,0.07)` | 푸터 상단 보더 |
| `hairline-dark` | `rgba(255,255,255,0.08~0.09)` | 다크 영역 구분선 |
| `hover-tint` | `rgba(0,0,0,0.05)` | nav/텍스트 버튼 호버 배경 |
| `segment-track` | `#f5f5f7` (흰 배경 위) / `#e9e9ec` (회색 배경 위) | 세그먼트 컨트롤 트랙 |

상태 태그 컬러:
| 상태 | 배경 | 텍스트 |
|---|---|---|
| 부정 (red) | `rgba(255,59,48,0.1)` | `#c0362c` |
| 주의 (orange) | `rgba(255,149,0,0.12)` | `#9a6200` |
| 긍정 (green) | `rgba(52,199,89,0.13)` | `#1d7a3a` |
| 중립 | `rgba(0,0,0,0.06)` | `#424245` |

### Typography
- **본문/헤드라인 스택:** `-apple-system, BlinkMacSystemFont, Pretendard, system-ui, sans-serif`
  - 한국어 렌더링 품질이 중요하므로, 프로덕션에서는 **Pretendard를 self-host 하거나 웹폰트로 로드**하는 것을 권장합니다 (현재 프로토타입은 macOS/iOS에서만 Apple SD Gothic Neo로 예쁘게 나옵니다). Windows/Android 대응을 위해 Pretendard Variable을 우선순위 최상단에 놓는 편이 안전합니다.
- **모노 스택:** `'JetBrains Mono', monospace` — Google Fonts, weight 400 / 600
- `-webkit-font-smoothing: antialiased`

| 역할 | 크기 | weight | letter-spacing | line-height |
|---|---|---|---|---|
| H1 (히어로) | `clamp(38px, 5.4vw, 58px)` | 700 | `-0.02em` | 1.1 |
| H2 (섹션, 일반) | `clamp(28px, 3.6vw, 40px)` | 700 | `-0.018em` | 1.15 |
| H2 (다크 섹션) | `clamp(30px, 3.8vw, 42px)` | 700 | `-0.018em` | 1.12 |
| H2 (최종 CTA) | `clamp(30px, 4vw, 44px)` | 700 | `-0.02em` | 1.12 |
| 히어로 서브 | `clamp(16px, 2vw, 19px)` | 400 | — | 1.55 |
| 섹션 서브 | 17px | 400 | — | 1.5~1.55 |
| 카드 타이틀 | 18~19px | 600 | `-0.012em` | — |
| 카드 본문 | 14~14.5px | 400 | — | 1.6 |
| 자막 대사 (비교 카드) | 19px | 400 | — | 1.5 |
| 자막 대사 (히어로 번역문) | 24px | 600 | `-0.012em` | 1.4 |
| 자막 대사 (CPS 프리뷰) | 17px | 400 | — | 1.45 |
| CPS 수치 | 44px | 700 | `-0.02em` | 1 |
| 세그먼트 버튼 | 13.5px | 500 | — | — |
| nav 링크 | 13px | 400 | — | — |
| 로고 뱃지 | 13px | 600 (mono) | `0.1em` | — |
| 태그 칩 | 12px | 500 | — | — |
| 라벨 | 12~13px | 600 | `0.04em` (대사 라벨) | — |
| 타임코드 | 10.5~13px | 400 (mono) | `0.03~0.08em` | — |
| 캡션/각주 | 12~12.5px | 400 | — | — |

### Spacing & Radius
- 섹션 수직 패딩: 히어로 `clamp(56px,9vh,88px)` top / 90px bottom · 비교 90px · 속도 100px · CPS 96px · 기능 96px · 최종 CTA `110px 24px 90px`
- 섹션 수평 패딩: 24px (nav/푸터는 `clamp(20px,5vw,48px)`)
- 콘텐츠 최대 폭: **880px** (모든 섹션 공통), 히어로 데모 카드 `min(780px, 100%)`
- nav 높이: 56px
- Radius: `1px` (로고 뱃지·포맷 칩 — 자막 박스 모티프) / `3px`는 사용하지 않음 / `9px` (세그먼트 버튼) / `10px` (nav 링크·nav 버튼) / `12px` (주요 버튼, 세그먼트 트랙, 규칙 행) / `16px` (CPS 프리뷰 화면) / `20px` (비교 카드) / `22px` (기능 카드) / `24px` (히어로 데모 카드, CPS 카드) / `999px` (태그 칩, 상태 닷)
- Grid gap: 18px (카드 그리드) / 28px (기능 카드 내부) / 36px (CPS 카드 내부) / 56px (속도 섹션 2단)

### Shadows
- 히어로 데모 카드: `0 2px 2px rgba(0,0,0,0.06), 0 24px 70px rgba(0,0,0,0.18)`
- CPS 카드: `0 1px 1px rgba(0,0,0,0.03), 0 10px 36px rgba(0,0,0,0.06)`
- 세그먼트 활성 버튼: `0 1px 4px rgba(0,0,0,0.12)`
- 자막 텍스트 (프리뷰 안): `text-shadow: 0 1px 3px rgba(0,0,0,0.6)`

### Motion
공통 이징: `cubic-bezier(0.32, 0.72, 0, 1)` (Apple 계열 감쇠 커브)

| 이름 | 정의 | 사용처 |
|---|---|---|
| `zsubin` | `opacity 0→1, translateY(10px)→0`, 0.35~0.45s | 자막이 화면에 뜨는 느낌 — 번역 결과 교체, CPS 카드 교체, 히어로 번역문 |
| `zrise` | `opacity 0→1, translateY(18px)→0`, 0.6s | 히어로 진입 |
| `zblink` | `0~49% opacity 1 / 50~100% opacity 0`, 1s step-end infinite | 번역 대기 중 커서 (`▋`) |
| 버튼 press | `transform: scale(0.97)`, 0.15s | 모든 CTA `:active` |
| 버튼 hover | `opacity: 0.85`, 0.2s | 채워진 버튼 |
| 링크 hover | `background: rgba(0,0,0,0.05)`, 0.2s | nav 링크, 텍스트 버튼 |
| 진행 바 | `width` transition 0.4s linear | 히어로 데모 하단 바 |
| 카드 상태 변화 | `all` 0.3s | 비교 결과 카드 배경/보더 |

**접근성 (필수 구현):**
- `@media (prefers-reduced-motion: reduce)` — 모든 애니메이션·트랜지션 `0.01ms`, iteration 1로 무력화. 히어로 자동 순환 타이머도 **시작하지 않음** (JS에서 `matchMedia`로 체크).
- `@media (prefers-reduced-transparency: reduce)` — nav의 `backdrop-filter` 제거, 배경을 불투명 `#f5f5f7`로.

---

## Screens / Views

단일 페이지, 위에서 아래로 8개 블록. 앵커 3개: `#compare`, `#speed`, `#cps`.

### 1. Sticky Nav
- **목적:** 브랜드 각인 + 상시 CTA 노출
- **레이아웃:** `position: sticky; top: 0; z-index: 40`, 높이 56px, `display:flex; align-items:center; justify-content:space-between`, 패딩 `0 clamp(20px,5vw,48px)`
- **재질:** `background: rgba(245,245,247,0.72)` + `backdrop-filter: blur(20px) saturate(180%)` (`-webkit-` 접두사 포함), 하단 `1px solid rgba(0,0,0,0.06)`
- **좌측:** 로고 뱃지 — 배경 `#161614`, 텍스트 `#FAF9F5`, JetBrains Mono 600 13px, `letter-spacing:0.1em`, 패딩 `6px 4px 6px 12px` (마침표 뒤 여백을 줄여 시각 균형), radius **1px**. 텍스트 `ZAMAK` + `<span style="color:#FFD400">.</span>`
- **우측:** `display:flex; gap:6px`
  - 링크 3개: `번역 비교`(→#compare) / `속도`(→#speed) / `자막 규칙`(→#cps). 13px, `#424245`, 패딩 `7px 13px`, radius 10px, hover 시 `rgba(0,0,0,0.05)` 배경
  - 구분선: `width:1px; height:16px; background:rgba(0,0,0,0.1); margin:0 6px`
  - CTA 버튼: `무료로 시작하기` — 배경 `#161614`, 흰 텍스트, 13px/500, 패딩 `8px 16px`, radius 10px

### 2. Hero
- **목적:** 핵심 가치 제안 + 실제 결과물 미리보기
- **레이아웃:** `flex column; align-items:center; text-align:center`, 패딩 `clamp(56px,9vh,88px) 24px 90px`, 진입 시 `zrise 0.6s`
- **H1:** `번역기 티가 안 나는` / `<br>` / `한국어 자막` (마침표 없음). margin-bottom 18px
- **서브:** `자막 파일을 올리면 한글 자막 표준 규칙에 맞춘 자연스러운 번역이 10초 안에 내려옵니다.` — max-width 520px, margin-bottom 34px
- **CTA 행:** `flex; gap:12px; wrap`
  - 주요: `무료로 시작하기` — `#161614` 배경, 16px/500, 패딩 `14px 30px`, radius 12px
  - 보조: `번역 품질 비교하기` — 텍스트 링크(→#compare), 16px, `#161614`, 패딩 `14px 22px`, radius 12px, hover 틴트
- **자막 데모 카드** (margin-top 64px, `min(780px,100%)`, radius 24px, `overflow:hidden`, 배경 `#101012`, 큰 그림자, `text-align:left`):
  - 헤더 바: 패딩 `14px 20px`, 하단 hairline. 좌측 타임코드 (mono 11px, `rgba(255,255,255,0.45)`, ls 0.06em) / 우측 `{언어} → KO` (mono 11px, `#FFD400`, ls 0.08em)
  - 본문: 패딩 `44px 40px 40px`, `flex column; gap:20px; min-height:150px`
    - 원문: 15px, `rgba(255,255,255,0.4)`, lh 1.5
    - 번역문: 24px/600, `#fff`, ls -0.012em, lh 1.4, `zsubin 0.45s`로 등장
  - 진행 바: 높이 3px, 트랙 `rgba(255,255,255,0.08)`, 채움 `#FFD400`, `width` transition 0.4s linear
- **각주:** `실제 번역 결과 예시. 타임코드는 원본 그대로 유지됩니다.` — 12.5px, `#a1a1a6`, margin-top 16px

**데모 동작:** 4개 대사를 3800ms 주기로 순환. 전환 시 번역문이 먼저 대기 상태(옐로 `▋` 블링킹 커서)로 바뀌고 500ms 후 번역문이 `zsubin`으로 등장. 진행 바는 `(index+1) × 25%`.

데모 데이터 (순서대로):
| lang | 타임코드 | 원문 | 번역 |
|---|---|---|---|
| EN | `00:41:07,220` | `"You're telling me she just walked out? In the middle of the ceremony?"` | `식 도중에 그냥 나가 버렸다고?` |
| JA | `00:12:44,050` | `「そんなつもりじゃなかったんだ。信じてくれ。」` | `그럴 생각은 없었어. 믿어 줘` |
| EN | `01:03:18,900` | `"Don't you dare walk away from me right now."` | `지금 나한테서 등 돌릴 생각 하지 마` |
| FR | `00:27:55,410` | `« On ne voit bien qu'avec le cœur. »` | `마음으로 봐야 제대로 보이는 법이야` |

### 3. 번역 비교 (`#compare`)
- **목적:** 경쟁 대안 대비 번역 품질 우위를 사용자가 직접 눌러 확인
- **배경:** `#fff`, 상단 `1px solid rgba(0,0,0,0.05)`, 패딩 `90px 24px`, 콘텐츠 max-width 880px
- **H2 (중앙):** `같은 대사, 다른 번역.`
- **서브 (중앙, max-width 480px):** `직접 비교해 보세요. 자막은 읽는 글이 아니라 듣는 말입니다.` margin-bottom 40px
- **세그먼트 컨트롤 (중앙, margin-bottom 28px):** 트랙 `background:#f5f5f7; padding:4px; radius:12px; flex; gap:4px`. 버튼 3개: `일반 번역기` / `범용 AI 모델` / `ZAMAK`. 13.5px/500, 패딩 `8px 18px`, radius 9px
  - 활성: 배경 `#fff`, 텍스트 `#1d1d1f`, shadow `0 1px 4px rgba(0,0,0,0.12)`
  - 비활성: 배경 transparent, 텍스트 `#6e6e73`, shadow none
  - **초기값: `ZAMAK` (index 2) 선택**
- **2단 그리드:** `repeat(auto-fit, minmax(300px,1fr))`, gap 18px, `align-items:stretch`
  - **좌: 원문 카드** — 배경 `#f5f5f7`, radius 20px, 패딩 `28px 28px 24px`, `flex column; gap:14px`
    - 라벨 `원문 대사` (12px/600, `#86868b`, ls 0.04em)
    - 대사 `"You're telling me she just walked out? In the middle of the ceremony?"` (19px, lh 1.5, `flex:1`)
    - 캡션 `00:41:07,220 → 00:41:09,850 · 2.6초 노출` (mono 11px, `#a1a1a6`)
  - **우: 결과 카드** — radius 20px, 보더 1.5px, 패딩 동일, `transition: all 0.3s`
    - ZAMAK 선택 시: 배경 `rgba(255,212,0,0.07)`, 보더 `rgba(255,212,0,0.8)`, 라벨 색 `#161614`
    - 그 외: 배경 `#fff`, 보더 `rgba(0,0,0,0.08)`, 라벨 색 `#86868b`
    - 라벨 `{엔진명}의 번역`
    - 번역문 19px, 엔진 변경 시 `key` 교체로 `zsubin 0.35s` 재생
    - 태그 칩들: `flex; wrap; gap:8px`. 12px/500, 패딩 `5px 11px`, radius 999px
- **마무리 카피 (중앙, max-width 560px, margin-top 28px):** `ZAMAK은 문장을 옮기지 않고 장면을 옮깁니다. 화면에 떠 있는 시간 안에 읽히도록, 말투와 관계까지 그대로.` — 14px, `#86868b`, lh 1.6

**엔진 데이터:**

| 엔진 | 번역 결과 | 태그 |
|---|---|---|
| 일반 번역기 | `"당신은 그녀가 그냥 걸어 나갔다고 나에게 말하고 있는 건가요? 의식 한가운데에서?"` | `CPS 17.3 초과` / `어색한 직역` / `말투 불일치` — 전부 red |
| 범용 AI 모델 | `"그녀가 식 중간에 그냥 나가버렸다고 말하는 거야?"` | `문장은 자연스러움` (중립) / `CPS 9.6 아슬아슬` (orange) / `자막 규칙 미적용` (orange) |
| ZAMAK | `"식 도중에 그냥 나가 버렸다고?"` | `CPS 6.2 충족` / `표준 규칙 적용` / `반문 뉘앙스 유지` — 전부 green |

### 4. 속도 (`#speed`)
- **목적:** 10초 다운로드를 타임라인으로 증명
- **배경:** `#161614`, 텍스트 `#FAF9F5`, 패딩 `100px 24px`
- **레이아웃:** max-width 880px, `grid repeat(auto-fit, minmax(320px,1fr))`, gap 56px, `align-items:center`
- **좌측:**
  - H2: `업로드에서 다운로드까지,` `<br>` `최고 속도 10초.` — 두 번째 줄만 `#FFD400`
  - 본문 (max-width 400px, `rgba(250,249,245,0.6)`, 16px, lh 1.6): `영상 파일은 필요 없습니다. 자막 파일 하나만 올리면 언어 인식부터 규칙 적용, 최종 파일 생성까지 한 번에 끝납니다.`
  - CTA: `무료로 시작하기` — 배경 `#FFD400`, 텍스트 `#161614`, 15px/600, 패딩 `12px 26px`, radius 12px (다크 섹션에서만 옐로 버튼 사용)
- **우측 타임라인:** 행 4개, 각 행 `flex; align-items:flex-start; gap:18px; padding:18px 0`, 하단 `1px solid rgba(255,255,255,0.09)`
  - 시간: mono 13px, `#FFD400`, `min-width:52px`, `padding-top:2px`
  - 타이틀: 16px/600, ls -0.01em
  - 설명: 13.5px, `rgba(250,249,245,0.5)`, margin-top 4px, lh 1.5

| 시간 | 타이틀 | 설명 |
|---|---|---|
| `0:00` | 자막 파일 업로드 | `.srt .vtt .ass .smi, 무엇이든. 조잡한 자동 자막도 괜찮습니다.` |
| `0:01` | 언어 · 작품 자동 인식 | `원본 언어를 감지하고 영상 종류에 맞는 번역 프로필을 고릅니다.` |
| `0:03` | 번역 + 규칙 적용 | `자연스러운 한국어로 옮기며 CPS와 표준 자막 규칙을 동시에 맞춥니다.` |
| `0:10` | 완성 파일 다운로드 | `타임코드와 스타일은 원본 그대로. 바로 영상에 얹으면 됩니다.` |

### 5. CPS 자동 조정 (`#cps`)
- **목적:** 가장 차별적인 기능 — 영상 종류별 읽기 속도 최적화를 실제 자막 렌더링으로 보여줌
- **배경:** `#f5f5f7`, 패딩 `96px 24px`, max-width 880px, **좌측 정렬**(다른 섹션과 리듬 대비)
- **H2:** `영상마다 읽는 속도가 다릅니다.`
- **서브 (max-width 560px, margin-bottom 36px):** `ZAMAK은 CPS(초당 글자 수)를 계산해 영상 종류에 맞는 자막 길이를 자동으로 맞춥니다. 화면에 뜬 시간 안에 다 읽히도록.`
- **세그먼트 컨트롤:** 트랙 `#e9e9ec` (회색 배경 위이므로), `width:fit-content`, `flex-wrap:wrap`, margin-bottom 24px. 버튼: `영화 · 드라마` / `예능 · 유튜브` / `다큐 · 강연`. 활성/비활성 스타일은 비교 섹션과 동일. **초기값: `영화 · 드라마` (index 0)**
- **카드:** 배경 `#fff`, radius 24px, 패딩 `36px 40px`, CPS 카드 그림자, `grid repeat(auto-fit, minmax(280px,1fr))`, gap 36px. 탭 변경 시 `key` 교체로 `zsubin 0.35s`
  - **좌: 스펙** (`flex column; gap:18px`)
    - 라벨 `권장 읽기 속도` (13px/600, `#86868b`, margin-bottom 6px)
    - 수치: 44px/700 + `CPS` 단위 (17px/500, `#86868b`, margin-left 8px)
    - 스펙 행 3개 (`flex; justify-content:space-between`, 13.5px, 라벨 `#6e6e73` / 값 600 `#1d1d1f`, gap 10px):
      `한 줄 최대` / `줄 수` = `최대 2줄` (고정) / `ZAMAK이 하는 일` (값은 `text-align:right; max-width:60%`)
  - **우: 자막 프리뷰** — 배경 `#101012`, radius 16px, `flex column; justify-content:flex-end`, 패딩 28px, `min-height:200px`
    - 자막 줄들: 중앙 정렬, `flex column; gap:4px`, 17px `#fff`, lh 1.45, text-shadow
    - 하단 메타 (margin-top 20px, `justify-content:space-between`, mono 10.5px, `rgba(255,255,255,0.35)`): 타임코드 / 측정 CPS(`#FFD400`)

**CPS 프로필 데이터:**

| 탭 | CPS | 한 줄 최대 | ZAMAK이 하는 일 | 프리뷰 자막 | 타임코드 | 측정값 |
|---|---|---|---|---|---|---|
| 영화 · 드라마 | 12 | 18자 | 긴 대사는 두 줄로 분할, 조사 단위로 줄바꿈 | `식 도중에 그냥` / `나가 버렸다고?` | `00:41:07 → 00:41:09` | `CPS 6.2 ✓` |
| 예능 · 유튜브 | 14 | 20자 | 빠른 티키타카에 맞춰 짧고 리듬감 있게 압축 | `아니 진짜 중간에 나갔다고?` | `00:03:12 → 00:03:13` | `CPS 13.0 ✓` |
| 다큐 · 강연 | 10 | 16자 | 정보 밀도가 높은 문장은 노출 시간에 맞춰 요약 | `그녀는 예식 도중` / `자리를 떠났습니다` | `00:18:40 → 00:18:44` | `CPS 4.3 ✓` |

### 6. 기능 벤토 (표준 규칙 / 포맷 / 언어)
- **목적:** 나머지 핵심 기능 3개를 한 화면에
- **배경:** `#fff`, 상단 hairline, 패딩 `96px 24px`, max-width 880px
- **H2 (중앙, max-width 560px, margin-bottom 44px):** `전문 자막가의 규칙을` `<br>` `그대로 배웠습니다.`
- **레이아웃:** 바깥 `flex column; gap:18px` → (1) 전체 폭 카드 1개, (2) `grid repeat(auto-fit, minmax(260px,1fr)); gap:18px` 안에 카드 2개
  - **전체 폭 카드 — 한글 자막 표준 규칙 적용**: 배경 `#f5f5f7`, radius 22px, 패딩 `32px 36px`, `grid repeat(auto-fit,minmax(260px,1fr)); gap:28px; align-items:center`
    - 좌: 타이틀 19px/600 + 본문 `방송·OTT에서 쓰는 표기 규칙을 그대로 따릅니다. 문장부호, 숫자 표기, 말줄임, 두 줄 분할까지 감수 없이 바로 쓸 수 있는 상태로.` (14.5px, `#6e6e73`, lh 1.6)
    - 우: before→after 행 3개. 각 행 배경 `#fff`, radius 12px, 패딩 `11px 16px`, 13.5px, `flex; align-items:center; gap:12px`
      - before: `#a1a1a6` + `text-decoration:line-through`, `flex:1`
      - 화살표 `→`: `#FFD400`, 700
      - after: `#1d1d1f`, 500, `flex:1`, `text-align:right`

      | before | after |
      |---|---|
      | `3천만 달러라구요?!` | `3,000만 달러라고요?` |
      | `오 마이 갓...!!` | `세상에…` |
      | `한 줄에 스물여덟 글자가 넘어가는 긴 자막` | `두 줄로 자연스럽게 분할` |
  - **카드 A — 모든 자막 포맷 지원**: 배경 `#161614`, 텍스트 `#FAF9F5`, radius 22px, 패딩 `30px 32px`, `flex column; gap:14px`
    - 타이틀 18px/600 / 본문 14px `rgba(250,249,245,0.55)` lh 1.6 `flex:1`: `스타일과 타임코드는 손대지 않고 대사만 바꿉니다. 올린 포맷 그대로 내려받으세요.`
    - 포맷 칩 4개 (`.srt` `.vtt` `.ass` `.smi`): mono 12.5px, 배경 `rgba(255,255,255,0.1)`, 패딩 `6px 12px`, **radius 1px**
  - **카드 B — 모든 언어 → 한국어**: 배경 `#FFD400`, 텍스트 `#161614`, radius 22px, 패딩 동일
    - 본문 14px `rgba(22,22,20,0.65)`: `원본 언어는 자동으로 인식합니다. 영어, 일본어, 중국어부터 스페인어, 프랑스어까지, 어떤 언어든 한국어로.`
    - 하단: mono 12.5px `rgba(22,22,20,0.6)` ls 0.03em — `EN JA ZH ES FR DE + 90개 언어`

### 7. 최종 CTA
- 패딩 `110px 24px 90px`, 중앙 정렬, 배경 없음 (페이지 canvas)
- H2: `자막 하나 올려 보면` `<br>` `바로 알게 됩니다.`
- 서브: `가입 후 첫 파일은 무료입니다. 신용카드도 필요 없어요.` (17px, `#6e6e73`, margin-bottom 32px)
- CTA: `무료로 시작하기` — `#161614`, 16px/500, 패딩 `14px 32px`, radius 12px
- 상태 표시 (margin-top 52px, 12px `#a1a1a6`, `flex; gap:6px; center`): 5px 옐로 원형 닷 + `비공개 베타 운영 중`

### 8. Footer
- 상단 `1px solid rgba(0,0,0,0.07)`, 패딩 `28px clamp(20px,5vw,48px)`, `flex; space-between; wrap; gap:12px`
- 좌: 로고 워드마크 `ZAMAK.` — mono 12px/600, ls 0.1em, `#86868b`, 마침표 `#FFD400` (배경 없음)
- 우: `© 2026 ZAMAK. 자연스러운 한국어 자막.` (12px, `#a1a1a6`)

---

## Interactions & Behavior

### 네비게이션
- nav 링크 3개는 페이지 내 앵커 스크롤. **`scrollIntoView` 대신 `window.scrollTo({behavior:'smooth'})` 또는 CSS `scroll-behavior: smooth` + `scroll-margin-top: 56px`**(sticky nav 높이만큼)을 섹션에 적용해 헤더에 가리지 않게 하세요.
- CTA 버튼 4개(nav / 히어로 / 속도 섹션 / 최종)는 현재 프로토타입에서 동작이 없습니다. 실제로는 모두 **동일한 가입/업로드 진입점**으로 연결하고, 유입 위치 구분을 위해 각기 다른 analytics 이벤트 파라미터를 붙이세요 (예: `cta_location: nav | hero | speed | footer`).

### 히어로 데모 자동 순환
```
mount:
  if (prefers-reduced-motion) return          // 첫 대사만 정적으로 표시
  setInterval(3800ms):
    index = (index + 1) % 4
    phase = 'waiting'                          // 옐로 블링킹 커서 ▋
    setTimeout(500ms) → phase = 'translated'   // zsubin 등장
unmount: clearInterval
```
- 진행 바 width = `(index + 1) * 25%`
- 번역문 요소에는 index를 포함한 `key`를 주어 매번 애니메이션이 재생되게 합니다.
- 탭이 백그라운드일 때 타이머를 멈추려면 `visibilitychange`를 추가하는 것을 권장합니다 (프로토타입에는 없음).

### 세그먼트 컨트롤 (2곳)
- 클릭 시 즉시 상태 변경, 결과 영역은 `key` 교체로 `zsubin 0.35s` 재생.
- **접근성 필수 보완:** 프로토타입은 `<span onClick>`으로 되어 있으나, 프로덕션에서는 `role="tablist"` / `role="tab"` + `aria-selected` 를 가진 실제 `<button>`으로 구현하고 좌우 화살표 키보드 이동을 지원하세요. 결과 영역은 `role="tabpanel"` + `aria-live="polite"`.
- 마찬가지로 모든 CTA는 `<span>`이 아닌 `<button>` 또는 `<a>`로 구현해야 합니다.

### 호버/액티브 상태
| 요소 | hover | active |
|---|---|---|
| 채워진 버튼 (ink / yellow) | `opacity: 0.85` | `transform: scale(0.97)` |
| nav 링크 / 텍스트 버튼 | `background: rgba(0,0,0,0.05)` | — |
| 세그먼트 비활성 버튼 | (프로토타입엔 없음 — 미묘한 텍스트 컬러 변화 추가 권장) | — |
| 일반 `<a>` | `opacity: 0.7` | — |

### 반응형
브레이크포인트 없이 `clamp()` + `auto-fit` 그리드로 처리합니다. 실제 동작:
- 타이포는 전부 `clamp()`로 뷰포트에 따라 스케일
- 비교 섹션 2단 → 300px 미만일 때 1단 (원문 위, 결과 아래)
- 속도 섹션 2단 → 320px 미만일 때 1단 (카피 위, 타임라인 아래)
- CPS 카드 2단 → 280px 미만일 때 1단 (스펙 위, 프리뷰 아래)
- 기능 벤토 → 260px 미만일 때 1단으로 쌓임

**모바일 보완 필요:** nav의 링크 3개 + CTA가 좁은 화면에서 빠듯합니다. 구현 시 640px 이하에서 nav 링크를 숨기고 로고 + CTA만 남기거나 햄버거 메뉴로 처리하세요 (디자인 미정 — 필요하면 요청).

### 없는 상태들
이 페이지는 정적 마케팅 페이지로, 로딩·에러·폼 검증 상태가 없습니다. 두 데모는 하드코딩된 데이터로만 동작합니다. 실제 업로드 플로우(파일 선택, 진행률, 실패 처리)는 이 랜딩의 범위 밖이며 별도 화면입니다.

## State Management
로컬 UI 상태 3개면 충분합니다. 서버 데이터·전역 상태·데이터 페칭 없음.

| 상태 | 타입 | 초기값 | 변경 트리거 |
|---|---|---|---|
| `heroIndex` | `0..3` | `0` | 3800ms 인터벌 |
| `heroPhase` | `'waiting' \| 'translated'` | `'translated'` | 인덱스 변경 시 waiting → 500ms 후 translated |
| `engine` | `0..2` | `2` (ZAMAK) | 비교 섹션 세그먼트 클릭 |
| `cpsProfile` | `0..2` | `0` (영화·드라마) | CPS 섹션 세그먼트 클릭 |

위 표의 콘텐츠 데이터(히어로 4쌍, 엔진 3개, CPS 프로필 3개, 속도 4단계, 규칙 3행)는 **컴포넌트 밖 상수 배열 또는 CMS**로 분리하세요. 마케팅 카피는 자주 바뀝니다.

## Assets
외부 이미지·아이콘·일러스트 **없음**. 모든 시각 요소는 CSS와 텍스트로 구성되어 있습니다.

- **폰트:** JetBrains Mono (Google Fonts, 400/600) — 프로덕션에서는 self-host + `font-display: swap` 권장. 본문은 시스템 폰트 스택이지만 한국어 품질을 위해 **Pretendard 로드 권장**.
- **로고:** 폰트 기반 워드마크. SVG 로고 파일이 필요하면 요청하세요.
- **파비콘/OG 이미지:** 아직 없습니다. 로고 뱃지(잉크 블랙 각진 사각형 + 옐로 닷)를 그대로 쓰면 됩니다.

## 확인 필요 항목 (디자인 예시값 → 실측 교체)
개발 착수 전 서비스 팀에 확인하세요:
1. **CPS 기준값** — 영화 12 / 예능 14 / 다큐 10, 한 줄 최대 18·20·16자. 실제 엔진 기준과 일치하는지.
2. **지원 언어 수** — `+ 90개 언어`.
3. **속도 타임라인** — 0:00 / 0:01 / 0:03 / 0:10 단계 구분과 "최고 속도 10초".
4. **비교 섹션 경쟁사 표현** — `일반 번역기` / `범용 AI 모델`로 익명화했습니다. 특정 제품명을 노출하려면 비교광고 관련 법무 검토가 필요합니다. 태그의 수치(CPS 17.3 / 9.6 / 6.2)도 실측 기반이어야 합니다.
5. **`비공개 베타 운영 중`** 문구 — 론칭 시점에 맞춰 제거하거나 교체.
6. **`가입 후 첫 파일은 무료입니다`** — 실제 프리 티어 정책과 일치 확인.

## Files
| 파일 | 설명 |
|---|---|
| `ZAMAK 랜딩페이지.dc.html` | 랜딩페이지 디자인 레퍼런스 (전체). 브라우저에서 바로 열어 인터랙션 확인 가능 |
| `support.js` | 위 파일이 렌더되기 위한 런타임. **프로덕션 코드가 아니며 이식 대상도 아닙니다** — 프로토타입을 로컬에서 열어보기 위해서만 필요합니다 |
| `README.md` | 이 문서 |

프로토타입을 열려면 두 파일을 같은 폴더에 두고 `ZAMAK 랜딩페이지.dc.html`을 브라우저에서 열면 됩니다.

# Handoff: ZAMAK 자막 번역 프로토타입 (브랜드 시안)

## Overview
ZAMAK은 자막 파일(.srt/.vtt/.ass/.smi) 하나를 업로드하면 타임코드를 보존한 채 자연스러운 한국어 자막으로 번역해 주는 웹 서비스입니다. 이 핸드오프는 랜딩 → 업로드 → 작품 인식/설정 → 번역 진행 → 완료/다운로드 → 마이페이지 → 크레딧 소진까지의 전체 베타 플로우를 다룹니다.

## About the Design Files
이 번들의 `ZAMAK 프로토타입 (브랜드).html`은 **HTML로 제작된 디자인 레퍼런스(인터랙티브 프로토타입)**입니다. 프로덕션 코드로 그대로 복사하는 용도가 아닙니다. 목표는 이 디자인을 **대상 코드베이스의 기존 환경**(React/Next.js, Vue 등)과 그 코드베이스의 패턴·라이브러리로 재구현하는 것입니다. 아직 환경이 없다면 프로젝트에 가장 적합한 프레임워크를 선택해 구현하세요.

참고: 파일은 커스텀 템플릿 런타임(`<x-dc>`, `{{ }}` 홀, `sc-if`/`sc-for`)을 사용합니다. 마크업의 인라인 스타일과 아래 문서를 기준으로 삼고, 템플릿 문법 자체는 무시해도 됩니다. 파일 하단 `<script data-dc-script>`의 `Component` 클래스에 전체 상태/전환 로직이 있습니다.

## Fidelity
**High-fidelity.** 색상·타이포·간격·radius·인터랙션 모두 최종 의도값입니다. 픽셀 단위로 재현하되, 구현은 코드베이스의 컴포넌트 패턴을 따르세요.

## 브랜드 원칙 (이 시안의 핵심)
- 로고 모티프 = **사각형 + 옐로 포인트**. 검은 사각 칩 로고(`ZAMAK` + 노란 점)를 기준으로 함.
- 버튼/칩은 **10px 라운드 사각형** (필/pill 아님). 카드류는 14–24px 유지.
- 라디오/체크는 원이 아니라 **작은 라운드 사각형(5–6px)**, 선택 시 옐로(#FFD400) 채움 + 다크(#161614) 체크.
- 원형 유지 예외: iOS형 토글(51×31), 아바타(28px 원), 프로그레스 바 트랙/필, 장식용 노란 점들.
- 액션 컬러는 블랙(#161614), 포인트는 옐로(#FFD400). 파란색 사용 금지.

## Screens / Views

공통 레이아웃: 페이지 배경 `#f5f5f7`, 콘텐츠는 중앙 정렬 단일 컬럼(화면별 max-width 520–760px), 좌우 패딩 40px, 상단 패딩 64px. 화면 진입 애니메이션 `zslide`: opacity 0→1 + translateY(16px)→0, 0.5s `cubic-bezier(0.32,0.72,0,1)`.

### 1. 랜딩 (landing)
- 중앙 정렬 히어로. 로고 칩: 배경 `#161614`, 텍스트 `#FAF9F5`, JetBrains Mono 600 42px, letter-spacing 0.07em, padding 16px 28px, radius 1px(트윅 가능 0–16px). "ZAMAK" 타이핑 애니메이션(글자당 150ms) 후 노란 점(7px 원, #FFD400)이 1.06s step-end로 깜빡임.
- 헤드라인: 48px/700/-0.015em, line-height 1.12 — "자연스러운 한국어 자막.\n파일 하나면 됩니다."
- 서브: 19px `#6e6e73` — "대사는 자연스럽게, 타임코드는 그대로."
- CTA "Google로 계속하기": 배경 `#161614`, 흰 텍스트 16px/500, padding 13px 30px, radius 10px, hover `#2e2e2b`, active scale(0.97). 내부 G 아이콘: 18px 흰 원, 텍스트 `#161614`.
- 보조 링크 "베타 초대 코드로 입장": 14px `#161614`, hover 배경 `rgba(0,0,0,0.05)`.
- 하단 "비공개 베타" 12px `#a1a1a6` + 5px 노란 점.

### 2. 상단 내비 (랜딩 제외 모든 화면)
- sticky, 높이 52px, 배경 `rgba(245,245,247,0.72)` + `backdrop-filter: blur(20px) saturate(180%)`, 하단 헤어라인 `rgba(0,0,0,0.05)`.
- 좌: 로고 칩(13px, padding 4px 9px + 3px 노란 점). 클릭 → 업로드로.
- 우: "내 번역" 텍스트(13px `#424245`), 크레딧 칩 "라이트 N · 프로 N"(12px, 배경 `rgba(0,0,0,0.05)`, radius 10px), 아바타 28px 원(그라디언트 `#c8c8cd→#a9a9af`).

### 3. 업로드 (upload)
- 스텝 브레드크럼(모든 스텝 화면 공통): JetBrains Mono 11px, letter-spacing 0.06em. 현재 스텝은 검은 칩(`#161614` 배경, 흰 텍스트, padding 4px 10px, radius 1px), 완료 스텝은 `✓`(#34c759) + 회색 텍스트, 미래 스텝 `#a1a1a6`, 구분선 18×1px `rgba(0,0,0,0.14)`.
- H1 40px/700/-0.015em "파일 업로드", 서브 17px `#6e6e73`.
- 콘텐츠 유형 2컬럼 카드(gap 14px): 흰 배경, radius 18px, border 1.5px — 기본 `rgba(0,0,0,0.1)`, 선택 시 `#161614` + 그림자 `0 8px 24px rgba(0,0,0,0.06)`. 좌측 20px 라운드사각(5px) 체크: 선택 시 #FFD400 채움 + #161614 ✓.
- 드롭존: 흰 카드 radius 24px, padding 64px 40px, 그림자 `0 1px 1px rgba(0,0,0,0.03), 0 8px 30px rgba(0,0,0,0.05)`. 유형 미선택 시 opacity 0.5 + 버튼 자리 "먼저 콘텐츠 유형을 선택하세요"(회색). 선택 후 "파일 선택" 버튼(#161614/흰색, radius 10px). 업로드 중: 아이콘 breathe(opacity 1↔0.45, 1.2s) + 파일명(JetBrains Mono 14px) "읽는 중…", 1.4s 후 다음 화면.

### 4. 작품 인식 (recognize)
- 파일명/원본 언어 칩(흰 배경, 헤어라인 border, radius 10px).
- H1 "어떤 작품인가요?".
- 후보 카드 3개 세로 스택(gap 12px): radius 18px, 포스터 플레이스홀더 56×80(줄무늬 `repeating-linear-gradient(45deg,#e8e8ed,#e8e8ed 6px,#f2f2f5 6px,#f2f2f5 12px)` + "poster" 모노 9px), 제목 16px/600 + 영문 14px `#86868b`, 연도·감독 13px, 시대 설명 12.5px. 선택: border `#161614`, 배경 `rgba(255,212,0,0.08)`, 우측 22px 라운드사각(6px) 옐로 체크. 진입 시 카드별 60ms 스태거.
- "찾는 작품이 없어요" 토글 → 검색 카드(인풋 radius 12px).
- 하단 고정 바: `rgba(245,245,247,0.72)` + blur, 버튼 "이 작품으로 계속" — 선택 전 `#c7c7cc`(disabled), 선택 후 `#161614`.

### 5. 번역 설정 (settings)
- 섹션 라벨: 12px/600 `#6e6e73`, letter-spacing 0.05em ("작품 정보", "번역 품질", "세부 조정 (선택)").
- 자동 인식 확인 카드(영화 플로우 진입 시): border 1.5px `#FFD400`, 그림자 `0 8px 28px rgba(255,212,0,0.25)`, 노란 6px 점 breathe + "확인 필요"(모노 10px), "맞아요"(#161614 버튼)/"아니에요"(`rgba(0,0,0,0.05)` 버튼). 확인 후 일반 카드로 교체 + "작품 변경" 버튼.
- 작품/번역 맥락 textarea: radius 12px, 배경 `#fbfbfd`, border `rgba(0,0,0,0.12)`, focus 시 border `#161614` + ring `0 0 0 3.5px rgba(255,212,0,0.45)`.
- 품질 2컬럼 카드(라이트/프로): 선택 시 border `#161614` + 배경 `rgba(255,212,0,0.08)`, 18px 라운드사각(5px) 옐로 체크. 잔여 횟수 12px — 있으면 `#34c759`, 0이면 `#ff3b30`.
- 용어집·말투 토글 행: "고급" 배지(11.5px `#161614`, 배경 `rgba(255,212,0,0.55)`, radius 10px). 토글: 51×31 원형 트랙, off `rgba(0,0,0,0.12)` / on `#161614`, 27px 흰 노브, left 2px↔22px, 0.3s `cubic-bezier(0.175,0.885,0.32,1.1)`. 켜면 용어집/존대·반말 textarea 2개 슬라이드 인.
- 하단 고정 바: "예상 소요 약 N초"(라이트 10s, 프로 40s, +고급 20s) + "번역 시작" 버튼.

### 6. 번역 진행 (progress)
- 중앙 520px. 현재 단계명 H1 28px + "NN% · 약 N초 남음"(모노 12px).
- 프로그레스 바: 높이 6px, 트랙 `rgba(0,0,0,0.06)`, 필 `#161614`, 둘 다 pill 유지, width transition 0.15s linear.
- 단계 리스트 카드 4행: 완료 `#34c759` 사각 체크, 진행 중 `#161614` + breathe, 대기 opacity 0.4. 단계 경계: 22% / 42% / 86%.

### 7. 완료 (done)
- 56px `#34c759` 라운드사각(10px) ✓ — 진입 시 `zpop`(scale 1.04 + blur 10px → 정상, 0.4–0.5s).
- H1 40px "번역이 끝났어요", 메타 17px.
- 다운로드 버튼: `#161614`, padding 14px 48px, radius 10px. 클릭 시 `.ko.srt` 파일 다운로드.
- "이 번역에 실제로 적용된 것" 카드: 18px 그린 사각 체크 + 14px 본문, 수치는 600 웨이트 `#1d1d1f`. 고급 사용 시 2개 항목 추가 노출.
- 피드백 카드: 별 5개(24px, 선택 `#f5a623` / 미선택 `#d2d2d7`, hover scale 1.15), 인풋 + "보내기"(`rgba(0,0,0,0.05)` 버튼). 전송 후 그린 감사 문구로 교체.

### 8. 내 번역 (mypage)
- 크레딧 카드 2개: 라벨 13px `#86868b`, 숫자 34px/600.
- 기록 리스트 카드: 행 hover `#fbfbfd`, 파일명 JetBrains Mono 13px, 메타 12.5px, "다시 받기" 버튼(`rgba(0,0,0,0.05)`).

### 9. 크레딧 소진 (exhausted)
- 56px `rgba(0,0,0,0.05)` 라운드사각에 모노 "0".
- 대기자 등록(이메일 인풋 + `#161614` "등록" 버튼) → 등록 후 그린 확인 문구. 구분선 아래 초대 링크 행("초대 링크 받기" → 클릭 시 "초대 링크 복사됨").

### 10. 저작권 모달 (첫 로그인 시)
- 스크림 `rgba(0,0,0,0.4)` fade 0.3s. 시트: 460px, `rgba(255,255,255,0.92)` + blur(30px), radius 22px, `zpop` 진입.
- 동의 체크 행: 22px 라운드사각(6px), 체크 시 옐로 채움 + 다크 ✓. 체크 전 버튼 `#c7c7cc` disabled, 체크 후 `#161614`.

## Interactions & Behavior
- **모든 press**: `active` 시 scale 0.96–0.985, `transition: transform 0.15s ease-out` (즉각 피드백, pointer-down 기준).
- **hover**: 배경 미묘한 변화 또는 그림자 상승만. 과한 모션 없음.
- 화면 전환: zslide 0.5s `cubic-bezier(0.32,0.72,0,1)`.
- 모달/성공 아이콘: zpop(scale+blur 머티리얼라이즈).
- `prefers-reduced-motion: reduce` → 모든 애니메이션/트랜지션 사실상 제거. `prefers-reduced-transparency: reduce` → 블러 표면을 불투명 `#f5f5f7`로.
- 플로우: 랜딩 로그인 → (미동의 시) 저작권 모달 → 업로드. 영화 플로우: 업로드 → 설정(자동 인식 확인 카드). 확인 "아니에요" → 작품 선택 화면. 일반 영상 플로우: 업로드 → 설정(유형 칩 + 톤 textarea). 번역 시작 시 해당 크레딧 차감, 0이면 소진 화면으로.
- 우하단 "화면" 점프 피커는 프로토타입 전용 — **프로덕션에서 제외**.

## State Management
- `screen`: landing | upload | recognize | settings | progress | done | mypage | exhausted
- `copyrightAgreed`, `showCopyright`, `agreeChecked`
- `contentKind`('film'|'general'), `contentType`, `pickedIdx`, `autoMatched`, `workConfirmed`, `workContext`, `customToneText`
- `model`('lite'|'pro'), `creditsLite`, `creditsPro`, `styleOn`, `glossaryText`, `honorificText`
- `pct`(진행률, 데모는 90ms 간격 랜덤 증가), `lastRun{model, style}`
- `rating`, `feedbackSent`, `waitlisted`, `inviteRequested`, `history[]`
- 실서비스 필요 API: 파일 업로드/언어 감지, 작품 검색·자동 매칭, 번역 잡 생성 + 진행률 폴링(또는 SSE), 결과 다운로드, 크레딧 조회/차감, 피드백·대기자 등록.

## Design Tokens
색상
- 브랜드 블랙(주 액션/선택 border): `#161614` (hover `#2e2e2b`)
- 브랜드 옐로(선택 채움/포인트/포커스 링): `#FFD400` (틴트 `rgba(255,212,0,0.08)` 배경, `0.45` 링, `0.55` 배지)
- 텍스트: 본문 `#1d1d1f`, 보조 `#424245` `#6e6e73`, 3차 `#86868b`, 비활성 `#a1a1a6`, disabled 버튼 `#c7c7cc`
- 배경: 페이지 `#f5f5f7`, 카드 `#fff`, 인풋 `#fbfbfd`, 로고 텍스트 `#FAF9F5`
- 시맨틱: 성공 `#34c759`, 경고/소진 `#ff3b30`, 별점 `#f5a623`
- 헤어라인/보더: `rgba(0,0,0,0.05~0.12)`, 은은한 배경 `rgba(0,0,0,0.05)` (hover `0.09`)

타이포 (본문: -apple-system, Pretendard, system-ui / 모노: JetBrains Mono)
- H1 40px/700/-0.015em (진행 화면 28px, 소진 34px, 랜딩 히어로 48px)
- 본문 17px, 카드 타이틀 15–16px/600/-0.01em, 보조 13–14px, 캡션 12–12.5px
- 섹션 라벨 12px/600/+0.05em, 모노 라벨 10–13px/+0.06em

radius: 라디오·체크 사각 5–6px / 버튼·칩 10px / 인풋 12px / 카드 14–18px / 드롭존 24px / 모달 22px / 원형(토글·아바타·프로그레스·장식 점) 999px

그림자: 카드 `0 1px 1px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)` / hover `0 8px 24px rgba(0,0,0,0.06)` / 모달 `0 24px 80px rgba(0,0,0,0.25)` / 옐로 강조 `0 8px 28px rgba(255,212,0,0.25)`

모션: 화면 진입 0.5s `cubic-bezier(0.32,0.72,0,1)` / press 0.15s ease-out / 토글 0.3s `cubic-bezier(0.175,0.885,0.32,1.1)` / breathe 1.2–1.6s / 스태거 60ms

## Assets
- 외부 이미지 없음. 포스터는 줄무늬 플레이스홀더(실서비스에서 TMDB 등 포스터로 교체).
- 폰트: Pretendard Variable(jsdelivr CDN), JetBrains Mono(Google Fonts). 업로드 아이콘은 인라인 SVG(stroke 1.6, round cap).

## Files
- `ZAMAK 프로토타입 (브랜드).html` — 이 시안의 인터랙티브 프로토타입(단일 파일, 전 화면 + 로직 포함). 우하단 "화면" 피커로 각 화면 즉시 이동 가능.

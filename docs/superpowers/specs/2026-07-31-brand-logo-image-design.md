# Brand logo image — design

Date: 2026-07-31  
Status: approved · implemented

## Goal

CSS로 그리던 검은 칩 워드마크를 제공된 ZAMAK 로고 이미지로 교체한다. 푸터 워드마크는 유지한다.

## Approach

**A — `BrandMark` 중앙화.** 에셋을 `public/brand/zamak-logo.png`에 두고, `BrandMark`가 `<img>`로 렌더한다. 칩 로고 호출부는 전부 `BrandMark`를 쓴다.

## In scope

1. 소스 PNG(실제 JPEG)를 진짜 PNG로 변환해 `public/brand/zamak-logo.png`에 저장.
2. `BrandMark` — CSS `.zchip` 대신 이미지. `size`는 **높이(px)**; 가로비 ~1024:377 유지. `onClick`/`aria-label`/`className` API 유지.
3. 호출부 통일:
   - 이미 `BrandMark` — `error.tsx`, `not-found.tsx`, `legal/parts.tsx` (자동 반영)
   - `AppNav` 인라인 `zchip` → `BrandMark` (`onClick={onHome}`)
   - 랜딩 sticky nav의 `zchip`+`Wordmark` → `BrandMark`
4. 문서: 이 스펙만. 번역 파이프라인 지도는 무관.

## Out of scope

- 푸터 `Wordmark` / `SiteFooter`
- `StepBreadcrumb` 단계 칩 (브랜드 로고 아님)
- `zchip-dot` 장식(설정 단계 등) — 로고와 무관
- OG / apple-icon (정사각 생성 이미지; 와이드 PNG와 비호환)
- `.zchip` CSS 삭제 (breadcrumb 등이 계속 사용)

## Sizing

| 위치 | height |
|------|--------|
| 기본 (`BrandMark`) | ~28px (기존 칩 시각 크기와 맞춤) |
| `AppNav` | ~24px |
| 랜딩 nav | ~28px |

정확한 px는 구현 시 기존 칩과 나란히 맞춰 조정.

## Non-goals

투명 배경 재작업, 다크/라이트 변형, favicon 교체.

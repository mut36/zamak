# Brand Logo Image Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSS chip brand marks with `public/brand/zamak-logo.png` via centralized `BrandMark`; keep footer Wordmark.

**Architecture:** Convert the provided asset to PNG, render it from `BrandMark` with height-based sizing, migrate AppNav and Landing nav to `BrandMark`.

**Tech Stack:** Next.js App Router, React, plain `<img>` from `/public`.

## Global Constraints

- Footer `Wordmark` unchanged
- StepBreadcrumb / decorative `zchip-dot` unchanged
- OG / apple-icon unchanged
- Screen copy stays in `COPY` (alt can be literal "ZAMAK")

---

### Task 1: Asset + BrandMark

**Files:**
- Create: `public/brand/zamak-logo.png`
- Modify: `app/components/BrandMark.tsx`

- [x] Convert source JPEG-as-PNG to real PNG at `public/brand/zamak-logo.png`
- [x] Rewrite `BrandMark` to render `<img src="/brand/zamak-logo.png" alt="ZAMAK" height={size} />` with width from aspect ratio 1024/377; keep `onClick` / `className` / default size ~28
- [x] Verify: component renders without CSS `.zchip` for the mark itself

### Task 2: Call-site migration

**Files:**
- Modify: `app/components/beta/AppNav.tsx`
- Modify: `app/components/simple/LandingPage.tsx`

- [x] AppNav: replace inline `zchip` with `<BrandMark size={24} onClick={onHome} />`
- [x] Landing nav: replace `zchip`+`Wordmark` with `<BrandMark size={28} />`
- [x] Confirm error / not-found / legal already use `BrandMark` (no edit needed unless sizing)

### Task 3: Verify

- [x] `npx tsc --noEmit`
- [x] Spot-check: landing nav, signed-in AppNav, legal header, error/404, footer still CSS wordmark
- [x] Mark design spec status approved/done

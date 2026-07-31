# ZAMAK

**v0.15.0 Beta**

SRT·VTT·SMI·ASS 자막을 Gemini로 번역하는 웹 애플리케이션입니다. 업로드 포맷은
가장자리에서 정규 SRT로 바꾼 뒤, AI에는 대사만 보내고 코드가 타임코드를 복원합니다.
다운로드는 올린 형식 그대로(현재 VTT까지) 또는 `.srt`입니다.

랜딩 메시지: **"번역해도, 뒤 자막이 밀리지 않도록."** — 속도가 아닌 타임코드 구조적 안정성을 전면에 둡니다 (docs/decisions.md §1-12). Toss식 풀블리드 챕터 레이아웃은 §1-13.

## Features

- **AI 자막 번역** — 빠른번역(Gemini 3.6 Flash)과 고급번역(Gemini 3.1 Pro Preview) 중 선택
- **키 입력 없이 바로 번역** — 모든 요청이 서버 키(`GOOGLE_GENAI_API_KEY`)로 동작합니다. 사용자가 API 키를 다루는 화면은 없습니다
- **Google 로그인 + 크레딧** — 베타 가입 시 번역권 3편 자동 지급. 모델을 호출하는 모든 라우트가 로그인을 요구하고, 크레딧은 파일 단위로 차감됩니다
- **번역권 충전** — 토스페이먼츠(카드·간편결제) 선불 크레딧. 가격은 서버가 확정하고, 승인·지급은 멱등한 서버 라우트에서 일어납니다
- **타임코드 무결성** — AI에게는 `[번호] 대사` 형태로 줄마다 표식을 붙여 보내고(타임스탬프는 토큰 낭비), 응답을 **표식으로 대조해 원본 타임코드와 재결합**합니다. 모든 줄이 스스로를 식별하므로 대사가 숫자여도 번호와 안 겹치고, AI가 표식을 빠뜨려도 그 텍스트가 옆 자막을 오염시키지 않으며, 자막을 합치거나 빠뜨려도 이후 자막이 밀리지 않습니다
- **티어별 청크 병렬 번역** — 자막을 청크로 나눠 동시 번역. 크기와 동시성은 티어별로 다릅니다 ([산출 근거](docs/tuning/chunk-size-model.md))
- **다중 자막 포맷** — `.srt`/`.vtt`/`.smi`/`.ass`/`.ssa` 업로드 → 정규 SRT로 변환 후 번역. **VTT는 올린 형식 그대로** 돌려받습니다. 파일을 새로 써내는 게 아니라 원본에서 대사 자리만 바꾸는 방식이라, 헤더·NOTE/STYLE·cue id·cue settings가 그대로 남습니다. ASS/SMI는 아직 `.srt`로만 (writer 미구현 — `docs/TODO.md`)
- **부분 실패 허용** — 실패한 청크는 원문을 유지하고 나머지는 번역해, 항상 재생 가능한 완전한 SRT를 반환합니다. 완료 화면에 실패 개수가 표시됩니다
- **작품 정보 자동 수집** — 파일명·자막 샘플에서 제목/연도를 추출한 뒤, TMDB에서 공식 제목·연도·감독·장르·포스터를 우선 조회하고, TMDB에 없는 작품은 Google Search 그라운딩으로 대체 조회합니다. 배경/시대·톤앤매너는 AI가 키워드로 보강합니다
- **영화 아닌 영상 지원** — 자막 앞부분을 샘플링해 AI가 내용을 요약하는 분기
- **7개 도착어 + 선택형 등장인물 시트** — 한국어·영어·일본어·스페인어·프랑스어·중국어·독일어를 지원하고, 필요할 때 고유명사와 인물 간 말투 관계를 추출·수정할 수 있습니다
- **번역 취소** — 진행 중 중단

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript 5 |
| AI | Google Gemini API (`@google/genai`) |
| 메타데이터 | TMDB API (제목·연도·감독·장르·포스터), Google Search grounding (TMDB 미스 폴백) |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase 프로젝트 (로그인 + 크레딧 저장) — 아래 [인증 설정](#인증-설정) 참조
- Google Cloud OAuth 클라이언트 (Google 로그인용)
- TMDB API 키 (작품 정보 조회용, 서버 전용)
- 토스페이먼츠 API 키 (크레딧 결제용) — 없어도 번역은 동작합니다. 실키 발급에는 사업자등록과 통신판매업 신고가 필요하고, 그 전까지는 테스트 키로 전 흐름을 확인할 수 있습니다
- Gemini API 키 (서버 전용) — **필수.** 모든 요청이 이 키로 돌아갑니다. Google Search grounding(`/api/enrich`)은 무료 등급 프로젝트에서 동작하지 않으므로 **결제가 연결된 프로젝트의 키**여야 합니다

### Installation

```bash
git clone https://github.com/mut36/zamak.git
cd zamak
npm install
```

`.env.local` 생성:

```env
# TMDB — 작품 정보 조회 (서버 전용, 클라이언트에 노출되지 않음)
TMDB_API_KEY=your_tmdb_v3_api_key

# Gemini — 모든 요청이 이 키로 돌아감 (서버 전용, 클라이언트에 노출되지 않음)
GOOGLE_GENAI_API_KEY=your_gemini_api_key

# Supabase — 로그인 + 크레딧. 둘 다 브라우저에 노출되며, 그래도 안전한 이유는
# 크레딧 테이블이 RLS로 보호되기 때문입니다 (supabase/migrations 참조).
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# 토스페이먼츠 — 크레딧 결제. 없으면 결제만 닫히고 번역은 그대로 동작합니다.
# 가맹점 심사 전에는 개발자센터의 테스트 키를 그대로 넣어 전 흐름을 돌려볼 수 있습니다.
TOSS_SECRET_KEY=test_sk_...
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...
```

개발 서버 실행:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)

### 검증

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

`check:tokens`는 디자인 토큰 가드입니다. CSS 커스텀 프로퍼티는 오타가 나도
빌드가 통과하므로(`var(--typo)`는 에러 없이 선언만 버려짐) tsc·eslint·vitest 중
무엇도 못 잡습니다. 이 스크립트가 `app/globals.css`의 정의 집합과 `app/` 전체의
`var(--…)` 참조 집합을 대조해 미정의 참조와 죽은 토큰을 걸러냅니다.

## Configuration

설정은 `app/config/constants.ts`에 모여 있습니다.

### 인증 설정

모델을 호출하는 4개 라우트(analyze/enrich/summarize/translate)는 전부 로그인을 요구합니다. 설정이 없으면 **열리는 게 아니라 500으로 닫힙니다**(fail-closed) — 설정 누락이 곧 무료 개방이 되지 않도록 한 의도적 선택입니다.

1. **Supabase 프로젝트 생성** → Settings → API에서 Project URL과 `anon` public key를 `.env.local`에 넣습니다
2. **Google OAuth 클라이언트 생성** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application)
   - Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
3. **Supabase 대시보드** → Authentication → Providers → Google을 켜고 위에서 받은 Client ID/Secret 입력
4. **Supabase 대시보드** → Authentication → URL Configuration
   - Site URL: `https://zamak.app`
   - Redirect URLs: `http://localhost:3000/auth/callback`(개발),
     `https://zamak.app/auth/callback`, `https://www.zamak.app/auth/callback`
5. **스키마 적용**: `supabase/migrations/0001_credits.sql`을 SQL Editor에 붙여넣고 실행

### 베타 리디자인 마이그레이션

`0001`~`0003` 이후, 베타 리디자인이 추가한 스키마를 **순서대로** SQL Editor에서 실행합니다:

1. `supabase/migrations/0004_credit_tiers.sql` — 크레딧을 라이트/프로 2종 잔액으로 분리
2. `supabase/migrations/0005_feedback.sql` — 완료 화면 별점·의견 피드백
3. `supabase/migrations/0006_waitlist.sql` — 번역권 소진 시 결제 오픈 대기자 등록
4. `supabase/migrations/0007_job_results.sql` — 번역 결과물 보관(30일) + `translation_jobs` 컬럼 추가
5. `supabase/migrations/0008_copyright_consents.sql` — 첫 번역 전 저작권 동의 기록
6. `supabase/migrations/0009_beta_metrics.sql` — 베타 계측: 청크별 토큰 실측
   (`translation_chunk_usage`), 런별 실측 컬럼(`translation_jobs` +
   `record_job_metrics`), 퍼널 이벤트(`beta_events`), 재방문 피드백 확장
   (`feedback.usability`/`issue_kinds`/`reported_blocks` +
   `pending_feedback_job()`). **2026-07-31 기준 아직 미실행** — 실행 전에는
   계측 관련 API(`/api/translation/metrics`, `/api/events`,
   `/api/feedback/pending`)가 전부 조용히 실패한다(계측 실패가 번역을 깨면
   안 된다는 원칙대로 fire-and-forget이라 사용자에게는 안 보이지만, 계측
   자체는 안 쌓인다).

**마이그레이션과 배포는 붙여서 합니다.** `0004`는 기존 `begin_translation_job(integer)`과
5인자 `settle_order`를 **drop하고** 새 시그니처로 다시 만듭니다. 이 앱은 Next.js 한 벌이
Supabase 한 개를 보는 구조라 블루/그린도, 버전 핀도 없습니다 — 그래서 순서가 어느 쪽이든
그 사이에는 살아 있는 코드가 없는 함수를 호출하는 구간이 생깁니다(마이그레이션 먼저면
구코드가 옛 시그니처를 못 찾고, 배포 먼저면 신코드가 새 시그니처를 못 찾습니다).
1인 운영이므로 **트래픽이 적은 시간에 마이그레이션 실행 → 곧바로 배포**로 몇 분짜리
다운타임을 감수하는 것이 가장 단순하고 정직한 방법입니다. 그 사이 진행 중이던 번역은
실패하며, 차감된 번역권은 `/legal`의 환불 조항대로 복구해 주면 됩니다.

`0007` 실행 후, Supabase 대시보드 **Storage → New bucket**에서 이름 `results`, **Public bucket OFF**(비공개)로 버킷을 생성합니다. **이 버킷을 만들지 않으면 번역 자체는 정상 동작하지만, 결과물이 저장되지 않아 `/mypage`의 번역 기록이 비어 보입니다.**

### 크레딧

크레딧 1개 = 자막 파일 1개(최대 2,000블록). 가입 시 트리거가 1개를 자동 지급합니다.

**차감은 청크가 아니라 파일 단위입니다.** 영화 한 편은 청크 수십 개로 쪼개져 `/api/translate`를 여러 번 호출하므로, 요청마다 차감하면 한 편에 크레딧이 수십 개 날아갑니다. 그래서 번역 시작 시 `/api/translation/begin`이 **크레딧 1개를 차감하며 job을 하나 열고**, 이후 모든 청크 요청은 그 job id를 함께 보내 검증받습니다. 잔액 갱신과 job 생성은 하나의 SQL 함수 안에서 일어나므로 탭 두 개가 마지막 크레딧을 동시에 쓸 수 없습니다.

| 상황 | 응답 |
|---|---|
| 비로그인 | `401` — 모든 모델 라우트 |
| 크레딧 0 | `402 insufficient_credits` |
| 2,000블록 초과 | `413 file_too_large` |
| job이 없거나 만료(기본 60분) | `403 invalid_or_expired_job` |

크레딧이 떨어지면 [결제](#결제-토스페이먼츠)로 충전합니다.

개발 중 크레딧 충전·페이월 테스트·job 이력 확인은 [`supabase/dev-seed.sql`](supabase/dev-seed.sql)의 스니펫을 SQL Editor에 붙여넣어 처리합니다. **이 파일은 프로덕션에서 실행하지 않습니다** — 잔액을 덮어쓰기 때문입니다.

결제가 열리기 전(베타 기간) 수동 크레딧 지급은 [`supabase/comp-credit.sql`](supabase/comp-credit.sql)을 씁니다. dev-seed와 달리 잔액을 더하기 때문에 프로덕션에서 실행해도 안전합니다.

### 결제 (토스페이먼츠)

선불 크레딧 팩이 유일한 상품입니다. 팩 정의는 [`app/config/packs.ts`](app/config/packs.ts) 한 곳에 있고, **그 파일이 가격의 원본**입니다 — 브라우저는 팩 id만 보냅니다.

```text
팩 선택 → /api/payments/prepare        가격을 orders 행에 기록 → orderId
        → 토스 결제창 (카드·간편결제)
        → /api/payments/confirm        승인 + 크레딧 지급 (성공 시 Toss가 리다이렉트)
        → /?purchase=done&credits=N
   실패 → /api/payments/fail           주문 종료 → /?purchase=failed&code=…
```

설계상 중요한 두 가지:

- **금액은 결제창을 열기 전에 서버가 정합니다.** 정산 함수(`settle_order`)는 Toss가 승인한 금액이 주문 행과 다르면 거절하므로, 클라이언트를 고쳐도 30편을 100원에 살 수 없습니다.
- **승인은 successUrl인 서버 라우트에서 일어납니다.** 결제창은 `paymentKey`만 만들 뿐 돈은 아직 움직이지 않았고, 승인을 클라이언트에 두면 우리 JS가 도는지에 결제가 걸립니다. 이 URL은 새로고침될 수 있으므로 전 경로가 멱등입니다(이미 `paid`면 재승인 없이 통과).

**가상계좌·계좌이체는 제공하지 않습니다.** 입금이 나중에 웹훅으로 오는데 수신부가 없어서, 열면 "결제는 됐는데 크레딧이 없는" 주문이 생깁니다.

돈을 실제로 받으려면 코드 밖에서 네 가지가 필요합니다:

1. **토스페이먼츠 가맹점 계약** — 사업자등록증 + 통신판매업 신고번호가 있어야 심사가 통과됩니다. 심사 전에도 테스트 키로 전 흐름을 돌려볼 수 있습니다
2. `.env.local`(및 Vercel)에 `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY` 추가
3. `supabase/migrations/0002_payments.sql`을 SQL Editor에서 실행
4. [`app/legal/page.tsx`](app/legal/page.tsx)의 `SELLER_INFO` TODO를 실제 사업자 정보로 채우기 — **전자상거래법 표시사항이라 비워둔 채로 결제를 열면 안 됩니다**

환불은 "미사용 크레딧 전액 환불, 사용분 불가"이고 `/legal`에 고지돼 있습니다. 처리는 당분간 토스 대시보드에서 수동으로 합니다(제품 안에 환불 버튼 없음).

### 티어별 청크·동시성

번역 요청의 티어는 `resolveTier()` 한 곳에서 결정되고, 현재는 **무조건 `server`**입니다. 로그인/크레딧이 붙으면 이 함수 본문을 세션 조회로 교체하면 됩니다.

| | 청크 크기 | 동시성 | 근거 |
|---|---|---|---|
| server (현재 전원) | 100 | 16 | 계산상 최적값이 아니라 **경험적 안전선** — 아래 참조 |
| free (현재 미사용) | 150 | 6 | Gemini 무료 등급 RPM 15에서 유도. 로그인 후 무크레딧 티어용으로 보존 |

**청크 크기는 계산으로 정할 수 없습니다.** 유도되는 건 상한 두 개(출력 상한 65,536 → `B ≤ 3,276`, 라우트 타임아웃 300초 → `B ≤ 4,097`)뿐이고 둘 다 100의 32배 이상 떨어져 있습니다. 그 안쪽은 전부 끝점 없는 트레이드입니다 — 비용은 B에 단조 감소하지만 전 구간 6.5% 차이고(thinking 토큰이 0이라), 시간은 단조 증가하지만 영화 한 편이 어느 쪽이든 1분 안에 끝납니다.

실제로 B를 가를 두 양은 **둘 다 미측정이고 방향이 반대**입니다: 정렬 실패율은 방향 불명, 인물 말투 일관성은 큰 B를 선호합니다(청크가 서로를 모른 채 병렬 번역되므로).

**2026-07-22 낮엔 `B = 크레딧 상한`(청킹 없음)까지 갔다가, 같은 날 저녁 베타 테스트에서 되돌렸습니다.** 모델이 자막 하나를 둘로 쪼개면 그 뒤 번호가 전부 하나씩 밀리는 사고가 실사용으로 재현됐고, 밀린 번호도 정상 검증(원본에 존재·미사용·증가)을 통과하기 때문에 **번역문이 엉뚱한 타임코드에 조용히 붙습니다** — 실패 지표에도 안 잡힙니다. 청크가 클수록(2000이면 최대 1,361블록) 사고당 오염 범위가 커지므로, 사고 확률을 낮췄다고 관찰된 500으로 낮췄다가 이후 200, (문서화되지 않은 채) 150을 거쳐 **B=100**까지 더 줄였습니다. 이건 완화이지 수정이 아닙니다 — 탐지·복구 로직은 아직 없고, 재발하면 그때 추가합니다. 상세는 [docs/tuning/chunk-size-model.md §8](docs/tuning/chunk-size-model.md), 결정 기록은 [docs/decisions.md §2-3-1](docs/decisions.md).

**2026-07-25 하네스 실측**: 별개의 실패 모드 — 마커(`[번호]`)가 같은 청크 안 다른 대사의 토큰에 오염돼 깨지는 현상(모델 생성 단계 문제, 파싱 버그 아님) — 이 THINKING_LEVEL=LOW·B=150에서 1874블록 중 1건 재현됐고, B=100으로 줄이자 재현되지 않았습니다(단일 실행 관찰, 확정된 임계값 아님). THINKING_LEVEL=MEDIUM으로도 동일 사고가 사라졌지만 비용이 3배라 채택하지 않았습니다. 상세는 [docs/decisions.md §2-3-3](docs/decisions.md).

⚠️ 출력 상한 여유는 B=100 기준 더 넉넉합니다(B=200일 때 6.1%). **비영어 자막을 받기 전에 블록당 출력 토큰을 재측정**하세요 — 밀도가 6.5배를 넘으면 상한을 넘길 수 있습니다.

숫자를 바꿔 실험하려면 env로 덮으면 됩니다(하네스도 같은 상수를 읽습니다):

```bash
NEXT_PUBLIC_CHUNK_SIZE=100 npm run harness -- file=samples/subtitles/full-movie.srt
```

`app/config/constants.test.ts`는 위 상한 두 개만 강제합니다 — 임의의 값을 꽂아보는 걸 막지 않기 위해서입니다. 자세한 유도 이력(무너진 유도 4개 포함)은 [docs/tuning/chunk-size-model.md](docs/tuning/chunk-size-model.md) §5에 있습니다.

#### Gemini rate limit과 운영 천장 (유료 Tier 2, 2026-07-26)

| 모델 | 용도 | RPM | TPM | RPD |
|---|---|---|---|---|
| `gemini-3.6-flash` | 빠른번역 | 2,000 | 3,000,000 | 100,000 |
| `gemini-3.5-flash-lite` | analyze/enrich/summarize | 10,000 | 10,000,000 | 350,000 |
| `gemini-3.1-pro-preview` | 고급번역 | 1,000 | 5,000,000 | 50,000 |

이 한도는 **전체 사용자가 나눠 씁니다.** B=100·K=16에서 나오는 실질 천장은 두 가지입니다:

- **동시 번역 인원** — 850줄짜리면 약 20명, 크레딧 상한(2,000줄)에 가까운 파일이 몰리면 **약 11명**. 먼저 조이는 건 RPM이 아니라 **TPM**입니다.
- **하루 처리 편수** — RPD 기준 flash **5,000편** / pro **2,500편** (편당 20요청 가정). Tier 1에선 RPD가 무제한이었으므로 이건 이번 승급으로 새로 생긴 천장입니다.

429는 재시도하지 않고 그 청크를 원문으로 남기므로, 조여오면 **K(`NEXT_PUBLIC_CONCURRENCY`)를 먼저 줄이세요** — B는 수용 인원을 거의 못 바꿉니다. 계산은 [docs/tuning/gemini-limits.md §2·§7-2](docs/tuning/gemini-limits.md).

값의 유도 과정과 계산기는 [docs/tuning/](docs/tuning/)에, **"왜 이렇게 되어 있는가"는 [docs/decisions.md](docs/decisions.md)**에 있습니다.

```bash
node scripts/chunk-model.mjs                    # 현재 파라미터로 비용·시간 표
node scripts/chunk-model.mjs N=1400 kmax=20     # 파라미터 오버라이드
```

### 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `TMDB_API_KEY` | — | **필수.** 작품 정보 조회 (제목·연도·감독·장르·포스터). 미매칭 시 Google Search 그라운딩으로 대체 |
| `TMDB_LANGUAGE` | `ko-KR` | TMDB 메타데이터 언어 |
| `THINKING_LEVEL` | `LOW` | 빠른번역(flash) thinking. `MINIMAL`\|`LOW`\|`MEDIUM`\|`HIGH`. **실측상 MINIMAL과 LOW 모두 thinking 0** — 비용이 같아 품질이 나은 LOW가 기본값. 변경 시 dev 서버 재시작 필요 |
| `PRO_THINKING_LEVEL` | `HIGH` | 고급번역(Pro) thinking. 같은 네 값. LOW/MEDIUM은 정렬 안정성 이득 없이 비용만 늘어 기각(`decisions.md` §2-15). 변경 시 dev 서버 재시작 필요 |
| `NEXT_PUBLIC_FREE_CHUNK_SIZE` / `_FREE_CONCURRENCY` | 150 / 6 | 무료 티어 청킹 |
| `NEXT_PUBLIC_CHUNK_SIZE` / `NEXT_PUBLIC_CONCURRENCY` | 100 / 16 | server 티어 청킹, **flash 전용**(현재 전원). 100은 계산상 최적값이 아니라 재번호 드리프트·마커 오염을 피하려는 경험적 안전선(위 참조) |
| `NEXT_PUBLIC_PRO_CHUNK_SIZE` | 250 | 고급번역(Pro) 전용 청킹. flash와 근거가 달라 별도 값 — HIGH thinking 토큰 비용이 B가 클수록 급감해서 250을 씀(`decisions.md` §2-15). `chunkSizeForModel(model)`이 분기 |
| `TRANSLATION_STRICT_MODE` | `false` | 아래 참조 |
| `GOOGLE_GENAI_API_KEY` | — | **필수.** analyze/enrich/summarize/translate 4개 라우트 전부가 이 키로 동작. grounding 때문에 결제 연결 프로젝트여야 함 |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | — | **필수.** 없으면 모델 라우트가 전부 500으로 닫힘 |
| `NEXT_PUBLIC_SITE_URL` | `https://zamak.app` (프로덕션) | OG·메타 `metadataBase`용 캐논 오리진. 없으면 프로덕션에서 `SITE.url`, 프리뷰는 Vercel URL |
| `NEXT_PUBLIC_MAX_BLOCKS_PER_CREDIT` | 2000 | 크레딧 1개가 커버하는 자막 블록 수 |
| `JOB_VALIDITY_MINUTES` | 60 | 결제된 job이 유효한 시간 |
| `TOSS_SECRET_KEY` | — | 결제 승인용 시크릿 키 (서버 전용). 없으면 결제 라우트만 닫히고 번역은 그대로 동작 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | — | 결제창을 여는 클라이언트 키. 브라우저에 노출되며 그래도 안전 — 이 키로는 승인을 못 함 |
| `GLOSSARY_PROVIDER` | `openai` | 글로사리·존대관계 추출 프로바이더 (`openai`\|`gemini`). 기본은 OpenAI(GPT-5.6-luna, `decisions.md` §2-14). Gemini로 롤백하려면 `gemini` + 아래 `GLOSSARY_MODEL`을 Gemini 모델명으로 |
| `GLOSSARY_MODEL` | `gpt-5.6-luna` (`GLOSSARY_PROVIDER=gemini`이면 `gemini-3.6-flash`) | 글로사리·존대관계 추출(opt-in, InfoStep 토글) 모델. 파일당 1회. 1,100블록 기준 예전 Gemini flash+MEDIUM에서 ~130원 관측 — 무시할 수준은 아님 |
| `GLOSSARY_THINKING_LEVEL` | `MEDIUM` | **Gemini 경로 전용.** OpenAI 경로에서는 무시. `MINIMAL`\|`LOW`\|`MEDIUM`\|`HIGH` |
| `GLOSSARY_MAX_BLOCKS` | 3000 | 이 블록 수를 넘는 파일은 앞/중간/뒤를 고르게 발췌해 추출(이름·관계가 파일 전체에 흩어져 있어 summarize처럼 앞부분만 보지 않음) |
| `GLOSSARY_MAX_TERMS` / `GLOSSARY_MAX_RELATIONS` | 40 / 16 | 시트 항목 상한 — 청크당 프롬프트 세금을 제한 |
| `GLOSSARY_MAX_CHARS` | 1200 | `<glossary>`+`<speech_relations>` 렌더 결과 총 길이 상한(문자) |
| `GLOSSARY_WAIT_MS` | 15000 | 번역 시작 시 아직 추출 중이면 최대 이만큼만 기다리고 빈 시트로 진행 |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | — / `claude-sonnet-5` | **`scripts/glossary-ab.mts` 등 모델 비교 실험 전용.** production 라우트는 안 씀 — `registry.ts`/`ALLOWED_MODELS`는 여전히 Gemini 고정(`app/lib/providers/claude.ts`) |
| `OPENAI_API_KEY` | — | **글로사리 추출 프로덕션에 필요** (`GLOSSARY_PROVIDER=openai` 기본). 없으면 추출은 빈 시트로 물러서고 번역은 계속됨. A/B 하네스(`scripts/glossary-ab.mts`)에도 사용 |
| `OPENAI_MODEL` | — | 하네스 전용(기본값 없음 — 모델명이 빨리 바뀌어 추측 기본값을 두지 않음). 프로덕션 글로사리는 `GLOSSARY_MODEL`을 씀 |

### 글로사리·존대관계 (opt-in)

InfoStep의 "등장인물·용어 일관성" 토글(기본 OFF, 브라우저에 기억됨)을 켜면 파일 전체를
한 번 스캔해 인물·지명·용어의 **도착어 표기**와 인물 간 말투(존댓말/반말, 敬語/タメ口,
usted/tú 등 도착어의 격식 축)를 미리 정합니다. 영어·중국어처럼 문법적 말투 축이 없는
언어에서는 표기만 정하고 말투 관계는 만들지 않습니다. 청크가
병렬로 번역되며 이름 표기·말투가 청크마다 흔들리던 문제를 줄입니다. 존대 관계는 자막
번호 구간을 갖고 있어(예: 1~412번은 존댓말, 413번부터 반말) 관계가 장면 안에서 바뀌어도
그 아크를 그대로 실어 나릅니다 — 번역 단계에서는 청크의 실제 블록 범위와 겹치는 관계만
프롬프트에 실립니다. 토글이 꺼져 있으면(기본값) 이 기능은 API를 전혀 호출하지 않고
프롬프트도 이 기능이 없던 시절과 완전히 동일합니다. 자세한 배선은
[docs/translation-pipeline.md](docs/translation-pipeline.md) §2-C·§7, 토글을 켜고
끄는 결정 배경은 [docs/decisions.md](docs/decisions.md) §2-8을 참고하세요.

### 번역 실행 경로

기본 경로는 **청크당 모델 호출 1회**입니다. 검증·재시도·블록 단위 재번역을 하지 않으므로 청크당 비용이 고정됩니다. 응답을 받으면 번호로 대조해 원본 타임코드와 재결합하며, 이 과정에 API 호출이 추가되지 않습니다.

엄격 모드(`TRANSLATION_STRICT_MODE=true`)는 출력 검증 + 재시도 + 블록 단위 재번역을 수행합니다. 모델이 형식을 조금만 어긋나게 반환해도 한 청크가 수백 번 호출로 불어날 수 있어 **기본적으로 꺼져 있습니다.** 코드는 삭제하지 않고 플래그 뒤에 보존돼 있습니다.

## Usage

0. Google로 로그인합니다 (첫 로그인 시 번역권 1편 자동 지급)
1. 영상 유형을 고르고 `.srt`/`.vtt`/`.smi`/`.ass` 파일을 올립니다
2. 영화·드라마면 제목·연도·감독·포스터가 담긴 카드가 뜹니다. 틀리면 수정 후 재검색합니다
3. 도착어(한국어·영어·일본어·스페인어·프랑스어·중국어·독일어)와 번역 스타일을 고르고
   번역을 시작합니다
4. 완료 후 **다운로드** 버튼으로 파일을 받습니다. VTT를 올렸다면 `.ko.vtt`와 `.ko.srt`
   중 고를 수 있고, 그 외에는 `.ko.srt`입니다

## Project Structure

```text
proxy.ts                        # Supabase 세션 쿠키 갱신 (게이트 아님)
supabase/migrations/            # 크레딧·job 스키마 + 가입 시 1크레딧 트리거, 주문·정산
supabase/dev-seed.sql           # 개발용 크레딧 조작 스니펫 (프로덕션 금지)
supabase/comp-credit.sql        # 베타용 수동 크레딧 지급 (프로덕션에서 실행 가능)
app/
├── auth/callback/route.ts      # Google OAuth 코드 → 세션 쿠키
├── legal/page.tsx              # 환불 정책 + 전자상거래법 표시사항 (사업자 정보 TODO)
├── api/
│   ├── analyze/route.ts        # 파일명/자막 샘플 → 제목·연도 (로그인 필요)
│   ├── credits/route.ts        # 잔액 조회
│   ├── enrich/route.ts         # TMDB 우선 조회, 미스 시 Google Search 폴백 (로그인 필요)
│   ├── payments/prepare/       # 팩 → 주문 생성 (가격을 서버가 확정)
│   ├── payments/confirm/       # Toss successUrl — 승인 + 크레딧 지급 (멱등)
│   ├── payments/fail/          # Toss failUrl — 주문 종료
│   ├── summarize/route.ts      # 영화 아닌 영상의 내용 요약 (로그인 필요)
│   ├── translation/begin/      # 크레딧 1개 차감 + job 생성
│   └── translate/route.ts      # 청크 번역, SSE (job 검증)
├── components/simple/          # 위저드 스텝 (업로드/정보/진행/완료) + 충전
├── config/
│   ├── constants.ts            # 모델, 티어별 청킹, thinking, TMDB
│   ├── packs.ts                # 크레딧 팩 = 가격의 원본
│   └── languages.ts            # 도착어 표 (언어 추가 = 한 행 + 룰 프롬프트 1개)
├── hooks/
│   ├── useTranslation.ts       # 파일 처리, 청킹, 병렬 번역, 취소
│   └── useEnrich.ts            # 작품 정보 통합 조회 (TMDB → 그라운딩 폴백)
├── i18n/simpleCopy.ts          # UI 문구 (하드코딩 금지)
├── lib/
│   ├── client/                 # SSE, API 요청, 병렬 실행 풀
│   ├── prompts/                # 프롬프트 로더·조합
│   ├── providers/              # Gemini provider
│   ├── server/                 # 요청 검증, SSE, 번역 서비스, enrichMovie(TMDB·그라운딩), TMDB, 토스 결제
│   ├── srt.ts                  # SRT 파싱, 청킹, 타임코드 재조립
│   └── subtitles/              # VTT/SMI/ASS ↔ 정규 SRT 어댑터 (원본 형식 복원 포함)
└── types/translation.ts
docs/decisions.md               # 기획·설계 결정과 그 이유 (뒤집힌 결정 포함)
docs/tuning/                    # 청크 크기 산출 근거 + API 한도 조회표
prompts/
├── common/                     # 번역 규칙·철학·분석 프롬프트
└── gemini/adapter.txt
samples/subtitles/              # 튜닝용 샘플 자막 (.srt는 gitignore)
scripts/chunk-model.mjs         # 청크 크기 계산기
```

## Architecture

```text
[방문자] → LandingPage           Google 로그인 (가입 시 크레딧 1개 지급)
   → UploadStep (.srt/.vtt/.smi/.ass)
        └── parseSubtitleDocument  포맷 → 정규 SRT + 원본 오프셋 맵
                                   (읽기 실패는 여기서 멈춤 — 다음 단계로 안 넘어감)
   → useTranslation.processFile
        └── /api/analyze          제목·연도 추출
   → InfoStep (useEnrich)
        └── /api/enrich           enrichMovie(): TMDB 조회 → 매치 시 제목·연도·
                                   감독·장르·포스터 + AI 키워드(배경/시대·톤앤매너)
                                   1회, 미스 시 Google Search 그라운딩으로 대체
   → useTranslation.translate
        ├── /api/translation/begin  크레딧 1개 차감 → jobId (파일당 1회)
        ├── resolveTier()         청크 크기·동시성 (현재 항상 server)
        ├── chunkSrtBlocks        자막을 청크로 분할
        └── runOrderedPool        청크별 /api/translate 병렬 호출
             └── translateSubtitle
                  ├── composeTranslationPrompt   타임스탬프 제거, 줄마다 [번호] 대사 전송
                  ├── Gemini 호출 (청크당 1회)
                  └── reassembleTranslatedChunk  [번호] 표식 대조 → 원본 타임코드 복원
   → DoneStep                     명시적 다운로드
        └── emitInOriginalFormat   원본 형식으로 되돌리기 (원본에 대사만 치환)

[크레딧 소진 / 헤더의 잔액 클릭]
   → PurchaseStep                팩 선택
        ├── /api/payments/prepare   가격 확정 → orders 행 → orderId
        ├── 토스 결제창             카드·간편결제 (가상계좌 없음)
        └── /api/payments/confirm   승인 → settle_order → 크레딧 지급 (멱등)
             → /?purchase=done       배너 + 잔액 갱신
```

## Deploy

프로덕션 도메인: [https://zamak.app](https://zamak.app) (`www.zamak.app` → apex 301, `vercel.json`).

```bash
npm run build
vercel deploy
```

Vercel Project Settings → Environment Variables에 `TMDB_API_KEY`, `GOOGLE_GENAI_API_KEY`, `OPENAI_API_KEY`(글로사리 토글 ON 시), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL=https://zamak.app`, `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 추가합니다.

Domains에 `zamak.app`과 `www.zamak.app`을 연결하고, Supabase Redirect URLs에
`https://zamak.app/auth/callback`과 `https://www.zamak.app/auth/callback`을 등록해야
로그인이 돌아옵니다.

## License

라이선스 파일과 `package.json` 라이선스 필드가 아직 명시돼 있지 않습니다.

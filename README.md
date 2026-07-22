# ZAMAK

**v0.3.0 Beta**

SRT 자막을 Gemini로 번역하는 웹 애플리케이션입니다. 타임코드는 코드가 관리하고 AI는 대사만 다루는 구조라, 번역 결과가 원본 싱크를 그대로 유지합니다.

## Features

- **AI 자막 번역** — Gemini 3.5 Flash 단일 모델. 의미보존형(meaning)과 영화적(cinematic) 두 가지 스타일
- **키 입력 없이 바로 번역** — 모든 요청이 서버 키(`GOOGLE_GENAI_API_KEY`)로 동작합니다. 사용자가 API 키를 다루는 화면은 없습니다
- **Google 로그인 + 크레딧** — 가입 시 번역권 1편 자동 지급. 모델을 호출하는 모든 라우트가 로그인을 요구하고, 크레딧은 파일 단위로 차감됩니다
- **번역권 충전** — 토스페이먼츠(카드·간편결제) 선불 크레딧. 가격은 서버가 확정하고, 승인·지급은 멱등한 서버 라우트에서 일어납니다
- **타임코드 무결성** — AI에게는 번호와 대사만 보내고(타임스탬프는 토큰 낭비), 응답을 **번호로 대조해 원본 타임코드와 재결합**합니다. AI가 자막을 합치거나 빠뜨려도 이후 자막이 밀리지 않습니다
- **티어별 청크 병렬 번역** — 자막을 청크로 나눠 동시 번역. 크기와 동시성은 티어별로 다릅니다 ([산출 근거](docs/tuning/chunk-size-model.md))
- **부분 실패 허용** — 실패한 청크는 원문을 유지하고 나머지는 번역해, 항상 재생 가능한 완전한 SRT를 반환합니다. 완료 화면에 실패 개수가 표시됩니다
- **작품 정보 자동 수집** — 파일명·자막 샘플에서 제목/연도를 추출하고, Google Search로 감독·톤·인물 말투 지침을 생성하며, TMDB에서 포스터를 가져옵니다
- **영화 아닌 영상 지원** — 자막 앞부분을 샘플링해 AI가 내용을 요약하는 분기
- **번역 취소** — 진행 중 중단

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript 5 |
| AI | Google Gemini API (`@google/genai`) |
| 메타데이터 | TMDB API (포스터) |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase 프로젝트 (로그인 + 크레딧 저장) — 아래 [인증 설정](#인증-설정) 참조
- Google Cloud OAuth 클라이언트 (Google 로그인용)
- TMDB API 키 (포스터용, 서버 전용)
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
# TMDB — 포스터 조회 (서버 전용, 클라이언트에 노출되지 않음)
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
npx tsc --noEmit && npx eslint app && npx vitest run
```

## Configuration

설정은 `app/config/constants.ts`에 모여 있습니다.

### 인증 설정

모델을 호출하는 4개 라우트(analyze/enrich/summarize/translate)는 전부 로그인을 요구합니다. 설정이 없으면 **열리는 게 아니라 500으로 닫힙니다**(fail-closed) — 설정 누락이 곧 무료 개방이 되지 않도록 한 의도적 선택입니다.

1. **Supabase 프로젝트 생성** → Settings → API에서 Project URL과 `anon` public key를 `.env.local`에 넣습니다
2. **Google OAuth 클라이언트 생성** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application)
   - Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
3. **Supabase 대시보드** → Authentication → Providers → Google을 켜고 위에서 받은 Client ID/Secret 입력
4. **Supabase 대시보드** → Authentication → URL Configuration → Redirect URLs에 `http://localhost:3000/auth/callback`(개발)과 배포 도메인의 같은 경로를 추가
5. **스키마 적용**: `supabase/migrations/0001_credits.sql`을 SQL Editor에 붙여넣고 실행

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

개발 중 크레딧 충전·페이월 테스트·job 이력 확인은 [`supabase/dev-seed.sql`](supabase/dev-seed.sql)의 스니펫을 SQL Editor에 붙여넣어 처리합니다.

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
| server (현재 전원) | 2000 | 16 | 크레딧 상한과 같음 = **파일당 요청 1개, 청킹 없음**. 동시성은 무효 |
| free (현재 미사용) | 150 | 6 | Gemini 무료 등급 RPM 15에서 유도. 로그인 후 무크레딧 티어용으로 보존 |

**청크 크기는 계산으로 정할 수 없습니다.** 유도되는 건 상한 두 개(출력 상한 65,536 → `B ≤ 3,276`, 라우트 타임아웃 300초 → `B ≤ 4,097`)뿐이고 둘 다 현재값의 26배 이상 떨어져 있습니다. 그 안쪽은 전부 끝점 없는 트레이드입니다 — 비용은 B에 단조 감소하지만 전 구간 6.5% 차이고(thinking 토큰이 0이라), 시간은 단조 증가하지만 영화 한 편이 어느 쪽이든 1분 안에 끝납니다.

실제로 B를 가를 두 양은 **둘 다 미측정이고 방향이 반대**입니다: 정렬 실패율은 방향 불명, 인물 말투 일관성은 큰 B를 선호합니다(청크가 서로를 모른 채 병렬 번역되므로).

내부 최적점이 없으므로 **자기 근거가 있는 끝점**을 택했습니다 — `B = 크레딧 상한`, 즉 파일 하나가 요청 하나입니다. 가장 싸고, 모델이 영화 전체를 문맥으로 봅니다. 대가는 **all-or-nothing**(실패 시 청크 1개가 아니라 파일 전체가 원문으로 남음)과 진행 링이 시간 추정에만 의존한다는 점입니다. ⚠️ 출력 상한 여유가 61%까지 차므로, **비영어 자막을 받기 전에 블록당 출력 토큰을 재측정**하세요 — 밀도가 2배면 상한을 넘겨 파일 전체가 잘립니다.

숫자를 바꿔 실험하려면 env로 덮으면 됩니다(하네스도 같은 상수를 읽습니다):

```bash
NEXT_PUBLIC_CHUNK_SIZE=200 npm run harness -- file=samples/subtitles/full-movie.srt
```

`app/config/constants.test.ts`는 위 상한 두 개만 강제합니다 — 임의의 값을 꽂아보는 걸 막지 않기 위해서입니다. 자세한 유도 이력(무너진 유도 4개 포함)은 [docs/tuning/chunk-size-model.md](docs/tuning/chunk-size-model.md) §5에 있습니다.

값의 유도 과정과 계산기는 [docs/tuning/](docs/tuning/)에, **"왜 이렇게 되어 있는가"는 [docs/decisions.md](docs/decisions.md)**에 있습니다.

```bash
node scripts/chunk-model.mjs                    # 현재 파라미터로 비용·시간 표
node scripts/chunk-model.mjs N=1400 kmax=20     # 파라미터 오버라이드
```

### 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `TMDB_API_KEY` | — | **필수.** 포스터 조회 |
| `TMDB_LANGUAGE` | `ko-KR` | TMDB 메타데이터 언어 |
| `THINKING_LEVEL` | `LOW` | `MINIMAL`\|`LOW`\|`MEDIUM`\|`HIGH`. **실측상 MINIMAL과 LOW 모두 thinking 0** — 비용이 같아 품질이 나은 LOW가 기본값. 변경 시 dev 서버 재시작 필요 |
| `NEXT_PUBLIC_FREE_CHUNK_SIZE` / `_FREE_CONCURRENCY` | 150 / 6 | 무료 티어 청킹 |
| `NEXT_PUBLIC_CHUNK_SIZE` / `NEXT_PUBLIC_CONCURRENCY` | 2000 / 16 | server 티어 청킹 (현재 전원). 기본값은 크레딧 상한과 같아 청킹이 일어나지 않음 |
| `TRANSLATION_STRICT_MODE` | `false` | 아래 참조 |
| `GOOGLE_GENAI_API_KEY` | — | **필수.** analyze/enrich/summarize/translate 4개 라우트 전부가 이 키로 동작. grounding 때문에 결제 연결 프로젝트여야 함 |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | — | **필수.** 없으면 모델 라우트가 전부 500으로 닫힘 |
| `NEXT_PUBLIC_MAX_BLOCKS_PER_CREDIT` | 2000 | 크레딧 1개가 커버하는 자막 블록 수 |
| `JOB_VALIDITY_MINUTES` | 60 | 결제된 job이 유효한 시간 |
| `TOSS_SECRET_KEY` | — | 결제 승인용 시크릿 키 (서버 전용). 없으면 결제 라우트만 닫히고 번역은 그대로 동작 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | — | 결제창을 여는 클라이언트 키. 브라우저에 노출되며 그래도 안전 — 이 키로는 승인을 못 함 |

### 번역 실행 경로

기본 경로는 **청크당 모델 호출 1회**입니다. 검증·재시도·블록 단위 재번역을 하지 않으므로 청크당 비용이 고정됩니다. 응답을 받으면 번호로 대조해 원본 타임코드와 재결합하며, 이 과정에 API 호출이 추가되지 않습니다.

엄격 모드(`TRANSLATION_STRICT_MODE=true`)는 출력 검증 + 재시도 + 블록 단위 재번역을 수행합니다. 모델이 형식을 조금만 어긋나게 반환해도 한 청크가 수백 번 호출로 불어날 수 있어 **기본적으로 꺼져 있습니다.** 코드는 삭제하지 않고 플래그 뒤에 보존돼 있습니다.

## Usage

0. Google로 로그인합니다 (첫 로그인 시 번역권 1편 자동 지급)
1. 영상 유형을 고르고 `.srt` 파일을 올립니다
2. 영화·드라마면 제목·연도·감독·포스터가 담긴 카드가 뜹니다. 틀리면 수정 후 재검색합니다
3. 도착어와 번역 스타일을 고르고 번역을 시작합니다
4. 완료 후 **다운로드** 버튼으로 `.ko.srt` 파일을 받습니다

## Project Structure

```text
proxy.ts                        # Supabase 세션 쿠키 갱신 (게이트 아님)
supabase/migrations/            # 크레딧·job 스키마 + 가입 시 1크레딧 트리거, 주문·정산
supabase/dev-seed.sql           # 개발용 크레딧 조작 스니펫 (프로덕션 금지)
app/
├── auth/callback/route.ts      # Google OAuth 코드 → 세션 쿠키
├── legal/page.tsx              # 환불 정책 + 전자상거래법 표시사항 (사업자 정보 TODO)
├── api/
│   ├── analyze/route.ts        # 파일명/자막 샘플 → 제목·연도 (로그인 필요)
│   ├── credits/route.ts        # 잔액 조회
│   ├── enrich/route.ts         # Google Search → 감독·톤·인물 지침 (로그인 필요)
│   ├── payments/prepare/       # 팩 → 주문 생성 (가격을 서버가 확정)
│   ├── payments/confirm/       # Toss successUrl — 승인 + 크레딧 지급 (멱등)
│   ├── payments/fail/          # Toss failUrl — 주문 종료
│   ├── summarize/route.ts      # 영화 아닌 영상의 내용 요약 (로그인 필요)
│   ├── tmdb/route.ts           # 포스터 조회 (TMDB 키, 로그인 불필요)
│   ├── translation/begin/      # 크레딧 1개 차감 + job 생성
│   └── translate/route.ts      # 청크 번역, SSE (job 검증)
├── components/simple/          # 위저드 스텝 (업로드/정보/진행/완료) + 충전
├── config/
│   ├── constants.ts            # 모델, 티어별 청킹, thinking, TMDB
│   ├── packs.ts                # 크레딧 팩 = 가격의 원본
│   └── languages.ts            # 도착어 (enabled 플래그로 확장)
├── hooks/
│   ├── useTranslation.ts       # 파일 처리, 청킹, 병렬 번역, 취소
│   └── useEnrich.ts            # 작품 정보 + 포스터 병렬 조회
├── i18n/simpleCopy.ts          # UI 문구 (하드코딩 금지)
├── lib/
│   ├── client/                 # SSE, API 요청, 병렬 실행 풀
│   ├── prompts/                # 프롬프트 로더·조합
│   ├── providers/              # Gemini provider
│   ├── server/                 # 요청 검증, SSE, 번역 서비스, TMDB, 토스 결제
│   └── srt.ts                  # 파싱, 청킹, 타임코드 재조립
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
   → UploadStep (.srt만)
   → useTranslation.processFile
        └── /api/analyze          제목·연도 추출
   → InfoStep (useEnrich)
        ├── /api/enrich           감독·톤·인물 지침 (Google Search)
        └── /api/tmdb             포스터                      ← 병렬
   → useTranslation.translate
        ├── /api/translation/begin  크레딧 1개 차감 → jobId (파일당 1회)
        ├── resolveTier()         청크 크기·동시성 (현재 항상 server)
        ├── chunkSrtBlocks        자막을 청크로 분할
        └── runOrderedPool        청크별 /api/translate 병렬 호출
             └── translateSubtitle
                  ├── composeTranslationPrompt   타임스탬프 제거, 번호+대사만 전송
                  ├── Gemini 호출 (청크당 1회)
                  └── reassembleTranslatedChunk  번호 대조 → 원본 타임코드 복원
   → DoneStep                     명시적 다운로드

[크레딧 소진 / 헤더의 잔액 클릭]
   → PurchaseStep                팩 선택
        ├── /api/payments/prepare   가격 확정 → orders 행 → orderId
        ├── 토스 결제창             카드·간편결제 (가상계좌 없음)
        └── /api/payments/confirm   승인 → settle_order → 크레딧 지급 (멱등)
             → /?purchase=done       배너 + 잔액 갱신
```

## Deploy

```bash
npm run build
vercel deploy
```

Vercel Project Settings → Environment Variables에 `TMDB_API_KEY`, `GOOGLE_GENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 추가합니다.

배포 도메인을 Supabase의 Redirect URLs(`https://<도메인>/auth/callback`)에도 등록해야 로그인이 돌아옵니다.

## License

라이선스 파일과 `package.json` 라이선스 필드가 아직 명시돼 있지 않습니다.

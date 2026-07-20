# ZAMAK

**v0.2.0 Beta**

SRT 자막을 Gemini로 번역하는 웹 애플리케이션입니다. 타임코드는 코드가 관리하고 AI는 대사만 다루는 구조라, 번역 결과가 원본 싱크를 그대로 유지합니다.

## Features

- **AI 자막 번역** — Gemini 3.5 Flash 단일 모델. 의미보존형(meaning)과 영화적(cinematic) 두 가지 스타일
- **키 입력 없이 바로 번역** — 모든 요청이 서버 키(`GOOGLE_GENAI_API_KEY`)로 동작합니다. 사용자가 API 키를 다루는 화면은 없습니다
- **Google 로그인 + 크레딧** — 가입 시 번역권 1편 자동 지급. 모델을 호출하는 모든 라우트가 로그인을 요구하고, 크레딧은 파일 단위로 차감됩니다
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

크레딧 1개 = 자막 파일 1개(최대 1,500블록). 가입 시 트리거가 1개를 자동 지급합니다.

**차감은 청크가 아니라 파일 단위입니다.** 영화 한 편은 청크 수십 개로 쪼개져 `/api/translate`를 여러 번 호출하므로, 요청마다 차감하면 한 편에 크레딧이 수십 개 날아갑니다. 그래서 번역 시작 시 `/api/translation/begin`이 **크레딧 1개를 차감하며 job을 하나 열고**, 이후 모든 청크 요청은 그 job id를 함께 보내 검증받습니다. 잔액 갱신과 job 생성은 하나의 SQL 함수 안에서 일어나므로 탭 두 개가 마지막 크레딧을 동시에 쓸 수 없습니다.

| 상황 | 응답 |
|---|---|
| 비로그인 | `401` — 모든 모델 라우트 |
| 크레딧 0 | `402 insufficient_credits` |
| 1,500블록 초과 | `413 file_too_large` |
| job이 없거나 만료(기본 60분) | `403 invalid_or_expired_job` |

> 결제가 아직 없으므로 크레딧을 다 쓰면 "준비 중" 안내에서 멈춥니다.

### 티어별 청크·동시성

번역 요청의 티어는 `resolveTier()` 한 곳에서 결정되고, 현재는 **무조건 `server`**입니다. 로그인/크레딧이 붙으면 이 함수 본문을 세션 조회로 교체하면 됩니다.

| | 청크 크기 | 동시성 | 근거 |
|---|---|---|---|
| server (현재 전원) | 200 | 14 | **잠정값** — 배포 플랜의 동시 실행 한도 조회 후 재산정 |
| free (현재 미사용) | 150 | 6 | Gemini 무료 등급 RPM 15에서 유도. 로그인 후 무료 티어용으로 보존 |

값의 유도 과정과 계산기는 [docs/tuning/](docs/tuning/)에 있습니다.

```bash
node scripts/chunk-model.mjs                    # 현재 파라미터로 비용·시간 표
node scripts/chunk-model.mjs N=1400 kmax=20     # 파라미터 오버라이드
```

### 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `TMDB_API_KEY` | — | **필수.** 포스터 조회 |
| `TMDB_LANGUAGE` | `ko-KR` | TMDB 메타데이터 언어 |
| `THINKING_LEVEL` | `MINIMAL` | `MINIMAL`\|`LOW`\|`MEDIUM`\|`HIGH`. thinking 토큰은 출력 단가(입력의 6배)로 요청마다 과금되는 최대 비용 레버입니다 |
| `NEXT_PUBLIC_FREE_CHUNK_SIZE` / `_FREE_CONCURRENCY` | 150 / 6 | 무료 티어 청킹 |
| `NEXT_PUBLIC_CHUNK_SIZE` / `NEXT_PUBLIC_CONCURRENCY` | 200 / 14 | 유료 티어 청킹 |
| `TRANSLATION_STRICT_MODE` | `false` | 아래 참조 |
| `GOOGLE_GENAI_API_KEY` | — | **필수.** analyze/enrich/summarize/translate 4개 라우트 전부가 이 키로 동작. grounding 때문에 결제 연결 프로젝트여야 함 |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | — | **필수.** 없으면 모델 라우트가 전부 500으로 닫힘 |
| `NEXT_PUBLIC_MAX_BLOCKS_PER_CREDIT` | 1500 | 크레딧 1개가 커버하는 자막 블록 수 |
| `JOB_VALIDITY_MINUTES` | 60 | 결제된 job이 유효한 시간 |

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
middleware.ts                   # Supabase 세션 쿠키 갱신 (게이트 아님)
supabase/migrations/            # 크레딧·job 스키마 + 가입 시 1크레딧 트리거
app/
├── auth/callback/route.ts      # Google OAuth 코드 → 세션 쿠키
├── api/
│   ├── analyze/route.ts        # 파일명/자막 샘플 → 제목·연도 (로그인 필요)
│   ├── credits/route.ts        # 잔액 조회
│   ├── enrich/route.ts         # Google Search → 감독·톤·인물 지침 (로그인 필요)
│   ├── summarize/route.ts      # 영화 아닌 영상의 내용 요약 (로그인 필요)
│   ├── tmdb/route.ts           # 포스터 조회 (TMDB 키, 로그인 불필요)
│   ├── translation/begin/      # 크레딧 1개 차감 + job 생성
│   └── translate/route.ts      # 청크 번역, SSE (job 검증)
├── components/simple/          # 위저드 스텝 (업로드/정보/진행/완료)
├── config/
│   ├── constants.ts            # 모델, 티어별 청킹, thinking, TMDB
│   └── languages.ts            # 도착어 (enabled 플래그로 확장)
├── hooks/
│   ├── useTranslation.ts       # 파일 처리, 청킹, 병렬 번역, 취소
│   └── useEnrich.ts            # 작품 정보 + 포스터 병렬 조회
├── i18n/simpleCopy.ts          # UI 문구 (하드코딩 금지)
├── lib/
│   ├── client/                 # SSE, API 요청, 병렬 실행 풀
│   ├── prompts/                # 프롬프트 로더·조합
│   ├── providers/              # Gemini provider
│   ├── server/                 # 요청 검증, SSE, 번역 서비스, TMDB
│   └── srt.ts                  # 파싱, 청킹, 타임코드 재조립
└── types/translation.ts
docs/tuning/                    # 청크 크기 산출 근거
prompts/
├── common/                     # 번역 규칙·철학·분석 프롬프트
└── gemini/adapter.txt
samples/subtitles/              # 튜닝용 샘플 자막 (.srt는 gitignore)
scripts/chunk-model.mjs         # 청크 크기 계산기
```

## Architecture

```text
[방문자] → SignInGate            Google 로그인 (가입 시 크레딧 1개 지급)
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
```

## Deploy

```bash
npm run build
vercel deploy
```

Vercel Project Settings → Environment Variables에 `TMDB_API_KEY`, `GOOGLE_GENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 추가합니다.

배포 도메인을 Supabase의 Redirect URLs(`https://<도메인>/auth/callback`)에도 등록해야 로그인이 돌아옵니다.

## License

라이선스 파일과 `package.json` 라이선스 필드가 아직 명시돼 있지 않습니다.

# SRT Translator Web

**v0.2.0 Beta**

AI 기반 SRT 자막 번역 웹 애플리케이션입니다. Gemini Flash 모델을 사용해 SRT 구조를 유지하면서 자막을 한국어 중심으로 번역합니다.

## Features

- **AI 자막 번역** — Gemini 3.5 Flash 모델로 의미보존형 번역
- **청크 기반 병렬 번역** — 200개 SRT 블록 단위로 나누고 최대 14개 청크를 병렬 처리
- **출력 복구 및 검증** — AI 응답에서 번역 본문만 추출하고 원본 SRT 번호·타임스탬프를 복원
- **블록 수 불일치 자동 복구** — 청크 번역 결과가 원본 블록 수와 다르면 재시도 후 원본 블록 단위로 fallback 번역
- **자동 메타데이터 분석** — 파일명과 자막 샘플로 제목·연도를 추출한 후 Google Search로 작품 정보를 자동 검색
- **작품 확인 플로우** — 검색된 제목/연도/감독을 확인하는 카드를 표시하고, 확인 시 톤·인물 말투 지침이 담긴 번역 컨텍스트를 자동 구성
- **실시간 진행률** — 완료된 청크 수 기준 진행바와 예상 남은 시간 표시
- **번역 취소** — 진행 중 취소 및 완료된 연속 청크의 부분 다운로드 지원
- **다국어 UI** — 한국어/영어 인터페이스 전환
- **다크 모드** — 시스템 설정 연동 및 수동 전환

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | Next.js (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript 5 |
| AI | Google Gemini API (`@google/genai`) — 번역·분석·검색 |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- Google Gemini API key

### Installation

```bash
git clone https://github.com/kaia-lee/srt-translator-web.git
cd srt-translator-web
npm install
```

`.env.local` 파일을 생성하고 API 키를 추가합니다:

```env
GOOGLE_GENAI_API_KEY=your_google_genai_api_key
```

개발 서버 실행:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## Configuration

주요 설정은 `app/config/constants.ts`에서 관리합니다.

```typescript
export const CHUNK_SIZE = 200;   // 청크당 자막 블록 수
export const CONCURRENCY = 14;   // 최대 동시 번역 청크 수

export const ALLOWED_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gpt-5.6-terra',
  'claude-sonnet-5',
] as const;

export const DEFAULT_MODEL = 'gemini-3.5-flash';
```

`NEXT_PUBLIC_CHUNK_SIZE` 환경변수로 청크 크기를 오버라이드할 수 있습니다.  
Gemini 번역 모델은 `thinkingLevel: "MEDIUM"` 설정으로 호출됩니다.

번역 출력 검증은 기본적으로 활성화됩니다. AI 응답 앞뒤에 붙은 안내 문장은
SRT 블록으로 세지 않으며, 원본과 번역 결과의 블록 수가 다르면 부분 파일을
다운로드하지 않고 재시도합니다. 청크 단위 재시도 후에도 블록 수가 맞지 않으면
원본 SRT 블록 단위로 나누어 다시 번역하고, 각 결과에 원본 번호와 타임스탬프를
복원합니다.

일시적으로 모델 응답을 그대로 반환해 원인을 확인하려면 서버 환경 변수에 아래를
설정한 뒤 서버를 재시작합니다. 이 모드에서는 블록 수와 SRT 형식을 보장하지 않습니다.

```env
TRANSLATION_OUTPUT_VALIDATION=false
```

## Usage

1. `.srt` 자막 파일을 업로드합니다.
2. 파일명과 자막 샘플에서 제목·연도가 자동 추출되고, Google Search로 작품 정보가 검색됩니다.
3. "이 영화가 맞나요?" 카드에서 제목·연도·감독을 확인합니다.
   - **Sì**: 검색된 번역 컨텍스트(톤·인물 말투 지침)를 확인하고 필요시 수정합니다.
   - **No**: 제목·연도를 수정하거나 추가 정보를 직접 입력한 후 재검색합니다.
4. **번역하기** 버튼을 누르면 Gemini Flash로 의미보존형 번역이 시작됩니다.
5. 번역이 끝나면 `.ko.meaning.srt` 형식의 파일이 자동 다운로드됩니다.

## Project Structure

```text
app/
├── api/
│   ├── analyze/route.ts            # 파일명/자막 샘플 → 제목·연도 추출
│   ├── enrich/route.ts             # Google Search로 작품 정보 검색 및 번역 컨텍스트 생성
│   └── translate/route.ts          # 청크 번역 API (SSE)
├── components/                     # 업로드, 폼, 진행률, 성공 모달
├── config/
│   └── constants.ts                # 모델, 청크, 동시성, 타이밍 설정
├── hooks/
│   ├── useTranslation.ts           # 파일 처리, 분석, 청크 번역, 취소
│   ├── useProgressDisplay.ts       # 진행률/남은 시간 표시 계산
│   └── useDarkMode.ts              # 다크 모드 토글
├── i18n/                           # 한국어/영어 UI 문구
├── lib/
│   ├── client/                     # SSE, API 요청, 병렬 실행 유틸
│   ├── prompts/                    # 프롬프트 로더/조합
│   ├── providers/                  # AI provider registry
│   ├── server/                     # 요청 검증, SSE, 번역 서비스
│   └── srt.ts                      # SRT 파싱, 청크, 출력 파일명 유틸
├── types/translation.ts
├── utils/
│   ├── downloadFile.ts
│   └── metadataInference.ts
├── layout.tsx
├── page.tsx
└── globals.css
prompts/
├── common/
│   ├── content_analysis.txt
│   ├── subtitle_translation.txt
│   ├── translation_rules_ko.txt
│   └── cinematic_translation_philosophy_ko.txt
├── gemini/adapter.txt
├── openai/adapter.txt
└── claude/adapter.txt
```

## Architecture

```text
[사용자]
  → page.tsx
  → useTranslation
      ├── /api/analyze
      │     → Gemini Flash Lite로 파일명/자막 샘플에서 제목·연도 추출
      ├── /api/enrich
      │     → Gemini Flash Lite + Google Search로 작품 정보 검색
      │     → 번역 컨텍스트(톤·인물 말투 지침) 자동 생성
      └── /api/translate
            → Gemini Flash로 청크 번역 (200블록 × 14 동시)
            → parseSrtBlocksByHeader로 블록 경계 파싱
            → 원본 SRT 번호·타임스탬프 복원
            → 블록 수 불일치 시 청크 재시도 후 블록 단위 fallback 번역
            → 완료된 청크 병합 후 파일 다운로드
```

## Deploy

Vercel에 배포:

```bash
npm run build
vercel deploy
```

Vercel Project Settings → Environment Variables에 필요한 키를 추가합니다.

```env
GOOGLE_GENAI_API_KEY=...
```

## License

현재 저장소에는 별도 라이선스 파일이나 `package.json` 라이선스 필드가 명시되어 있지 않습니다.

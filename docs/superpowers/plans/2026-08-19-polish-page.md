# 규칙 적용 페이지(`/polish`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 이미 한국어인 자막 파일을 올리면 표기 규칙을 적용해 원본 포맷 그대로 내려받는 `/polish` 페이지를 만든다. 번역은 하지 않는다.

**Architecture:** 클라이언트가 흐름을 소유한다 — 파싱 → `enforceTextRules` → 19자 초과 블록만 골라 `/api/polish`로 한 번 전송 → 결과를 번호로 제자리 교체 → `enforceTextRules` 재실행 → 다운로드. 서버는 인증·레이트리밋·모델 호출만 하는 얇은 라우트다. 타임코드를 건드리는 코드는 이 경로 어디에도 없다.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase(인증·레이트리밋), Gemini(`FLASH_MODEL`).

**설계 문서:** `docs/superpowers/specs/2026-08-19-polish-page-design.md`

## Global Constraints

- **화면 문구 하드코딩 금지** — 전부 `app/i18n/simpleCopy.ts`의 `COPY`에 둔다.
- **설정·상수는 `app/config/constants.ts` 한 곳**에만 둔다.
- **도착어는 한국어만 활성** — `getEnabledTargetLang`을 통과하지 못하면 던진다.
- **이 경로는 타임코드를 읽지도 쓰지도 않는다.** `adjustSubtitleTiming`을 부르지 않고, 모델이 뱉은 타임스탬프는 신뢰하지 않는다.
- **블록 수는 변하지 않는다.** 업로드 파싱 직후 고정되고, AI는 특정 번호의 본문만 교체한다.
- **검증 명령(모든 태스크의 커밋 전에 실행):**
  ```bash
  npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
  ```
- **`app/i18n/simpleCopy.test.ts`가 랜딩 카피 1건으로 이미 실패 중이다**(`드라마 한 편`). 이 계획과 무관한 기존 실패이므로, `vitest run`이 **그 1건만** 실패하면 정상이다. 다른 실패가 늘면 그건 이 작업이 만든 것이다.
- **커밋은 기능 단위로.** 각 태스크 = 1커밋.

---

## 배경: 왜 새로 만들 코드가 적은가

계획을 쓰면서 기존 코드를 확인한 결과, 설계 문서 §7이 "새로 만들어야 한다"고 본 병합 로직을 **`reassembleTranslatedChunk`가 이미 전부 수행한다**:

| 설계 §7 요구 | 이미 하는 곳 |
|---|---|
| 받은 번호가 보낸 번호의 부분집합인지 검증 | `indexTranslatedBodies(output, expected)` — `expected.has(candidate)`가 아니면 버림 |
| 빠진 번호 → 원문 유지 | `reassembleTranslatedChunk`의 `unmatchedIndices` 경로 |
| `\|` → 줄바꿈 | `indexTranslatedBodies`의 `part.split(LINE_BREAK_MARK)` |
| 모델 타임스탬프 불신 | `TIMING_LINE.test(...)` 두 곳에서 버림 |
| 타임코드는 원본에서 | `block.sequenceLine` / `block.timingLine`을 그대로 씀 |

**핵심 통찰:** `reassembleTranslatedChunk`는 "연속된 청크"를 요구하지 않는다. `parseSrtBlocks`는 빈 줄로 나눌 뿐이고 번호가 연속일 필요가 없다. 따라서 **초과 블록만 원래 번호·타임코드째로 뽑아 SRT처럼 이어 붙이면 그게 곧 유효한 청크**이고, 기존 함수가 그대로 돈다.

그래서 새로 만들 순수 함수는 **둘뿐**이다: 초과 블록을 뽑는 것(`collectOverLongBlocks`)과 결과를 제자리에 되돌리는 것(`spliceBlocks`).

---

## 파일 구조

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `app/lib/polish.ts` | 초과 블록 수집 · 제자리 교체. 순수 함수만 |
| `app/lib/polish.test.ts` | 위의 테스트 |
| `prompts/common/line_split_ko.txt` | 줄바꿈 전용 프롬프트 |
| `app/lib/prompts/lineSplit.ts` | 위 프롬프트 로드 + `{{lineMaxChars}}` 렌더 |
| `app/lib/prompts/lineSplit.test.ts` | 렌더 결과 검증 |
| `app/lib/server/polishService.ts` | 청크 분할 + 모델 호출 + 병합 |
| `app/api/polish/route.ts` | 인증 · 레이트리밋 · 서비스 호출 |
| `app/lib/client/polishApi.ts` | `/api/polish` 호출 래퍼 |
| `app/hooks/usePolish.ts` | 전체 흐름 오케스트레이션 |
| `app/components/polish/PolishUploadStep.tsx` | 파일 드롭 |
| `app/components/polish/PolishDoneStep.tsx` | 요약 + 다운로드 |
| `app/polish/page.tsx` | 라우트 + 로그인 게이트 |

**수정하는 것**

| 파일 | 무엇을 |
|---|---|
| `app/lib/srt.ts` | `visibleLength` export (지금은 모듈 내부 전용) |
| `app/lib/downloads.ts` (신규) | `useTranslation.ts`의 `buildDownloads`를 옮겨 공유 |
| `app/hooks/useTranslation.ts` | 위 이동에 따른 import 교체 |
| `app/config/constants.ts` | `RATE_LIMITS.polish`, `POLISH_CHUNK_SIZE` |
| `app/i18n/simpleCopy.ts` | `COPY.polish` |
| `app/components/beta/AppNav.tsx` | `/polish` 링크 |
| `docs/translation-pipeline.md`, `docs/TODO.md`, `docs/decisions.md` | 문서 지도 |

---

### Task 1: 순수 함수 — 초과 블록 수집과 제자리 교체

**Files:**
- Modify: `app/lib/srt.ts:369` (`visibleLength`에 `export` 추가)
- Create: `app/lib/polish.ts`
- Test: `app/lib/polish.test.ts`

**Interfaces:**
- Consumes: `parseSrtBlocks`, `parseBlockTiming`, `readBlockIndex`, `visibleLength` (전부 `app/lib/srt.ts`)
- Produces:
  - `interface OverLongCollection { subset: string; indices: number[] }`
  - `collectOverLongBlocks(srt: string, lineMaxChars: number): OverLongCollection`
  - `spliceBlocks(fullSrt: string, rebuiltSubset: string): string`

- [ ] **Step 1: `visibleLength`를 export한다**

`app/lib/srt.ts`의 369행:

```ts
/** Visible characters — markup does not occupy space on screen. */
export function visibleLength(line: string): number {
  return line.replace(MARKUP_TAG, '').trim().length;
}
```

`function` 앞에 `export`만 붙인다. 본문은 건드리지 않는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`app/lib/polish.test.ts`를 새로 만든다:

```ts
import { describe, expect, it } from 'vitest';
import { collectOverLongBlocks, spliceBlocks } from './polish';
import { parseSrtBlocks } from './srt';

const block = (n: number, body: string) =>
  `${n}\n00:00:0${n},000 --> 00:00:0${n},900\n${body}`;

describe('collectOverLongBlocks', () => {
  it('19자를 넘는 줄이 있는 블록만 고른다', () => {
    const srt = [
      block(1, '짧은 줄'),
      block(2, '스무 글자가 넘어가는 아주 기다란 자막 한 줄'),
      block(3, '이것도 짧다'),
    ].join('\n\n');

    const { subset, indices } = collectOverLongBlocks(srt, 19);

    expect(indices).toEqual([2]);
    expect(parseSrtBlocks(subset)).toHaveLength(1);
    expect(subset).toContain('00:00:02,000 --> 00:00:02,900');
  });

  it('두 줄 중 한 줄만 넘어도 고른다', () => {
    const srt = block(1, '짧은 줄\n스무 글자가 넘어가는 아주 기다란 자막 한 줄');
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([1]);
  });

  it('길이는 마크업을 뺀 글자 수로 잰다', () => {
    const srt = block(1, `<i>${'가'.repeat(19)}</i>`);
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([]);
  });

  it('초과가 없으면 빈 결과를 준다', () => {
    const srt = [block(1, '짧다'), block(2, '이것도')].join('\n\n');
    expect(collectOverLongBlocks(srt, 19)).toEqual({ subset: '', indices: [] });
  });

  it('타임코드가 없는 블록은 건너뛴다', () => {
    const srt = `1\n망가진 헤더\n${'가'.repeat(30)}`;
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([]);
  });
});

describe('spliceBlocks', () => {
  const full = [block(1, '하나'), block(2, '둘'), block(3, '셋')].join('\n\n');

  it('번호가 같은 블록만 갈아끼운다', () => {
    const rebuilt = block(2, '둘\n나뉜 줄');
    const result = spliceBlocks(full, rebuilt);

    expect(result).toContain('둘\n나뉜 줄');
    expect(result).toContain('하나');
    expect(result).toContain('셋');
  });

  it('무슨 입력이 와도 블록 수가 변하지 않는다', () => {
    for (const rebuilt of [
      '',
      block(2, '바뀐 본문'),
      block(99, '없는 번호'),
      [block(1, 'A'), block(2, 'B'), block(3, 'C')].join('\n\n'),
      '쓰레기 입력',
    ]) {
      expect(parseSrtBlocks(spliceBlocks(full, rebuilt))).toHaveLength(3);
    }
  });

  it('모르는 번호는 무시한다', () => {
    expect(spliceBlocks(full, block(99, '유령'))).toBe(full);
  });

  it('타임코드는 원본 그대로 남는다', () => {
    const result = spliceBlocks(full, block(2, '바뀐 본문'));
    expect(result).toContain('00:00:02,000 --> 00:00:02,900');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

```bash
npx vitest run app/lib/polish.test.ts
```

기대: `Failed to resolve import "./polish"` 로 실패.

- [ ] **Step 4: 최소 구현을 쓴다**

`app/lib/polish.ts`를 새로 만든다:

```ts
import {
  parseBlockTiming,
  parseSrtBlocks,
  readBlockIndex,
  visibleLength,
} from './srt';

export interface OverLongCollection {
  /**
   * 초과 블록만 담은, 그 자체로 유효한 SRT. 원본의 번호와 타임코드를 그대로
   * 들고 온다 — 그래서 `reassembleTranslatedChunk`가 이것을 평범한 청크로
   * 취급할 수 있다. 번호가 연속이 아니어도 상관없다(`parseSrtBlocks`는 빈
   * 줄로만 나눈다).
   */
  subset: string;
  /** 위 블록들의 번호, 파일 순서대로. */
  indices: number[];
}

/**
 * 한 줄이라도 `lineMaxChars`를 넘는 블록을 골라낸다.
 *
 * 이 함수가 AI에 보낼 대상을 정한다 — 실측(1,126블록)에서 19자 초과는 3.8%였고,
 * ZAMAK이 번역한 결과를 다시 넣으면 대개 0건이다. 그때 호출부는 모델을 아예
 * 부르지 않는다.
 *
 * 타임코드가 없거나 번호를 못 읽는 블록은 건너뛴다 — 되돌려 놓을 주소가 없으므로
 * 보내봐야 결과를 제자리에 꽂을 수 없다.
 */
export function collectOverLongBlocks(
  srt: string,
  lineMaxChars: number,
): OverLongCollection {
  const subset: string[] = [];
  const indices: number[] = [];

  for (const raw of parseSrtBlocks(srt)) {
    if (!parseBlockTiming(raw)) continue;

    const index = readBlockIndex(raw);
    if (index === null) continue;

    const body = raw.split('\n').slice(2);
    if (!body.some((line) => visibleLength(line) > lineMaxChars)) continue;

    subset.push(raw);
    indices.push(index);
  }

  return { subset: subset.join('\n\n'), indices };
}

/**
 * 재조립된 부분집합을 전체 파일의 제자리에 되돌린다.
 *
 * **블록 수 보존이 구조적으로 보장된다**: 전체를 `map`으로 훑으며 번호가 일치할
 * 때만 통째로 갈아끼우므로, 블록을 더하거나 뺄 경로 자체가 없다. `rebuiltSubset`이
 * 쓰레기여도 최악의 결과는 "아무것도 안 바뀜"이다.
 */
export function spliceBlocks(fullSrt: string, rebuiltSubset: string): string {
  const replacements = new Map<number, string>();
  for (const raw of parseSrtBlocks(rebuiltSubset)) {
    const index = readBlockIndex(raw);
    if (index !== null) replacements.set(index, raw);
  }

  if (replacements.size === 0) return fullSrt;

  return parseSrtBlocks(fullSrt)
    .map((raw) => {
      const index = readBlockIndex(raw);
      if (index === null) return raw;
      return replacements.get(index) ?? raw;
    })
    .join('\n\n');
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
npx vitest run app/lib/polish.test.ts
```

기대: 9건 전부 PASS.

- [ ] **Step 6: 전체 검증 후 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

기대: `simpleCopy.test.ts`의 기존 1건만 실패.

```bash
git add app/lib/polish.ts app/lib/polish.test.ts app/lib/srt.ts
git commit -m "규칙 적용: 초과 블록 수집과 제자리 교체 순수 함수를 추가한다"
```

---

### Task 2: 줄바꿈 전용 프롬프트

**Files:**
- Create: `prompts/common/line_split_ko.txt`
- Create: `app/lib/prompts/lineSplit.ts`
- Modify: `app/lib/prompts/loader.ts` (로더 함수 추가)
- Test: `app/lib/prompts/lineSplit.test.ts`

**Interfaces:**
- Consumes: `loadPromptFile`(loader 내부), `renderPromptTemplate`, `getEnabledTargetLang`
- Produces: `composeLineSplitPrompt(targetLanguage: string): Promise<string>`

- [ ] **Step 1: 프롬프트 파일을 쓴다**

`prompts/common/line_split_ko.txt`:

```
너는 한국어 자막의 줄바꿈만 담당한다. 번역하지 마.

입력은 `[번호] 대사` 줄이다. 받은 번호마다 같은 형식으로 정확히 한 줄을 출력해.

1. 한 줄이 {{lineMaxChars}}자(공백·문장부호 포함)를 넘으면 `|` 하나로 나눠(최대 2줄).
   되도록 16자 안에 들어오게 끊되, 뜻이 이어지는 자리를 골라.
2. 낱말이나 어절 중간에서 끊지 마. 조사는 앞말에 붙여 둬.
3. 나누고도 넘치면 뜻을 지킨 채 줄여. 정보를 빼거나 더하지 마.
4. 화자가 둘이면 `- A | - B`.
5. HTML·자막 태그는 위치와 짝을 그대로 유지해.
6. 번호를 바꾸거나 빠뜨리지 마. 타임스탬프·설명·마크다운 금지.
```

- [ ] **Step 2: 로더에 함수를 추가한다**

`app/lib/prompts/loader.ts`의 `loadTranslationRules` 바로 아래에 넣는다:

```ts
/**
 * 줄바꿈 전용 규칙 (`/api/polish`). 번역 규칙과 따로 두는 이유는
 * `translation_rules_*`를 재사용하면 의역·존댓말·태그 보존 같은 번역 지시가
 * 통째로 딸려오기 때문이다 — 이 경로가 필요한 것은 분할 조항 하나뿐이다.
 * `{{lineMaxChars}}` 자리는 호출부가 languages.ts에서 렌더한다.
 */
export function loadLineSplitRules(
  language: TargetLangCode,
): Promise<string> {
  return loadPromptFile(`common/line_split_${language}.txt`);
}
```

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`app/lib/prompts/lineSplit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { composeLineSplitPrompt } from './lineSplit';

describe('composeLineSplitPrompt', () => {
  it('한국어의 lineMaxChars(19)를 렌더한다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).toContain('19자');
  });

  it('렌더되지 않은 자리표시자를 남기지 않는다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).not.toContain('{{');
  });

  it('번역 지시를 담지 않는다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).toContain('번역하지 마');
    expect(prompt).not.toContain('존댓말');
  });

  it('활성화되지 않은 도착어는 던진다', async () => {
    await expect(composeLineSplitPrompt('xx')).rejects.toThrow(
      'Unsupported target language: xx',
    );
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

```bash
npx vitest run app/lib/prompts/lineSplit.test.ts
```

기대: `Failed to resolve import "./lineSplit"` 로 실패.

- [ ] **Step 5: 조합 함수를 쓴다**

`app/lib/prompts/lineSplit.ts`:

```ts
import { loadLineSplitRules } from './loader';
import { renderPromptTemplate } from './renderer';
import { getEnabledTargetLang } from '../../config/languages';

/**
 * `/api/polish`가 시스템 인스트럭션으로 보내는 문자열.
 *
 * `buildTranslationRules`와 같은 자리에서 `{{lineMaxChars}}`를 렌더한다 —
 * 프롬프트가 19자를 말하고 코드가 다른 수로 판정하면 모델은 영영 못 맞춘다.
 */
export async function composeLineSplitPrompt(
  targetLanguage: string,
): Promise<string> {
  const lang = getEnabledTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  const template = await loadLineSplitRules(lang.code);
  return renderPromptTemplate(template, {
    lineMaxChars: String(lang.lineMaxChars),
  });
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
npx vitest run app/lib/prompts/lineSplit.test.ts
```

기대: 4건 PASS.

- [ ] **Step 7: 전체 검증 후 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
git add prompts/common/line_split_ko.txt app/lib/prompts/lineSplit.ts app/lib/prompts/lineSplit.test.ts app/lib/prompts/loader.ts
git commit -m "규칙 적용: 줄바꿈 전용 프롬프트를 추가한다"
```

---

### Task 3: 서버 — 서비스와 라우트

**Files:**
- Modify: `app/config/constants.ts` (`RATE_LIMITS.polish`, `POLISH_CHUNK_SIZE`)
- Create: `app/lib/server/polishService.ts`
- Create: `app/api/polish/route.ts`

**Interfaces:**
- Consumes: `composeLineSplitPrompt` (Task 2), `geminiProvider`, `chunkSrtBlocks`, `parseSrtBlocks`, `reassembleTranslatedChunk`, `formatBlocksForModel`, `runOrderedPool`, `requireUser`, `enforceRateLimit`, `reportServerError`
- Produces:
  - `interface PolishServiceResult { content: string; totalChunks: number; failedChunks: number }`
  - `splitLongLines(subset: string, targetLanguage: string): Promise<PolishServiceResult>`
  - `POST /api/polish` — 요청 `{ subset: string; targetLang: string }`, 응답 `{ content: string; totalChunks: number; failedChunks: number }`

- [ ] **Step 1: 상수를 추가한다**

`app/config/constants.ts`의 `RATE_LIMITS`에 버킷 한 줄을 더한다:

```ts
export const RATE_LIMITS = {
  /** /api/analyze, /api/summarize, /api/enrich — flash-lite and TMDB. */
  aux: { limit: 20, windowSeconds: 60 },
  /** /api/glossary — full-file scan, opt-in, once per file. */
  glossary: { limit: 5, windowSeconds: 60 },
  /**
   * /api/polish — 규칙 적용. 크레딧을 안 쓰므로 **이 한도가 유일한 천장이다.**
   * 한 파일 = 한 요청이라(초과 줄을 한 번에 보낸다) 하루 5회 = 파일 5개.
   */
  polish: { limit: 5, windowSeconds: 86_400 },
} as const;
```

같은 파일의 `SERVER_CHUNK_SIZE` 근처에 추가한다:

```ts
/**
 * `/api/polish`가 한 번에 모델에 보내는 블록 수.
 *
 * 번역보다 작게 잡는다: 입력이 이미 한국어라 블록당 토큰이 무겁고, 출력도
 * 한국어다. 대부분의 파일은 초과 줄이 3.8%뿐이라 청크 하나로 끝나지만, 줄바꿈이
 * 아예 없는 자막(자동 생성물에 흔하다)은 전 블록이 초과라 여기서 갈린다.
 */
export const POLISH_CHUNK_SIZE = 150;
```

- [ ] **Step 2: 서비스를 쓴다**

`app/lib/server/polishService.ts`:

```ts
import 'server-only';

import { geminiProvider } from '../providers/gemini';
import { composeLineSplitPrompt } from '../prompts/lineSplit';
import {
  chunkSrtBlocks,
  formatBlocksForModel,
  parseSrtBlocks,
  reassembleTranslatedChunk,
} from '../srt';
import { runOrderedPool } from '../client/concurrency';
import {
  FLASH_MODEL,
  POLISH_CHUNK_SIZE,
  SERVER_CONCURRENCY,
} from '../../config/constants';

export interface PolishServiceResult {
  /** 재조립된 SRT. 실패한 청크의 블록은 원문 그대로 들어 있다. */
  content: string;
  totalChunks: number;
  failedChunks: number;
}

/**
 * 상한을 넘는 줄을 의미 단위로 나눈다.
 *
 * 입력 `subset`은 `collectOverLongBlocks`가 만든, 원본 번호·타임코드를 그대로
 * 든 SRT다. 번호가 연속이 아니어도 `reassembleTranslatedChunk`가 정상 동작한다 —
 * 그 함수는 위치가 아니라 번호로 대조하고, 모델이 모르는 번호를 뱉으면
 * `expected` 집합이 걸러낸다.
 *
 * 청크 하나가 실패하면 **그 청크만 버린다.** 해당 블록들은 원문을 유지하고
 * 나머지는 정상 처리된다 — 규칙 적용은 개선이지 필수 변환이 아니라서, 일부가
 * 안 나뉘어도 결과물은 여전히 정상 자막이다. (번역은 실패하면 그 구간이
 * 외국어로 남아 못 쓰지만, 여기는 원문이 이미 한국어다.)
 */
export async function splitLongLines(
  subset: string,
  targetLanguage: string,
): Promise<PolishServiceResult> {
  const blocks = parseSrtBlocks(subset);
  if (blocks.length === 0) {
    return { content: '', totalChunks: 0, failedChunks: 0 };
  }

  const systemInstruction = await composeLineSplitPrompt(targetLanguage);
  const chunks = chunkSrtBlocks(blocks, POLISH_CHUNK_SIZE);

  const results = await runOrderedPool<string, string>({
    items: chunks,
    concurrency: SERVER_CONCURRENCY,
    worker: async (chunk) => {
      const { text } = await geminiProvider.generateText({
        model: FLASH_MODEL,
        prompt: formatBlocksForModel(chunk),
        translationMode: 'chunk',
        systemInstruction,
      });
      return reassembleTranslatedChunk(chunk, text).content;
    },
  });

  let failedChunks = 0;
  const rebuilt = results.map((result, index) => {
    if (result !== undefined) return result;
    failedChunks++;
    // 원문 유지 — 이 청크의 블록들은 안 나뉜 채로 나간다.
    return chunks[index];
  });

  return {
    content: rebuilt.join('\n\n'),
    totalChunks: chunks.length,
    failedChunks,
  };
}
```

> `runOrderedPool`의 worker가 던지면 그 자리는 `undefined`로 남는다. 위 `map`이
> 그걸 원문으로 되돌리는 지점이다.

- [ ] **Step 3: 라우트를 쓴다**

`app/api/polish/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import { splitLongLines } from '../../lib/server/polishService';
import { parseSrtBlocks } from '../../lib/srt';
import { MAX_BLOCKS_PER_CREDIT, FLASH_MODEL } from '../../config/constants';

export const maxDuration = 300;

interface PolishRequest {
  subset: string;
  targetLang: string;
}

export async function POST(request: NextRequest) {
  // 진짜 벽. 익명 인터넷과 우리 Gemini 요금 사이는 여기서 닫힌다.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // 크레딧을 안 쓰는 라우트라 이 한도가 유일한 천장이다. `/api/glossary`와 같은
  // 조건(무료 + AI)이므로 같은 배선을 쓴다. requireUser 다음이어야 한다 —
  // 카운터가 auth.uid()로 매겨진다.
  const limited = await enforceRateLimit('polish');
  if (!limited.ok) return limited.response;

  if (!process.env.GOOGLE_GENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 },
    );
  }

  let body: PolishRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.subset !== 'string' || typeof body.targetLang !== 'string') {
    return NextResponse.json(
      { error: 'subset and targetLang are required' },
      { status: 400 },
    );
  }

  // 업로드 화면이 이미 막지만, 라우트는 직접 호출될 수 있으므로 여기서도 센다.
  if (parseSrtBlocks(body.subset).length > MAX_BLOCKS_PER_CREDIT) {
    return NextResponse.json(
      { error: 'file_too_large', code: 'file_too_large' },
      { status: 413 },
    );
  }

  try {
    const result = await splitLongLines(body.subset, body.targetLang);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Polish failed:', error);
    await reportServerError({
      userId: auth.user.id,
      route: '/api/polish',
      error,
      status: 500,
      detail: { model: FLASH_MODEL },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Polish failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit && npx eslint app
```

기대: 오류 없음. (라우트에는 단위 테스트가 없다 — 이 리포에 API 라우트 테스트가 하나도 없어서 관례를 따른다. 실제 동작은 Task 5에서 화면으로 확인한다.)

- [ ] **Step 5: 전체 검증 후 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
git add app/config/constants.ts app/lib/server/polishService.ts app/api/polish/route.ts
git commit -m "규칙 적용: /api/polish 라우트와 서비스를 추가한다"
```

---

### Task 4: 다운로드 빌더를 공유 모듈로 옮긴다

`buildDownloads`는 지금 `useTranslation.ts` 안의 비공개 함수다. `/polish`도 같은
것이 필요한데, 훅에서 import하는 건 방향이 틀렸다(훅은 상태를 들고 있고 이 함수는
순수하다). 라이브러리로 옮긴다.

**Files:**
- Create: `app/lib/downloads.ts`
- Modify: `app/hooks/useTranslation.ts:133-163` (함수 제거 + import 추가)

**Interfaces:**
- Produces: `buildDownloads(doc: SubtitleDoc | null, originalName: string, targetLang: string, translatedSrt: string): DownloadOption[]`

- [ ] **Step 1: 새 모듈을 만든다**

`app/lib/downloads.ts` — `useTranslation.ts:133-163`의 함수를 **그대로** 옮기고
import만 새로 단다:

```ts
import { buildOutputFilename } from './srt';
import {
  emitInOriginalFormat,
  formatExtension,
  subtitleMime,
  type SubtitleDoc,
} from './subtitles';
import type { DownloadOption } from '../types/translation';

/**
 * 내려받을 파일 목록. 원본 포맷을 되돌릴 수 있으면 그것을 먼저, `.srt`를 뒤에
 * 둔다. 라운드트립이 실패하면 조용히 SRT만 준다 — 다운로드 자체가 막히는 것보다
 * 낫다.
 *
 * `useTranslation`에서 옮겨 왔다(2026-08-19): `/polish`도 같은 것을 쓰는데
 * 훅에서 가져오는 건 방향이 틀렸다. 순수 함수이므로 라이브러리에 산다.
 */
export function buildDownloads(
  doc: SubtitleDoc | null,
  originalName: string,
  targetLang: string,
  translatedSrt: string,
): DownloadOption[] {
  const asSrt: DownloadOption = {
    extension: 'srt',
    filename: buildOutputFilename(originalName, targetLang, 'srt'),
    content: translatedSrt,
    mime: subtitleMime('srt'),
  };
  if (!doc || doc.format === 'srt' || !doc.roundTrip) return [asSrt];

  try {
    const extension = formatExtension(doc.format);
    return [
      {
        extension,
        filename: buildOutputFilename(originalName, targetLang, extension),
        content: emitInOriginalFormat(doc, translatedSrt),
        mime: subtitleMime(doc.format),
      },
      asSrt,
    ];
  } catch (err) {
    console.error('[translate] round-trip failed, offering SRT only', err);
    return [asSrt];
  }
}
```

- [ ] **Step 2: `useTranslation.ts`에서 함수를 지우고 import한다**

`app/hooks/useTranslation.ts`의 133~163행(`function buildDownloads` 전체)을 삭제하고,
import 블록에 추가한다:

```ts
import { buildDownloads } from '../lib/downloads';
```

`buildOutputFilename`·`emitInOriginalFormat`·`formatExtension`·`subtitleMime`·
`SubtitleDoc`·`DownloadOption`이 이제 이 파일에서 안 쓰이면 `eslint`가 알려준다 —
쓰이지 않는 것만 import에서 뺀다.

- [ ] **Step 3: 기존 테스트가 그대로 통과하는지 확인한다**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
```

기대: 동작이 바뀌지 않았으므로 `simpleCopy.test.ts` 1건 외에는 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add app/lib/downloads.ts app/hooks/useTranslation.ts
git commit -m "buildDownloads를 lib으로 옮긴다 — /polish와 공유하기 위해"
```

---

### Task 5: 클라이언트 흐름 — API 래퍼와 훅

**Files:**
- Create: `app/lib/client/polishApi.ts`
- Create: `app/hooks/usePolish.ts`

**Interfaces:**
- Consumes: `collectOverLongBlocks`, `spliceBlocks` (Task 1), `buildDownloads` (Task 4), `POST /api/polish` (Task 3), `enforceTextRules`, `loadSubtitleFile`, `resolveTargetLang`
- Produces:
  - `requestLineSplit(subset: string, targetLang: string, signal?: AbortSignal): Promise<PolishResponse>`
  - `interface PolishSummary { linesSplit: number; punctuationStripped: number; linesMerged: number; ellipsisNormalized: number; linesJoined: number; speakerLinesSplit: number; midLinePeriodsToCommas: number; unsplitLines: number }`
  - `usePolish()` — `{ stage, error, summary, downloads, handleFile, reset }`

- [ ] **Step 1: API 래퍼를 쓴다**

`app/lib/client/polishApi.ts`:

```ts
export interface PolishResponse {
  content: string;
  totalChunks: number;
  failedChunks: number;
}

export class PolishRefusedError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'PolishRefusedError';
  }
}

/**
 * 초과 줄만 담긴 SRT를 한 번에 보낸다.
 *
 * **파일 하나 = 요청 하나**인 것이 중요하다: 레이트 리밋이 요청 단위로 세므로,
 * 청크마다 요청을 쪼개면 "하루 5회"가 "하루 파일 1~2개"로 줄어든다. 청크 분할은
 * 서버가 안에서 한다(`polishService`).
 */
export async function requestLineSplit(
  subset: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<PolishResponse> {
  const response = await fetch('/api/polish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subset, targetLang }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new PolishRefusedError(
      typeof body.code === 'string' ? body.code : String(response.status),
      typeof body.retry_after === 'number' ? body.retry_after : undefined,
    );
  }

  return response.json();
}
```

- [ ] **Step 2: 훅을 쓴다**

`app/hooks/usePolish.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';
import { collectOverLongBlocks, spliceBlocks } from '../lib/polish';
import { buildDownloads } from '../lib/downloads';
import { enforceTextRules, type TextRuleReport } from '../lib/srt';
import { loadSubtitleFile } from '../lib/subtitles';
import { resolveTargetLang } from '../config/languages';
import { requestLineSplit, PolishRefusedError } from '../lib/client/polishApi';
import type { DownloadOption } from '../types/translation';
import type { SubtitleDoc } from '../lib/subtitles';
import { COPY } from '../i18n/simpleCopy';

const TARGET_LANG = 'ko';

export type PolishStage = 'idle' | 'working' | 'done' | 'error';

export interface PolishSummary {
  /** AI가 실제로 나눈 블록 수. */
  linesSplit: number;
  /** 상한을 넘었지만 끝내 안 나뉜 블록 수(청크 실패 등). */
  unsplitLines: number;
  ellipsisNormalized: number;
  linesMerged: number;
  trailingPunctuationStripped: number;
  linesJoined: number;
  midLinePeriodsToCommas: number;
  speakerLinesSplit: number;
}

function addReports(a: TextRuleReport, b: TextRuleReport): TextRuleReport {
  return {
    ellipsisNormalized: a.ellipsisNormalized + b.ellipsisNormalized,
    linesMerged: a.linesMerged + b.linesMerged,
    trailingPunctuationStripped:
      a.trailingPunctuationStripped + b.trailingPunctuationStripped,
    linesJoined: a.linesJoined + b.linesJoined,
    midLinePeriodsToCommas: a.midLinePeriodsToCommas + b.midLinePeriodsToCommas,
    speakerLinesSplit: a.speakerLinesSplit + b.speakerLinesSplit,
  };
}

/**
 * `/polish`의 전체 흐름.
 *
 * 타임코드를 건드리는 단계가 하나도 없다 — `adjustSubtitleTiming`을 부르지
 * 않으므로 타임코드는 1번 파싱에서 마지막 다운로드까지 그대로 흐른다.
 */
export function usePolish() {
  const [stage, setStage] = useState<PolishStage>('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [downloads, setDownloads] = useState<DownloadOption[]>([]);

  const reset = useCallback(() => {
    setStage('idle');
    setError('');
    setSummary(null);
    setDownloads([]);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setStage('working');
    setError('');

    try {
      // 1. 어떤 포맷이든 정규 SRT로.
      let doc: SubtitleDoc;
      try {
        doc = await loadSubtitleFile(file);
      } catch {
        setError(COPY.upload.invalidFile);
        setStage('error');
        return;
      }

      const lang = resolveTargetLang(TARGET_LANG);
      const ruleOptions = {
        trailingPunctuation: lang.trailingPunctuation,
        lineMaxChars: lang.lineMaxChars,
        ellipsis: lang.ellipsis,
      };

      // 2. 1차 규칙 — 코드가 결정적으로 처리하는 전부.
      const first = enforceTextRules(doc.srt, ruleOptions);

      // 3. 상한을 넘는 블록만 고른다.
      const { subset, indices } = collectOverLongBlocks(
        first.content,
        lang.lineMaxChars,
      );

      // 4. 초과가 없으면 모델을 아예 안 부른다 — 비용 0, 즉시 완료.
      let merged = first.content;
      let unsplitLines = 0;

      if (indices.length > 0) {
        const response = await requestLineSplit(subset, TARGET_LANG);
        merged = spliceBlocks(first.content, response.content);
        // 실패한 청크의 블록은 원문 그대로 나갔다. 정직하게 센다.
        unsplitLines = collectOverLongBlocks(merged, lang.lineMaxChars).indices
          .length;
      }

      // 5. 2차 규칙 — AI가 나눈 결과에 2줄 상한·접기·마침표를 다시 적용.
      const second = enforceTextRules(merged, ruleOptions);
      const totals = addReports(first.report, second.report);

      setSummary({
        ...totals,
        linesSplit: indices.length - unsplitLines,
        unsplitLines,
      });
      setDownloads(
        buildDownloads(doc, file.name, TARGET_LANG, second.content),
      );
      setStage('done');
    } catch (err) {
      if (err instanceof PolishRefusedError) {
        setError(
          err.code === 'file_too_large'
            ? COPY.polish.tooLarge
            : COPY.polish.limitReached,
        );
      } else {
        setError(COPY.polish.failed);
      }
      setStage('error');
    }
  }, []);

  return { stage, error, summary, downloads, handleFile, reset };
}
```

- [ ] **Step 3: 타입을 확인한다**

```bash
npx tsc --noEmit
```

기대: `COPY.polish`가 아직 없으므로 **그 항목만** 오류. Task 6에서 추가한다.
`app/lib/polish.ts`·`app/lib/downloads.ts`·`polishApi.ts` 관련 오류는 없어야 한다.

- [ ] **Step 4: 커밋 (Task 6과 함께 검증되므로 여기서는 타입 오류를 남긴 채 커밋하지 않는다)**

이 태스크는 Task 6과 한 커밋으로 묶는다 — `COPY.polish` 없이는 타입이 통과하지
않으므로 독립적으로 커밋할 수 없다. Task 6의 마지막 단계에서 함께 커밋한다.

---

### Task 6: 화면 · 카피 · 진입점

**Files:**
- Modify: `app/i18n/simpleCopy.ts` (`COPY.polish`)
- Create: `app/components/polish/PolishUploadStep.tsx`
- Create: `app/components/polish/PolishDoneStep.tsx`
- Create: `app/polish/page.tsx`
- Modify: `app/components/beta/AppNav.tsx`

**Interfaces:**
- Consumes: `usePolish` (Task 5), `useAuth`, `AppNav`, `SiteFooter`

- [ ] **Step 1: 카피를 추가한다**

`app/i18n/simpleCopy.ts`의 `credits` 블록 뒤에 넣는다:

```ts
  // 규칙 적용 페이지(/polish). 번역 없이 표기 규칙만 적용하는 경로 —
  // 타임코드는 건드리지 않는다(decisions.md / specs/2026-08-19-polish-page-design.md).
  polish: {
    navLink: '규칙 적용',
    title: '자막 규칙 적용',
    sub: '이미 번역된 한국어 자막을 방송 표기 규칙에 맞게 다듬어 드립니다.\n번역은 하지 않고, 타임코드도 손대지 않습니다.',
    dropHint: 'SRT · VTT · ASS · SMI 파일을 올려주세요',
    working: '규칙을 적용하는 중…',
    doneTitle: '규칙을 적용했습니다',
    /** 요약 한 줄. 0인 항목은 호출부가 걸러낸다. */
    summary: (parts: string[]) => parts.join(' · '),
    countSplit: (n: number) => `긴 줄 ${n}개 분할`,
    countPunctuation: (n: number) => `문장부호 ${n}개 정리`,
    countMerged: (n: number) => `${n}줄 병합`,
    countEllipsis: (n: number) => `말줄임표 ${n}개 통일`,
    countJoined: (n: number) => `${n}개 한 줄로 병합`,
    countSpeaker: (n: number) => `화자 ${n}개 분리`,
    unsplit: (n: number) => `${n}줄은 나누지 못했습니다`,
    nothingToDo: '고칠 것이 없었습니다. 이미 규칙에 맞는 자막입니다.',
    download: '내려받기',
    startOver: '다른 파일 올리기',
    limitReached:
      '오늘 사용 가능한 횟수를 모두 썼습니다. 내일 다시 시도해 주세요.',
    tooLarge: '파일이 너무 큽니다.',
    failed: '규칙 적용에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  },
```

- [ ] **Step 2: 업로드 화면을 만든다**

`app/components/polish/PolishUploadStep.tsx`:

```tsx
'use client';

import { COPY } from '../../i18n/simpleCopy';

interface PolishUploadStepProps {
  working: boolean;
  error: string;
  onFile: (file: File) => void;
}

/**
 * 파일 드롭만 있다. 콘텐츠 유형(영화·예능·강연) 선택이 필요했던 유일한 이유가
 * CPS 타이밍이었는데 이 경로는 타임코드를 안 건드린다.
 */
export function PolishUploadStep({
  working,
  error,
  onFile,
}: PolishUploadStepProps) {
  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{COPY.polish.title}</h1>
        <p className='whitespace-pre-line'>{COPY.polish.sub}</p>
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {error && (
          <p className='text-sm' style={{ color: 'oklch(0.55 0.2 25)' }}>
            {error}
          </p>
        )}

        <label className='btn btn-primary w-full text-center cursor-pointer'>
          {working ? COPY.polish.working : COPY.polish.dropHint}
          <input
            type='file'
            accept='.srt,.vtt,.ass,.smi'
            className='hidden'
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 완료 화면을 만든다**

`app/components/polish/PolishDoneStep.tsx`:

```tsx
'use client';

import { COPY } from '../../i18n/simpleCopy';
import type { PolishSummary } from '../../hooks/usePolish';
import type { DownloadOption } from '../../types/translation';

interface PolishDoneStepProps {
  summary: PolishSummary;
  downloads: DownloadOption[];
  onStartOver: () => void;
}

/** 0인 항목은 문장에서 빠진다 — "0개 병합"은 정보가 아니라 소음이다. */
function summaryParts(summary: PolishSummary): string[] {
  const parts: string[] = [];
  if (summary.linesSplit > 0) parts.push(COPY.polish.countSplit(summary.linesSplit));
  if (summary.trailingPunctuationStripped > 0)
    parts.push(COPY.polish.countPunctuation(summary.trailingPunctuationStripped));
  if (summary.linesMerged > 0) parts.push(COPY.polish.countMerged(summary.linesMerged));
  if (summary.ellipsisNormalized > 0)
    parts.push(COPY.polish.countEllipsis(summary.ellipsisNormalized));
  if (summary.linesJoined > 0) parts.push(COPY.polish.countJoined(summary.linesJoined));
  if (summary.speakerLinesSplit > 0)
    parts.push(COPY.polish.countSpeaker(summary.speakerLinesSplit));
  return parts;
}

export function PolishDoneStep({
  summary,
  downloads,
  onStartOver,
}: PolishDoneStepProps) {
  const parts = summaryParts(summary);

  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{COPY.polish.doneTitle}</h1>
        <p>
          {parts.length > 0
            ? COPY.polish.summary(parts)
            : COPY.polish.nothingToDo}
        </p>
        {summary.unsplitLines > 0 && (
          <p className='text-fineprint text-secondary mt-2'>
            {COPY.polish.unsplit(summary.unsplitLines)}
          </p>
        )}
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {downloads.map((download) => (
          <a
            key={download.filename}
            href={URL.createObjectURL(
              new Blob([download.content], { type: download.mime }),
            )}
            download={download.filename}
            className='btn btn-primary w-full text-center'
          >
            {COPY.polish.download} (.{download.extension})
          </a>
        ))}
        <button type='button' className='btn w-full' onClick={onStartOver}>
          {COPY.polish.startOver}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 라우트 페이지를 만든다**

`app/polish/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '../components/beta/AppNav';
import { SiteFooter } from '../components/SiteFooter';
import { PolishUploadStep } from '../components/polish/PolishUploadStep';
import { PolishDoneStep } from '../components/polish/PolishDoneStep';
import { usePolish } from '../hooks/usePolish';
import { useAuth } from '../hooks/useAuth';

export default function PolishPage() {
  const router = useRouter();
  const { user, credits, loading: authLoading } = useAuth();
  const { stage, error, summary, downloads, handleFile, reset } = usePolish();

  // `/`는 비로그인에게 랜딩을 보여주지만 이 라우트는 그 게이트 밖에 있다.
  // 자체적으로 돌려보낸다.
  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <div className='min-h-screen' aria-busy='true' />;
  }

  return (
    <div className='min-h-screen'>
      <AppNav credits={credits} onHome={() => router.push('/')} />

      <main className='w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-20'>
        {stage === 'done' && summary ? (
          <PolishDoneStep
            summary={summary}
            downloads={downloads}
            onStartOver={reset}
          />
        ) : (
          <PolishUploadStep
            working={stage === 'working'}
            error={error}
            onFile={handleFile}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 5: 진입점을 붙인다**

`app/components/beta/AppNav.tsx`의 `마이페이지` 링크 **앞에** 넣는다:

```tsx
          <Link
            href='/polish'
            className='text-caption text-nav hover:bg-[var(--fill-hover)] rounded-[var(--r-btn)] px-3 py-1.5 transition'
          >
            {COPY.polish.navLink}
          </Link>
```

- [ ] **Step 6: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

기대: `simpleCopy.test.ts` 기존 1건 외 통과.

- [ ] **Step 7: 브라우저로 확인한다**

Browser 도구로 `npm run dev`를 띄우고(Bash 금지) `/polish`에 접속한다.

1. 비로그인 → `/`로 튕기는지
2. 로그인 후 자막 파일 업로드 → 요약과 다운로드 버튼이 뜨는지
3. `read_console_messages`로 에러가 없는지
4. ZAMAK이 번역한 자막을 넣으면 **네트워크 탭에 `/api/polish` 요청이 없는지**
   (`read_network_requests`) — 초과 0건 경로가 실제로 모델을 안 부르는지가 이
   기능의 경제성이므로 반드시 눈으로 확인한다

- [ ] **Step 8: 커밋 (Task 5 + 6)**

```bash
git add app/lib/client/polishApi.ts app/hooks/usePolish.ts app/i18n/simpleCopy.ts app/components/polish app/polish app/components/beta/AppNav.tsx
git commit -m "규칙 적용: /polish 화면과 클라이언트 흐름을 추가한다"
```

---

### Task 7: 문서 지도 갱신

CLAUDE.md의 "번역 관련 코드를 바꾸면 문서 지도도 같은 커밋에서 갱신할 것"에 걸린다
— 새 프롬프트(`prompts/`)와 새 파이프라인이 생겼다.

**Files:**
- Modify: `docs/translation-pipeline.md`
- Modify: `docs/TODO.md`
- Modify: `docs/decisions.md`

- [ ] **Step 1: `docs/translation-pipeline.md`에 절을 추가한다**

§9.7(규칙 강제) 뒤에 규칙 적용 경로를 넣는다. 담을 것:

- 흐름 8단계(설계 문서 §6 표를 그대로)
- **타임코드를 읽지도 쓰지도 않는다**는 점
- `reassembleTranslatedChunk`를 부분집합에 그대로 쓴다는 점과 그게 되는 이유
  (번호로 대조하므로 연속일 필요가 없다)
- 증상표에 두 행 추가:

```
| /polish가 긴 줄을 안 나눔 | 먼저 초과 줄이 실제로 있는지 확인(19자 이하면 정상 동작이다). 있는데도 그대로면 `prompts/common/line_split_ko.txt` 또는 `polishService`의 청크 실패 → 응답의 `failedChunks` 확인 |
| /polish에서 "오늘 횟수를 다 썼습니다" | 정상 — `RATE_LIMITS.polish`(하루 5회). 크레딧을 안 쓰는 라우트라 이 한도가 유일한 천장이다 |
```

- [ ] **Step 2: `docs/TODO.md`의 미결 항목을 닫는다**

"제품에 넣을지, 넣는다면 크레딧을 번역과 같이 받을지" 미결에 결론을 적는다:

```
**결론 (2026-08-19)**: 제품에 넣었다 — `/polish`. 크레딧은 **안 받는다**(무료 +
하루 5회, `RATE_LIMITS.polish`). AI가 받는 게 19자 초과 줄뿐이라 비용이 번역의
~1/10이고, ZAMAK 번역 결과를 재적용하면 호출 자체가 0이다. 설계는
`docs/superpowers/specs/2026-08-19-polish-page-design.md`.
```

- [ ] **Step 3: `docs/decisions.md`에 결정을 적는다**

새 절로 추가한다. 담을 것:

- 무료 + 하루 5회를 고른 이유(비용 구조), 그리고 그 한도가 **보안 요소**라는 점
- 기존 위저드에 `mode` 축을 더하는 안을 기각한 이유
- CPS 타이밍을 뺀 이유와 그 부수 효과("밀릴 수 없다"가 "바뀔 수 없다"가 됨)
- ⚠️ 측정에 쓴 `Marx…ko.srt`가 전문가 자막이 아니라 **우리 이전 출력**이라는 점

- [ ] **Step 4: 커밋**

```bash
git add docs/
git commit -m "문서 지도에 규칙 적용 경로(/polish)를 반영한다"
```

---

## Self-Review

**스펙 커버리지**

| 스펙 절 | 태스크 |
|---|---|
| §5 불변식 (블록 집합 보존) | Task 1 Step 2의 "무슨 입력이 와도 블록 수가 변하지 않는다" |
| §6 흐름 1~8 | Task 5 (`usePolish`) |
| §6 4번 (초과 0건이면 AI 건너뜀) | Task 5 `if (indices.length > 0)` + Task 6 Step 7의 네트워크 확인 |
| §7 병합 규칙 | Task 1 `spliceBlocks` + 기존 `reassembleTranslatedChunk` (배경 절에 대응표) |
| §8 화면 3단계 | Task 6 (처리 중은 업로드 화면의 `working` 상태로 흡수 — 별도 화면을 만들 만큼 담을 것이 없다) |
| §8 report 합산 | Task 5 `addReports` |
| §9 라우트 · 한도 | Task 3 |
| §10 에러 처리 | Task 3 (청크 실패 → 원문 유지), Task 5 (`PolishRefusedError` 분기) |
| §11 테스트 | Task 1, Task 2 |
| §12 파일 구성 | Task 1~6 |
| §13 문서 | Task 7 |

**스펙과 달라진 점 두 가지** (계획 중 코드를 확인해 발견):

1. **§7의 병합 로직 대부분이 이미 있다.** `reassembleTranslatedChunk`가 번호 대조·
   미매칭 폴백·`|` 분리·타임스탬프 불신을 전부 한다. 새로 만드는 건
   `collectOverLongBlocks`와 `spliceBlocks` 둘뿐이다. `LINE_BREAK_MARK`는
   export할 필요가 없다(내부에서만 쓰인다) — 스펙의 수정 파일 표에서 그 항목은
   빠진다. `visibleLength`만 export한다.
2. **`buildDownloads`가 훅 안의 비공개 함수였다.** 스펙은 공유 가능한 것처럼
   적었지만 실제로는 옮겨야 한다 → Task 4를 새로 넣었다.

**플레이스홀더 스캔:** 없음. Task 7의 문서 항목은 "담을 것"을 불릿으로 명시했다
(문서 산문은 코드와 달리 축자 지정이 무의미하다).

**타입 일관성:** `PolishSummary`는 Task 5에서 정의하고 Task 6에서 소비한다 —
필드명이 `TextRuleReport`와 같고(`trailingPunctuationStripped` 등) 여기에
`linesSplit`·`unsplitLines`가 더해진다. `PolishServiceResult`(Task 3)와
`PolishResponse`(Task 5)는 같은 모양이며 HTTP 경계를 사이에 둔 짝이다.

**알려진 위험:** Task 3의 라우트에는 단위 테스트가 없다(리포에 API 라우트 테스트가
하나도 없어 관례를 따랐다). 실제 검증은 Task 6 Step 7의 브라우저 확인이 유일하므로
그 단계를 건너뛰지 말 것.

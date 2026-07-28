# 번역 파이프라인 지도

**품질관리용 지도.** 자막 한 편이 업로드부터 다운로드까지 거치는 전 과정을 순서대로
적고, **각 단계에서 품질을 바꾸려면 어느 파일/함수를 고치면 되는지**를 표시한다.
"왜 이렇게 되어 있는가"는 [`decisions.md`](decisions.md), 미착수 개선안은
[`TODO.md`](TODO.md), 청크 수치 유도는 [`tuning/`](tuning/) 참조.

> 파일 경로 + 함수/심볼 이름으로만 가리킨다(줄 번호는 금방 어긋나서 안 적음).
> 기준 시점: 2026-07-28. 구조가 바뀌면 이 문서도 같이 고칠 것.

메인 경로는 **영화·드라마 분기**다. "기타 영상" 분기는 3단계에서 갈린다.

---

## 전체 흐름 (한눈에)

```
업로드 (.srt/.vtt/.smi/.ass)
  → 포맷 → 정규 SRT (`app/lib/subtitles/`)
  → 파일명 파싱 (제목/연도 추측)
  → /api/analyze         제목·연도 확정 (AUX 모델)
  → [영화] /api/enrich    TMDB + 그라운딩 → 제목/연도/감독/포스터 + 장르/배경/톤
    [기타] /api/summarize 자막 앞부분 요약 → notes
  → (opt-in, 토글 ON시) /api/glossary  전체 자막 1회 스캔 → 글로사리+말투관계
  → InfoStep             사람이 검토·수정 (+ 글로사리 카드, 켰다면)
  → /api/translation/begin  크레딧 1 차감 → jobId
  → 청킹 (장면 갭 기준)
  → 청크별 병렬 /api/translate
       └ 프롬프트 조합 → Gemini 호출 → 타임코드 재조립
  → 잔여 수거 패스   원문으로 남은 블록만 재포장해 재요청 (§9.65)
  → 조립 → 다운로드 (원본 형식 + .srt)
```

---

## 단계별 상세 + 품질 레버

### 0. 업로드 & 포맷 정규화 (→ SRT)
- **코드**: `app/components/simple/UploadStep.tsx`, `app/hooks/useTranslation.ts`
  (`processFile`), **`app/lib/subtitles/`** (`toCanonicalSrt`, `detect`, `parseVtt`/
  `parseSmi`/`parseAss`, `readSubtitleFile`), 이후 `app/lib/srt.ts` (`parseSrtBlocks`)
- **하는 일**: `.srt`/`.vtt`/`.smi`/`.ass`/`.ssa` 검증 → 바이트 디코드(SMI는 UTF-8
  실패 시 EUC-KR/CP949) → `parseSubtitleDocument`가 **정규 SRT + 원본 오프셋 맵**
  (`SubtitleDoc`)을 만듦 → 블록 분리(번호/타임코드/본문). 이후 파이프라인은 SRT만 본다.
  원본과 맵은 다운로드 단계에서 원본 형식으로 되돌리는 데만 쓰인다 (`decisions.md` §2-13).
- **읽기 실패는 여기서 끝난다**: 파싱은 `page.tsx`의 `handleFile`이 await하므로,
  읽히지 않는 파일·이중 언어 SMI는 업로드 화면에 머무른다(다음 단계로 안 넘어감).
- **품질 레버**: 포맷 파싱 이상 → `app/lib/subtitles/*`. 정규화 이후 SRT 파싱 문제 →
  `parseSrtBlocks`. 프롬프트는 건드릴 필요 없음(모델은 `[N] 대사`만 봄).
- **불변식**: 큐 본문에 빈 줄이 들어가면 SRT 블록이 쪼개져 번호 없는 고아 블록이 되므로
  `serializeCues`가 내부 빈 줄을 접는다. 같은 함수가 큐를 시간순으로 정렬하고
  (ASS는 문서 순서 ≠ 시간 순서), 블록 번호 ↔ 원본 큐 대응(`cueIndexByBlock`)을 만든다.

### 1. 파일명 → 제목·연도 추정
- **코드**: `app/utils/metadataInference.ts` (`parseFilename`) → `app/api/analyze/route.ts`
  → `app/lib/prompts/analysis.ts` → 프롬프트 `prompts/common/content_analysis.txt`
  (AUX 모델 = `AUX_MODEL`).
- **하는 일**: 릴리스 태그(1080p 등) 제거, 제목·연도 추출. 자막 샘플도 보조 참고.
- **품질 레버**:
  - 제목/연도 오추출 → **`prompts/common/content_analysis.txt`** (추출 규칙 프롬프트)
  - 파일명 정규식 문제 → `metadataInference.ts`

### 2-A. 작품 정보 수집 — 영화·드라마 (enrich)
- **코드**: `app/api/enrich/route.ts` → **`app/lib/server/enrichMovie.ts`**
  — 검색 모드(`{title, year}`) → `searchMovie` → TMDB 후보 검색
  `tmdb.ts`(`searchCandidates`); 선택 모드(`{candidate}`, 사용자가 후보를 고른 뒤) →
  `enrichMovieById` → 상세조회 `tmdb.ts`(`lookupById`) + `extractKeywords`.
  둘 다 TMDB 미스 시 `enrichWithGrounding`으로 폴백.
- **하는 일 / 두 버킷**:
  - **UI 버킷** (화면 표시): 제목·연도·감독·포스터 — TMDB 매치 시 TMDB에서, 미스 시 그라운딩.
  - **AI 버킷** (번역 프롬프트로만 감): 장르(TMDB) + 배경/시대·톤앤매너(그라운딩 검색).
- **후보가 여러 개일 때 (사용자 선택)**: `searchMovie`는 TMDB 검색 결과가 정확히 1개면
  바로 상세조회까지 진행하지만, **2개 이상이면(제목이 흔하거나 리메이크가 있을 때)
  era/tone 추출 없이 후보 목록만 반환**한다(`{status:'ambiguous', candidates}`, 최대
  `MAX_ENRICH_CANDIDATES`개 — `constants.ts`). 인기도만으로 자동 선택하면 재검색해도
  계속 다른 작품이 나오는 문제가 있어, 그 대신 `InfoStep.tsx`가 포스터·제목·연도·
  영화/드라마 구분으로 후보 카드를 보여주고 사용자가 클릭해서 고르면(`onSelectCandidate`)
  그때 `/api/enrich`를 선택 모드로 다시 호출해 `enrichMovieById`가 마무리한다.
- **품질 레버**:
  - 제목/연도/감독/포스터 틀림 → TMDB 검색·정렬 로직 `tmdb.ts` (`searchCandidates`의
    연도매칭→인기도 정렬), 상세조회 `tmdb.ts` (`lookupById`), 또는 미스 시 그라운딩
    프롬프트 `enrichMovie.ts` (`buildGroundedPrompt`)
  - 후보가 계속 엉뚱한 작품으로 자동 선택됨(재검색 정확도) → `tmdb.ts`
    (`searchCandidates`의 정렬 기준), 후보 노출 상한 `constants.ts`
    `MAX_ENRICH_CANDIDATES`, 후보 카드 UI `InfoStep.tsx` (`CandidatePicker`)
  - 장르/배경·시대/톤앤매너 품질 → **`enrichMovie.ts`의 `buildKeywordPrompt`
    (TMDB 매치용) / `buildGroundedPrompt` (미스용)**
  - 한국어 제목 없을 때 음차 → `enrichMovie.ts` (`needsTransliteration` + 프롬프트)
  - 관련 결정: 배경/시대가 개봉연도로 나오던 버그는 그라운딩 전환으로 해결(커밋
    `9bf6e1c`). 인물별 말투·글로사리는 의도적으로 보류 → `TODO.md`.

### 2-B. 작품 정보 수집 — 기타 영상 (summarize)
- **코드**: `app/api/summarize/route.ts` (AUX 모델, 앞 `SUMMARY_SAMPLE_LINES`줄 샘플)
- **하는 일**: 내용 1~2문장 요약 → `movieInfo.notes`.
- **품질 레버**: 요약 프롬프트는 `summarize/route.ts` 안에 인라인. 샘플 줄 수는
  `constants.ts` `SUMMARY_SAMPLE_LINES`.

### 2-C. 글로사리·존대관계 추출 (opt-in, 모델·콘텐츠 유형 무관)
- **코드**: `app/api/glossary/route.ts` → `app/lib/server/extractCastSheet.ts`
  (`extractCastSheet` → `fetchCastAnchors`(TMDB cast, best-effort) + Gemini
  `responseSchema` 호출 → `sanitizeCastSheet`), 렌더 `app/lib/prompts/glossaryContent.ts`
  (`renderGlossaryTags`), 프롬프트 `prompts/common/cast_sheet_extraction.txt`, 토글
  훅 `app/hooks/useCastSheet.ts`, 카드 `app/components/simple/CastSheetCard.tsx`.
- **하는 일**: InfoStep의 "등장인물·용어 일관성" 토글(기본 **OFF**, `localStorage`에
  기억)을 켜면 전체 자막을 한 번 스캔해 ①인물·지명·용어의 확정 **도착어 표기**(글로사리,
  `GlossaryTerm.target`)와 ②인물 간 말투(방향성 있음, 자막 블록 범위가 붙음)를 뽑는다.
  말투 값은 언어 중립(`formal`/`informal`/`mixed`)으로 저장하고, 프롬프트·UI에는
  도착어의 어휘(존댓말·반말 / 敬語·タメ口 / usted·tú …)로 번역해 보여준다 —
  라벨 출처는 `app/config/languages.ts`의 `TargetLang.formality`.
  **말투 축이 없는 언어(영어·중국어)는 `formality: null`이라 relations를 아예 뽑지
  않고 `<speech_relations>` 태그도 나가지 않는다**(§7). 파일당 1회이고
  청크별 병렬 번역 호출과 별개 — 결과가 모든 청크 프롬프트에 주입된다(§7). **OFF가
  기본값이라 이 라우트는 사용자가 켜기 전엔 절대 호출되지 않는다.**
- **왜 opt-in인가**: 추출에 20~40초 걸린다. 토글을 켜면 InfoStep 진입과 동시에
  백그라운드로 돌아 지연이 대부분 숨지만(사람이 작품 정보를 검토하는 동안 끝남), 처음
  켜는 순간만은 그 지연이 노출된다. 번역 모델(고급/빠른) 선택과는 **무관한 독립
  토글**이다 — 결정 배경은 `decisions.md` §2-9.
- **품질 레버**:
  - 표기·관계가 틀리거나 아예 안 잡힘 → `prompts/common/cast_sheet_extraction.txt`
    (말투 파트는 별도 파일 `prompts/common/cast_sheet_formality_task.txt` — 말투 축이
    있는 언어에서만 주입됨, `extractCastSheet.ts`의 `buildSystemInstruction`)
  - 지어낸 이름이 섞임(환각) → `extractCastSheet.ts`의 `sanitizeCastSheet`
    (실제 자막 문자열에 없는 `source`는 버림 — 이게 이 기능의 핵심 방어선)
  - 인물명 표기가 TMDB와 다름 → `tmdb.ts`의 `cast`(상위 12명, 배역명+배우명, 한국어
    표기는 아님 — 식별 힌트일 뿐 모델이 직접 음차)
  - 청크당 프롬프트 비용이 커짐 → `constants.ts` `GLOSSARY_MAX_TERMS`/`_RELATIONS`/`_CHARS`
  - 후반 청크가 초반 관계를 물려받음(또는 그 반대) → 있으면 안 되는 일 — `composer.ts`가
    `getBlockIndexRange`로 청크의 실제 블록 범위를 구해 겹치는 관계만 넣는다
    (`glossaryContent.ts` `renderGlossaryTags`)
  - 사람이 잘못된 항목을 고치고 싶음 → InfoStep 카드에서 직접 편집(표기/삭제/추가,
    말투 드롭다운) 가능, `CastSheetCard.tsx`

### 3. 사용자 검토·수정 (InfoStep)
- **코드**: `app/components/simple/InfoStep.tsx`, 문구 `app/i18n/simpleCopy.ts`
  (`COPY.info`), 글로사리 카드는 `CastSheetCard.tsx`(§2-C)
- **하는 일**: 제목·연도·장르·배경/시대·톤앤매너·notes를 **사람이 편집 가능**. 자동
  수집이 틀려도 여기서 최종 교정된 값이 번역에 들어간다. 글로사리 토글을 켰다면 표기·
  존대관계도 같은 화면에서 편집 가능(§2-C).
- **품질 레버**: 어떤 필드를 보여줄지/편집 가능하게 할지 → `InfoStep.tsx`. 필드 라벨/힌트
  문구 → `simpleCopy.ts`. **자동화가 애매하면 이 사람-교정 단계를 강화하는 게 가장 안전.**

### 4. 번역 시작 & 크레딧 & 스타일 선택
- **코드**: `app/page.tsx` (`handleTranslate`) → `useTranslation.translate(...)`,
  `app/api/translation/begin/route.ts`
- **하는 일**: 크레딧 1 차감 → `jobId` 발급(파일당 1회). 번역 스타일·도착어 결정.
- **품질 레버**:
  - **번역 스타일** `meaning`(의미보존) / `cinematic`(영화적) — 현재 `handleTranslate`에서
    **`'meaning'` 하드코딩**. cinematic 철학 파일은 존재하나 UI에 안 붙어 있음. 스타일을
    노출/전환하려면 여기 + `InfoStep`.
  - 도착어 → **`app/config/languages.ts` (`TARGET_LANGS`)** — 한 행이 곧 한 언어다:
    picker 표시(label/mono/enabled), 프롬프트(promptLabel/lineMaxChars/formality),
    후처리(trailingPunctuation/reading). 현재 활성: 한국어·영어·일본어·스페인어·
    프랑스어·중국어(간체)·독일어. **언어 추가 = 이 표에 한 행 + `prompts/common/
    translation_rules_<code>.txt` 한 개**(둘 중 하나만 있으면 `languages.test.ts`가
    실패한다). 서버는 `requestValidation.parseTargetLanguage`에서 enabled 코드만
    통과시키므로, 표에 없는 코드는 프롬프트 조합에 도달하지 못한다.

### 5. 청킹 (장면 경계 기준)
- **코드**: `useTranslation.translate` → **`app/lib/srt.ts` (`chunkSrtBlocksAtGaps`)**,
  크기·동시성 `app/config/constants.ts` (`getTierLimits` / `resolveTier`)
- **하는 일**: 목표 크기 ±20% 창에서 가장 큰 2초+ 갭(장면 전환)에 맞춰 자름. 없으면 고정 컷.
- **품질 레버**:
  - 청크 경계가 대화 중간을 자름 → `chunkSrtBlocksAtGaps` 파라미터(갭 임계 기본 2000ms,
    tolerance 기본 ±20%)
  - 미착수: 청크 경계 겹침 컨텍스트 → `TODO.md`

#### 청크 크기(`SERVER_CHUNK_SIZE`) 조절할 때

⚠️ **`B ≥ 300`이면 재번호 드리프트 오류가 난다** (자막 번호가 밀려 엉뚱한 타임코드에
번역문이 붙음 — 실패 지표에도 안 잡힘). **300 미만으로만** 둘 것. 현재 기본값은 100
(마커 오염 감소까지 겸해 200→150→100으로 추가 하향, 2026-07-25 하네스 실측).
배경·유도는 `decisions.md` §2-3·§2-3-3 / `tuning/chunk-size-model.md` §8.

| 순서 | 파일 | 무엇을 |
|---|---|---|
| 1 (필수) | `app/config/constants.ts` | `SERVER_CHUNK_SIZE` 기본값(+ 주석). 런타임은 여기만 보면 됨. env `NEXT_PUBLIC_CHUNK_SIZE`로도 덮을 수 있음(핫리로드) |
| 2 (문서 동기화) | `README.md` | 티어 표·env 기본값·출력 상한 여유율 |
| 3 | `docs/tuning/chunk-size-model.md` | 결론 박스·§5-6 비교표·§8 임시 조치 |
| 4 | `docs/decisions.md` | §2-3 현재값 헤딩·§2-3-2 운영 결정 |
| 5 | `HANDOFF.md` | "현재 설정값" 표 |
| 6 | `docs/translation-pipeline.md` | 이 절(현재값·상한 서술이 바뀌면) |

동작에 필요한 건 **1번뿐**. 2–6은 문서가 어긋나지 않게 같이 맞춘다. 동시성(`SERVER_CONCURRENCY`)은
별 레버 — B만 바꿀 때 K는 보통 그대로 둬도 됨.

### 6. 청크별 병렬 번역 요청
- **코드**: `useTranslation` (`runOrderedPool` → `requestChunkTranslation`) →
  `app/api/translate/route.ts` (SSE, job 검증)
- **하는 일**: 청크를 동시 번역. **실패 청크는 원문 유지**(failedChunks) → 항상 완전한 파일.
- **품질 레버**: 동시성 `constants.ts` `SERVER_CONCURRENCY`. 실패 정책(재시도 안 함) →
  `translationService.ts` / `useTranslation` worker.
- **진행 링**: 채워지는 속도는 `constants.ts` `TRANSLATION_ESTIMATE_MS`(모델별 고정값 —
  flash 30초 / pro 3분, 파일 크기 무관), 링 자체는 `ProgressStep.tsx`(99%까지만 이징,
  100%는 결과 도착 후). **이 숫자를 바꾸면 `simpleCopy.ts`의 "30초" 문구도 같이 바꿀 것**
  (`decisions.md` §2-7).

### 7. 프롬프트 조합 ⭐ (번역 품질의 핵심 집결지)
- **코드**: `app/api/translate/route.ts` → `app/lib/server/translationService.ts`
  (`translateSubtitle`) → **`app/lib/prompts/composer.ts` (`composeTranslationPrompt`)**
  → `app/lib/prompts/translationContent.ts` (`buildTranslationVariables`,
  `formatMovieInfo`) + `app/lib/prompts/glossaryContent.ts` (`renderGlossaryTags`),
  로더 `app/lib/prompts/loader.ts`
- **조립 구조**:
  - **시스템 프롬프트**:
    - 페르소나 + 신뢰 경계 → `prompts/common/subtitle_translation_system.txt`
      (`<glossary>`, `<speech_relations>`도 이 경계에 포함 — §2-C가 켜져 있을 때만
      실제로 등장)
    - `{{translationPhilosophy}}` → `prompts/common/cinematic_translation_philosophy_ko.txt`
      (**cinematic 스타일에서만**; meaning은 빈 문자열)
    - `{{translationRules}}` → **도착어별 독립 파일
      `prompts/common/translation_rules_<code>.txt`**(형식 불변식 + 문체·말투·문장부호가
      한 파일에, **그 언어로 작성**; `{{lineMaxChars}}`만 `languages.ts` 값으로 치환 —
      `translationContent.ts`의 `buildTranslationRules`)
  - **유저 턴**: `<content_metadata>`(`formatMovieInfo` — 제목/연도/장르/배경·시대/톤앤매너)
    + `<user_notes>` + 청크 위치 + `<glossary>`(파일 전체 표기, §2-C 켰을 때만) +
    `<speech_relations>`(이 청크의 블록 범위와 겹치는 관계만, `getBlockIndexRange` +
    `renderGlossaryTags` — §2-C) + `<subtitle_data>`(타임스탬프 제거, **줄마다
    `[N] 대사` 표식** — `formatBlocksForModel`, `srt.ts`) + 블록 수 지시(구조 기반
    카운트, `parseSrtBlocks(...).length`)
  - **규칙 파일은 lean 체제**(2026-07-28, `decisions.md` §2-1 (3)): 7개 규칙, 언어당
    약 0.8~1.3KB. **코드가 이미 강제하는 항목(2줄 상한·문장부호)은 프롬프트에 넣지
    않는다** — 넣으면 모델 주의력만 갉아먹는다는 게 실측됐다. 규칙을 추가할 땐
    "이건 코드가 할 수 있나?"를 먼저 볼 것
- **품질 레버 (여기가 가장 큰 번역 품질 레버들)**:
  - 특정 도착어의 번호·블록 수·줄바꿈 지점·문체·말투 →
    **`translation_rules_<code>.txt`** (예: 한국어 직역투는 `translation_rules_ko.txt`).
    언어마다 파일이 독립이라 한 언어를 고쳐도 다른 언어는 안 바뀐다 — 불변식 문구를
    고칠 때는 7개 파일을 같이 점검할 것. **문장부호는 도착어에 따라 담당이 갈린다**:
    ko·ja·zh는 코드가 제거(§9.7), en·es·fr·de는 유지가 관행이라 프롬프트 규칙 4가
    담당(스페인어 `¿ ¡`, 프랑스어 `? ! : ;` 앞 공백, 독일어 명사 대문자 포함)
  - 영화적 번역 철학(인물 목소리·감정·압축) → **`cinematic_translation_philosophy_ko.txt`**
    (cinematic에서만 적용)
  - 페르소나/프롬프트 인젝션 방어 → `subtitle_translation_system.txt`
  - 메타데이터가 프롬프트에 실리는 형식 → `translationContent.ts` (`formatMovieInfo`)
  - 도착어별 규칙 로딩 → `translationContent.ts` (`requireTargetLang`,
    `buildTranslationRules`), `loader.ts` (`loadTranslationRules`)
  - 줄 길이 상한 → `languages.ts`의 `lineMaxChars`(ko 25 / ja 20 / zh 18 / 라틴계 42)
  - 이름 표기·말투가 청크마다 흔들림 → §2-C(추출) 참조. 표기 고정은 각
    `translation_rules_<code>.txt`의 글로사리·우선순위 규칙에 못박혀 있음
- **주의**: `castSheet`가 없으면(토글 OFF, 기본값) `<glossary>`/`<speech_relations>`는
  `.filter(Boolean)`으로 완전히 드롭돼 프롬프트가 이 기능 도입 이전과 바이트 단위로
  같다 — `composer.test.ts` 회귀 테스트로 고정됨.

### 8. 모델 호출
- **코드**: `translateSubtitle` → `app/lib/providers/gemini.ts` (`generateModelText`),
  설정 `app/config/constants.ts`
- **품질 레버**:
  - 번역 모델 → UI에서 **고급번역** (`PRO_MODEL` = `gemini-3.1-pro-preview`) /
    **빠른번역** (`FLASH_MODEL` = `gemini-3.6-flash`). 허용 목록은
    `constants.ts` `ALLOWED_MODELS`. 하니스 기본은 `TRANSLATION_MODEL`(env
    `NEXT_PUBLIC_TRANSLATION_MODEL`, 기본 flash)
  - thinking 수준 → `thinkingLevelForModel(model)`: flash는
    `THINKING_LEVEL`(기본 LOW), Pro는 `PRO_THINKING_LEVEL`(기본 MEDIUM).
    둘 다 env, 변경 시 dev 서버 재시작. 로그에 `thinking=`로 찍힘. ⚠️ flash와 달리
    pro는 MINIMAL을 설정할 수 없고(API가 거부) LOW도 `thoughts=0`이 아니다 — 실측·비용
    영향은 `docs/decisions.md` §2-4-1, `docs/tuning/gemini-limits.md` §6-2 참고
  - **엄격 모드**(출력 검증+재시도+블록단위 재번역) → `translationService.ts`,
    `TRANSLATION_STRICT_MODE=true`로 켬(기본 off, 비용 폭탄 위험 있어 신중히)

### 9. 타임코드 재조립
- **코드**: **`app/lib/srt.ts` (`reassembleTranslatedChunk`, `indexTranslatedBodies`,
  `formatBlocksForModel`)**
- **하는 일**: 모델 출력을 **줄마다 붙은 `[N]` 표식으로 대조**해 원본 타임코드와 재결합.
  매칭 안 된 블록은 원문 유지 → 이후 자막이 안 밀림. 타임스탬프는 모델에 안 보내므로
  여기서 복원됨. 표식이 본문과 같은 줄에 있어(2026-07-25, `decisions.md` §2-1)
  ①대사가 순수 숫자여도("8", "1999") 표식과 안 겹치고 ②모델이 표식을 빠뜨려도 그
  텍스트가 이웃 블록을 오염시키지 못한다(빈 줄 뒤 표식 없는 고아는 버림).
  **한 번호 = 한 줄이 현재 포맷**(2026-07-28, `decisions.md` §2-1 (3)): 두 줄 자막은
  그 한 줄 안의 `|`로 표현하고 재조립이 `\n`으로 바꾼다. 같은 번호가 반복되면 이제
  오류이므로 블록 수 대조가 병합을 잡아낸다 — 다만 파서는 옛 포맷(같은 마커 반복)도
  계속 합쳐주므로 하위호환은 유지. 순서 상관없이 아무 마커나 인정.
- **품질 레버**: 재번호 밀림 탐지/수리(현재 미구현 — 모델이 스스로 잘못된 `[N]`을
  내보내는 별개의 실패 모드, 표식 방식과 무관) → `srt.ts` + `TODO.md`. 이게 밀림
  버그의 방어선.

### 9.5. 리딩스피드·최소 길이 타임코드 조정 (CPS / minDuration, 도착어별)
- **코드**: **`app/lib/srt.ts` (`adjustSubtitleTiming`)**, `constants.ts`
  (`CPS_HARD_MAX`/`CPS_TARGET`/`CPS_RECOMMENDED_MIN`/`MIN_SUBTITLE_GAP_MS`/
  `MIN_SUBTITLE_DURATION_MS`), `useTranslation`에서 청크 합친 직후 1회 호출.
- **하는 일**: 두 가지 독립된 조건 중 하나라도 걸리면 같은 방식으로 넓힌다 —
  ① **`cps > 도착어의 hardMax`**(한국어 12 = Netflix 한국어 상한, ja/zh 9, 라틴계 20 —
  `languages.ts`의 `TargetLang.reading`, 해석은 `constants.ts`의 `getReadingSpeed`) 또는
  ② **구간 길이 < `MIN_SUBTITLE_DURATION_MS`**(기본 800ms, 대사 유무 무관 — 빈 블록도 대상).
  두 조건의 요구량 중 **큰 쪽**을 목표로, **이웃이 비운 침묵(gap)** 안에서 표시창을 넓힌다.
  end를 먼저 뒤로 밀고 모자라면 start를 앞으로 당김. 첫 블록은 앞의 빈 프리롤(0초까지)로
  start를 당길 수 있다. **창은 늘리기만 하고 줄이지 않으며, 절대 겹치지 않는다** — 앞
  블록은 조정된 end, 뒤 블록은 원본 start를 경계로 쓰는 비대칭 + `MIN_SUBTITLE_GAP_MS`.
  전체 파일에 한 번 돌아 청크 경계 이웃까지 커버. 타임코드를 코드가 소유한다는 원칙의 연장.
- **임계값 3단(CPS)**: 12 초과 = 손봄(위반), 10 = 착지 목표, 8 = 그 아래로는 안 내림(목표가
  10이라 자동 보장). 10~12 사이는 상한 밑이라 손대지 않는다.
- **품질 레버**: 언어별 기본값은 `languages.ts`의 `reading`(한국어만 실측, 나머지는
  공개 스타일 가이드 기반 추정 — `tuning/reading-speed.md`). env
  `NEXT_PUBLIC_CPS_HARD_MAX`/`_TARGET`을 설정하면 **모든 언어에 일괄 적용되는
  전역 오버라이드**로 동작한다. `CPS_HARD_MAX`(낮추면 더 많은 블록을 손봄), `CPS_TARGET`(낮추면 더 여유롭게
  늘리지만 gap을 더 씀), `MIN_SUBTITLE_GAP_MS`(인접 최소 간격), `MIN_SUBTITLE_DURATION_MS`
  (올리면 더 많은 짧은 블록이 늘어남). 모두 `constants.ts` + env.
  gap이 부족하면 목표까지 못 내려가고 가능한 만큼만 조정.
- **알려진 한계**: 연속 밀집 구간에서 앞 블록이 공유 gap을 end로 먼저 선점하면(greedy) 뒤
  블록이 backward-room을 못 써 덜 조정된다(decisions §2-5). 실측(1480블록)상 여유가 있는데
  미조정으로 남는 블록은 2개 수준.

### 9.6. 에러 분류·재시도·폴백
- **코드**: **`app/lib/translationErrors.ts`**(분류 표, 서버·클라 공용) — 서버
  (`translationService.ts`, `providers/gemini.ts`)가 에러를 `TranslationError{code}`로
  타입 붙여 던지고, SSE(`server/sse.ts`)·JSON 에러 응답(`api/translate/route.ts`)
  둘 다 `code`를 실어 보낸다. 클라(`lib/client/translationApi.ts`)는 코드가 없는
  네트워크 레벨 에러(타임아웃·fetch 실패)만 `classifyError`로 재분류. 실제 재시도/
  전역중단 판단은 **`app/lib/client/chunkRetry.ts`**, 호출은 `useTranslation.ts`.
- **분류표**: `transient`(5xx·네트워크·타임아웃) / `quota`(429) / `auth`(401·403·
  `invalid_or_expired_job`) / `safety`(Gemini SAFETY) / `oversize`(MAX_TOKENS) /
  `align`(청크 전체가 정렬 실패, `matched===0`) / `unknown`.
- **대응**: `transient`·`align` → 1회 재시도. `oversize`(블록 2개 이상일 때만) → 반으로
  쪼개 1회. `quota`·`auth` → **전역 중단**: `chunkRetry`의 `RetryState.fatalCode`를
  세우고, 그 시점 이후 시작되는 모든 청크가 네트워크 호출 없이 바로 원문 폴백된다(이미
  전송 중이던 청크는 각자 결과대로 끝남). 전역 중단은 `throw`가 아니라 폴백이므로
  **파일은 항상 끝까지 조립되어 다운로드 가능** — 불변식 위반이 아니다. `safety`·
  `unknown`은 재시도해도 같은 결과일 가능성이 높아 바로 폴백.
- **예산**: 파일 전체에 `computeRetryBudget(totalChunks) = max(3, ceil(totalChunks*0.2))`
  개의 "추가 호출"(재시도+분할 합산) 상한. 소진되면 이후 실패는 재시도 없이 폴백. 이게
  `decisions.md` §2-2의 20분/5,000원 사고를 **구조적으로** 못 일어나게 만드는 장치 —
  최악의 비용 증가가 +20%로 고정된다.
- **수거**: 이 단계에서 원문으로 남은 블록은 **여기서 끝나지 않는다.** 청크 전체 실패면
  그 청크의 전 시퀀스 번호를, 부분 실패면 재조립이 돌려준 `unmatchedIndices`를 모아
  §9.65 잔여 수거 패스로 넘긴다.
- **미룬 것(다음 커밋)**: 크레딧 환불 정책, "실패한 부분만 재번역" 버튼. `TODO.md` 참조.

### 9.65. 잔여 수거 패스 (recovery sweep) — 원문으로 남은 블록 재시도
- **코드**: **`app/lib/client/recoverySweep.ts`**, `useTranslation.ts`가 본 패스 풀이
  비워진 직후 · §9.7 텍스트 규칙 **이전**에 1회 호출. 상수는 `constants.ts` `RECOVERY`.
- **왜 있나**: §9.6의 청크 재시도로는 **부분 실패를 한 줄도 못 고친다.** 청크가 성공하고
  일부 블록만 안 맞은 경우(`unmatched > 0`)는 `translateOnce`가 성공으로 반환하므로
  `chunkRetry`에 도달하지 않는다. 그리고 실무에서 원문이 남는 대부분이 이쪽이다.
  청크 재시도 예산을 올리는 건 이 경로에 대해 아무 효과가 없고 비용만 는다.
- **핵심은 재포장**: 잔여 블록은 흩어져 있다(30개 청크에 40줄). 그 청크들을 다시 돌리면
  40줄 고치는 데 30회지만, 잔여만 모아 새 청크(B=100)로 묶으면 **1회**다. 비용이
  "실패한 블록 수"에 비례하지 "그게 어느 청크에 있었나"에 비례하지 않는다.
- **타임코드**: 재포장해도 시퀀스 번호는 원본 그대로 실려가므로 서버 재조립(§9)이
  각 번역을 원래 타임코드에 되붙인다. 재포장은 **요청 안에서** 블록을 옮기지
  타임코드를 옮기지 않는다 — 불변식 2 위반이 아니다.
- **중단 조건**(먼저 걸리는 것): 최대 `RECOVERY.MAX_ROUNDS`(2) 라운드 / 최대
  `computeSweepBudget(totalChunks) = max(2, ceil(청크수*0.5))` 호출 /
  **한 라운드가 아무것도 못 건지면 예산이 남아도 즉시 중단**(안전필터에 걸린 줄 등은
  매번 같은 방식으로 실패하므로 두 번 확인할 값어치가 없다) / `quota`·`auth`면 sweep
  자체를 건너뜀. 번역할 게 없는 블록(`♪`, 숫자만 — `hasTranslatableText`)은 애초에
  잔여에서 제외한다.
- **블록 단위 경로는 의도적으로 없다** — `decisions.md` §2-2의 사고에서 청크 하나를
  200회로 불린 그 메커니즘이고, 재포장이 있으면 필요하지도 않다(잔여 20블록 = 1회).
  §9.6의 +20%와 합쳐 파일당 최악 비용이 본 패스의 **~1.7배로 고정**된다.
- **보고**: sweep까지 끝난 뒤에도 원문인 줄 수가 `TranslationResult.fallbackBlocks`,
  sweep이 건진 줄 수가 `recoveredBlocks`. `failedChunks`는 진단용으로만 남기고
  **화면에는 쓰지 않는다** — sweep이 블록 단위로 동작하므로 "구간 2개 실패"는
  사용자가 받지 않는 중간 상태를 설명하게 된다. 전역 중단이 있었으면
  `stopReason`(`'quota'|'auth'`)을 대신 표시(`DoneStep.tsx`, `simpleCopy.ts`
  `done.stopReason`). 진행 중에는 `TranslationProgress.stage === 'recovering'`.

### 9.7. 기계적 번역 규칙 강제 (말줄임표·마침표·2줄 상한, 도착어별)
- **코드**: **`app/lib/srt.ts` (`enforceTextRules`)**, `useTranslation.ts`에서 청크 합친
  직후 · §9.5 타이밍 조정 **이전**에 1회 호출(글자 수가 바뀌면 CPS가 그 결과 위에서
  계산돼야 하므로 순서가 중요).
- **왜 이 세 개만 코드가 처리하나**: `translation_rules_ko.txt` 규칙 중 정답이
  **하나뿐**인 것만 골랐다 — 나머지(줄바꿈 지점, 인물 말투, 정보 추가 금지)는 의미
  판단이 필요해서 코드가 잘못 "고치면" 오히려 품질을 해칠 수 있다(`decisions.md` §2-8).
  - **말줄임표 정규화**: ASCII 마침표 2개 이상 연속(`..`/`...`/`....`)을 전부 `…` 한
    글자로 치환. 이 단계가 먼저 돌아야 다음 단계가 말줄임표를 문장 종결 마침표로
    오인하지 않는다(치환 후엔 끝에 남는 게 `.`이 아니라 `…`이라 애초에 안 걸림).
  - **2줄 상한**(2026-07-28부터 **코드 전담** — 프롬프트에서 제거됨): 줄이 3개 이상이면
    2번째 줄부터 공백으로 합쳐 강제로 2줄로 만든다. 텍스트 유실 없음(공백으로
    이어붙일 뿐 아무것도 버리지 않음).
  - **문장 끝 마침표·줄 끝 쉼표 생략**: 각 줄 끝의 문장부호 하나를 제거. **어떤 문자를
    지울지는 도착어가 정한다** — `languages.ts`의 `trailingPunctuation`(ko `.,` /
    ja `.,。、` / zh `.,。，` / 영어·스페인어·프랑스어·독일어는 빈 문자열이라 **아예
    건드리지 않는다** — 라틴계 자막 관행은 문장부호를 유지한다).
- **줄 길이 초과 시 의미 단위 두 줄 나누기**(`translation_rules_<code>.txt` 규칙 2 —
  `|` 삽입)는 여전히 AI 담당이다 — 어디서 끊어야 자연스러운지는 의미 판단이라 코드가
  임의 지점(예: 중간 공백)에서 자르면 어색한 줄바꿈을 강제로 만들 위험이 더 크다.
  AI는 `|`로 **끊을 지점만 지정**하고 실제 줄바꿈은 코드가 수행한다. 코드의 2줄 상한은
  "AI가 `|`를 두 개 이상 넣었을 때의 안전망"이다.
- **스타일 태그 위치·의미 유지**(`translation_rules_<code>.txt` 규칙 6)는 스코프에서
  제외: 출력만 보고 고칠 수 있는 말줄임표·2줄 상한과 달리, 원본 블록과 번역 블록을
  태그 단위로 비교해야 판단이 서서 성격이 다르다 — 검토는 했으나(`decisions.md`
  §2-8) 이번엔 넣지 않았다.
- **인물 말투 결정**(`translation_rules_<code>.txt` 규칙 5): 판단이
  필요해 자동 고침 대상 아님. 말투는 §2-C 글로사리·존대관계 프리패스
  (`decisions.md` §2-9, opt-in)가 담당하는 영역 — 파일 단위로 존댓말/반말 관계를
  뽑아 모든 청크에 동일 주입해서 청크 격리 문제를 푼다.
- **리포트만, 아직 미표시**: `enforceTextRules`는 무엇을 몇 번 고쳤는지
  `TextRuleReport`로 반환하고 `useTranslation.ts`가 콘솔에 로그만 남긴다 — 화면에
  보여주거나 하네스(`prompt-ab.mts`)에 집계하는 건 아직 안 함(향후 §9.6처럼 확장 가능).

### 10. 조립 & 다운로드
- **코드**: `useTranslation`(청크 결과 합치기 + §9.7 텍스트 규칙 강제 + §9.5 조정 +
  §9.6 재시도/폴백 집계 + `buildDownloads`), `app/lib/subtitles/document.ts`
  (`emitInOriginalFormat`), `app/lib/srt.ts` (`buildOutputFilename`),
  `app/components/simple/DoneStep.tsx`,
  `TranslationResult`(`downloads`/`failedChunks`/`fallbackBlocks`/`totalChunks`/`stopReason`)
- **출력 형식**: `TranslationResult.content`는 **항상 정규 SRT**(미리보기·줄 수 집계가
  이걸 읽는다). 사용자가 받는 바이트는 `downloads[]`에 있고, 원본 형식으로 되돌릴 수
  있으면 `[원본 형식, srt]`, 아니면 `[srt]` 하나다. 되돌리기는 재작성이 아니라 원본
  문자열의 슬롯 치환(`emitInOriginalFormat`) — 실패하면 SRT 단독으로 물러선다.
- **품질 레버**: 출력 파일명 규칙 → `buildOutputFilename` / `constants.ts`
  `LANG_SUFFIX`(이제 `TARGET_LANGS`에서 파생 — 언어를 추가해도 따로 손댈 필요 없음)
  + `SOURCE_LANG_CODES`. 입력 확장자(`.srt`/`.vtt`/`.smi`/`.ass`/…)를 벗긴 stem에서
  직전 토큰이 화이트리스트 언어 코드면 도착어로 **교체**(`movie.it.vtt` →
  `movie.ko.vtt`), 아니면 **추가**(`movie.ass` → `movie.ko.srt`). 세 번째 인자가 받는
  확장자를 정하고, 입력과 같은 형식이면 원본 대소문자를 유지한다.
  완료 화면 실패 개수 표시 → `DoneStep.tsx`.

---

## 증상 → 고칠 곳 (빠른 인덱스)

| 증상 | 1차로 볼 곳 |
|---|---|
| VTT/SMI/ASS가 안 열리거나 큐가 비었다 | `app/lib/subtitles/` (`detect`/`parseVtt`/`parseSmi`/`parseAss`/`decode`), 업로드 `accept` — §0 · `decisions.md` §2-13 |
| SMI 한글이 깨짐 | `decodeSubtitleBytes` (UTF-8 → EUC-KR/CP949 폴백) — §0 |
| 올린 형식으로 받는 버튼이 안 뜬다 | `SubtitleDoc.roundTrip` — writer가 있는 포맷만 뜬다(현재 VTT). `document.ts`의 `WRITERS` — §10 |
| 받은 파일에서 스타일·헤더가 사라졌다 | splice가 아니라 SRT 폴백으로 내려갔을 가능성. `buildDownloads`의 콘솔 경고 확인 — §10 |
| 번역문에 원문 언어가 섞여 있다(SMI) | `resolveTrack` (`smi.ts`) — 트랙 2개 이상이면 업로드에서 거절되어야 한다 — §0 |
| 제목/연도가 파일명에서 잘못 뽑힘 | `content_analysis.txt`, `metadataInference.ts` |
| 감독/포스터 안 뜸·틀림 | `tmdb.ts` (`searchCandidates`/`lookupById`), `enrichMovie.ts` (`buildGroundedPrompt`) |
| 재검색해도 계속 다른(엉뚱한) 작품이 나옴 | `tmdb.ts` (`searchCandidates` 정렬), `enrichMovie.ts` (`searchMovie`의 후보 임계값), `InfoStep.tsx` (`CandidatePicker`) — §2-A "후보가 여러 개일 때" |
| 장르/배경·시대/톤앤매너가 이상함 | `enrichMovie.ts` (`buildKeywordPrompt` / `buildGroundedPrompt`) |
| 배경/시대가 개봉연도로 나옴 | `enrichMovie.ts` 프롬프트 (그라운딩·"개봉연도≠극중배경" 지침) |
| 번역이 직역투/어색함 | 해당 도착어의 `translation_rules_<code>.txt` |
| 도착어를 추가하고 싶음 | `app/config/languages.ts`에 한 행 + `prompts/common/translation_rules_<code>.txt` — §4. 실제 모델 출력 확인은 `LIVE_LANG_SMOKE=1 npx vitest run app/lib/prompts/liveLang.smoke.test.ts` |
| 영어/중국어인데 존댓말 관계표가 안 보임 | 정상 — 그 언어엔 문법적 말투 축이 없어 relations를 안 만든다(§2-C, `languages.ts`의 `formality: null`) |
| 영어 자막인데 문장 끝 마침표가 사라짐 | `languages.ts`의 `trailingPunctuation`이 비어 있어야 정상 — 값이 있으면 §9.7이 지운다 |
| 일본어/중국어 자막이 너무 빨리 지나감 | `languages.ts`의 `reading`(언어별 CPS) — §9.5 |
| 존댓말/반말·인물 말투가 안 맞음(말투 축이 있는 언어) | 먼저 InfoStep의 "등장인물·용어 일관성" 토글을 켜봤는지 확인(§2-C, 기본 OFF) — 켰다면 `cast_sheet_extraction.txt` 또는 카드에서 직접 관계 수정. 안 켰거나 그래도 안 맞으면 `translation_rules_ko.txt`, (cinematic) `cinematic_translation_philosophy_ko.txt`, `InfoStep`에서 사람이 톤 입력 |
| 같은 이름이 청크마다 다르게 번역됨(표기 흔들림) | InfoStep 토글을 켜지 않았으면 그게 원인(§2-C, 기본 OFF). 켰는데도 흔들리면 `extractCastSheet.ts` `sanitizeCastSheet`(환각 필터로 그 이름이 버려졌을 수 있음) 또는 카드에서 직접 추가 |
| 감정/뉘앙스가 밋밋함 | `cinematic_translation_philosophy_ko.txt` (+ 스타일을 cinematic로) |
| 줄이 25자 넘는데 안 나뉨(의미 단위 줄바꿈) | `translation_rules_ko.txt` 규칙 2 — AI가 `|`로 끊을 지점만 지정, 실제 줄바꿈은 코드. 끊을 위치 판단은 프롬프트로만 유도(§9.7 스코프 밖) |
| 마침표·쉼표가 줄 끝에 남아 있음 / 3줄 이상 나옴 / `...`가 `…`로 안 바뀜 | `srt.ts` (`enforceTextRules`) — 이 셋은 코드가 강제하므로 재발하면 버그. `decisions.md` §2-8 — §9.7 |
| 두 줄 자막이 한 줄로 붙어 나옴 | `translation_rules_<code>.txt` 규칙 2(`|` 하나로 끊기). 재조립이 `|`를 `\n`으로 바꾼다 → `srt.ts` `LINE_BREAK_MARK`, `indexTranslatedBodies` |
| 자막 본문에 `|`가 그대로 보임 | 재조립을 안 거친 산출물이거나(하네스 원본 등) `|`가 두 개 이상이라 2줄 상한에 걸린 경우 → `srt.ts` `indexTranslatedBodies`, `enforceTextRules` |
| 블록이 합쳐져 나옴(한 자막에 두 자막 내용) | 한 번호 = 한 줄 위반이라 블록 수 불일치로 잡힌다. 규칙 1·2를 확인하고, 재발하면 `decisions.md` §2-1 (3)의 실측 절차대로 하네스로 재현 |
| 자막이 밀림(번호 재배열) | 청크 크기 ↓ `constants.ts` `SERVER_CHUNK_SIZE` (**≥300 금지**), 재조립 `srt.ts`. 조절 절차는 위 §5 |
| 특정 구간에서 자막이 대거 미번역(원문 그대로) | 대사 자체가 숫자인 장면(카운트다운 등) → `srt.ts` `[N]` 표식(§7·§9, `decisions.md` §2-1)이 이미 방지함. 그래도 재발하면 그 청크의 `matched`/`unmatched` 로그 확인 |
| 청크가 대화 중간을 자름 | `srt.ts` (`chunkSrtBlocksAtGaps` 파라미터) |
| 한국어 자막이 너무 빨리 지나감(읽기 힘듦) | `srt.ts` (`adjustSubtitleTiming`), `constants.ts` `CPS_TARGET`/`MIN_SUBTITLE_GAP_MS` — §9.5 |
| 자막이 너무 짧게 스쳐 지나감(대사와 무관하게) | `srt.ts` (`adjustSubtitleTiming`), `constants.ts` `MIN_SUBTITLE_DURATION_MS` — §9.5 |
| 번역이 느림/비쌈 | `constants.ts` `SERVER_CHUNK_SIZE`/`CONCURRENCY`/`thinkingLevelForModel`, 모델(고급/빠른) |
| 특정 청크만 원문 그대로 | 그 청크 호출 실패 + sweep도 못 건짐 — `gemini.ts` 로그, `chunkRetry.ts`(1차 판단), `[sweep]` 콘솔 로그의 `stoppedBy` — §9.6·§9.65 |
| 일부 줄만 원문 그대로 | sweep을 통과하고도 남은 줄. `[sweep] ... stopped by` 로그로 원인 구분: `no-progress`(모델이 계속 같은 실패) / `budget`(호출 상한) / `fatal`(quota·auth) — §9.65 |
| 원문으로 남은 줄이 늘었는데 비용은 그대로 | sweep이 안 돌았다는 뜻. `leftover` 수거(`useTranslation.ts`)나 `unmatchedIndices` 배관(`srt.ts`→SSE)이 끊겼는지 확인 — §9.65 |
| sweep 때문에 비용이 걱정됨 | 상한은 `constants.ts` `RECOVERY`(라운드)와 `computeSweepBudget`(호출 수). 실제 소비는 `[sweep] ... calls N` 로그 — §9.65 |
| API 한도 초과 이후 남은 파일이 통째로 원문 | 의도된 전역 중단(quota/auth) — `chunkRetry.ts` `RetryState.fatalCode`, 화면엔 `stopReason` 배너 — §9.6 |
| 에러 종류에 따라 재시도/중단 동작을 바꾸고 싶음 | `translationErrors.ts` 분류(`classifyError`)·성격 함수(`isFatalCode`/`isRetryableCode`) — §9.6 |
| 진행 링이 너무 빨리 차서 99%에서 오래 기다림(또는 그 반대) | `constants.ts` `TRANSLATION_ESTIMATE_MS`(모델별), 이징 곡선은 `ProgressStep.tsx` — §6 |
| 화면 문구가 이상함 | `app/i18n/simpleCopy.ts` (하드코딩 금지) |

---

## 깨면 안 되는 불변식

1. **블록 수 계약**: 청크 입력 블록 수 = 출력 블록 수. 프롬프트가 이걸 강제하고
   (`composer.ts` 블록 수 지시), 재조립이 번호로 대조한다. 겹침 컨텍스트 같은 걸 넣을 때
   이 계약을 깨면 밀림이 생긴다.
2. **타임코드는 코드가 소유**: 모델엔 번호+대사만 보내고(`composer.ts` `stripTimestamps`),
   타임코드는 `reassembleTranslatedChunk`가 원본에서 복원한다. 모델 출력의 타임스탬프는
   신뢰하지 않는다.
3. **재번호 드리프트: `SERVER_CHUNK_SIZE`는 300 미만**. `B ≥ 300`이면 오류 발생.
   `SERVER_CHUNK_SIZE + tolerance`가 그 밑을 넘지 않게 유지. 조절 시 고칠 파일은 §5.
4. **UI 버킷 ↔ AI 버킷 ↔ 글로사리 버킷 분리**: 제목/연도/감독/포스터(화면용)와
   장르/배경/톤(프롬프트용)을 섞지 말 것. `notes`는 사용자 자유 입력 전용. 글로사리·
   존대관계(`CastSheet`)는 제3의 버킷 — `MovieInfo`에 합치지 말 것(§2-C).
5. **도착어 표는 하나뿐**: 언어별 값(프롬프트 라벨·줄 길이·말투 축·문장부호·읽기속도)은
   전부 `app/config/languages.ts`에 있다. 다른 파일에 `if (lang === 'ko')`류 분기를
   다시 만들지 말 것 — 그 분기가 곧 "언어를 늘렸는데 한 곳만 안 고쳐진" 버그다.

---

## 아직 안 붙은 것 (참고)

- `computeCps` (`srt.ts`) — 자막별 초당 문자수. 고급 번역의 길이 예산용 프리미티브.
  읽기속도 자동 조정(§9.5 `adjustSubtitleTiming`)은 같은 계산을 쓰지만, `computeCps`
  자체는 아직 다른 기능에 직접 연결돼 있지 않다.
- 청크 경계 겹침 컨텍스트 → `TODO.md`. 고유명사·호칭 글로사리와 인물별 말투 시트는
  §2-C로 완료(2026-07-26) — 더 이상 미착수 항목이 아님.

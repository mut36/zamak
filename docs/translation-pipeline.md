# 번역 파이프라인 지도

**품질관리용 지도.** 자막 한 편이 업로드부터 다운로드까지 거치는 전 과정을 순서대로
적고, **각 단계에서 품질을 바꾸려면 어느 파일/함수를 고치면 되는지**를 표시한다.
"왜 이렇게 되어 있는가"는 [`decisions.md`](decisions.md), 미착수 개선안은
[`TODO.md`](TODO.md), 청크 수치 유도는 [`tuning/`](tuning/) 참조.

> 파일 경로 + 함수/심볼 이름으로만 가리킨다(줄 번호는 금방 어긋나서 안 적음).
> 기준 시점: 2026-07-26. 구조가 바뀌면 이 문서도 같이 고칠 것.

메인 경로는 **영화·드라마 분기**다. "기타 영상" 분기는 3단계에서 갈린다.

---

## 전체 흐름 (한눈에)

```
업로드
  → 파일명 파싱 (제목/연도 추측)
  → /api/analyze         제목·연도 확정 (AUX 모델)
  → [영화] /api/enrich    TMDB + 그라운딩 → 제목/연도/감독/포스터 + 장르/배경/톤
    [기타] /api/summarize 자막 앞부분 요약 → notes
  → (opt-in, 토글 ON시) /api/glossary  전체 자막 1회 스캔 → 글로사리+존대관계
  → InfoStep             사람이 검토·수정 (+ 글로사리 카드, 켰다면)
  → /api/translation/begin  크레딧 1 차감 → jobId
  → 청킹 (장면 갭 기준)
  → 청크별 병렬 /api/translate
       └ 프롬프트 조합 → Gemini 호출 → 타임코드 재조립
  → 조립 → 다운로드
```

---

## 단계별 상세 + 품질 레버

### 0. 업로드 & SRT 파싱
- **코드**: `app/components/simple/UploadStep.tsx`, `app/hooks/useTranslation.ts`
  (`processFile`), `app/lib/srt.ts` (`parseSrtBlocks`)
- **하는 일**: `.srt` 검증, 블록 분리(번호/타임코드/본문).
- **품질 레버**: 거의 없음(형식 파싱). 이상한 SRT가 안 걸러진다면 `isSrt` /
  `parseSrtBlocks`.

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
  (`enrichMovie` → `enrichFromTmdb` → `lookupTitle` + `extractKeywords`;
  TMDB 미스 시 `enrichWithGrounding`), TMDB 조회 `app/lib/server/tmdb.ts`.
- **하는 일 / 두 버킷**:
  - **UI 버킷** (화면 표시): 제목·연도·감독·포스터 — TMDB 매치 시 TMDB에서, 미스 시 그라운딩.
  - **AI 버킷** (번역 프롬프트로만 감): 장르(TMDB) + 배경/시대·톤앤매너(그라운딩 검색).
- **품질 레버**:
  - 제목/연도/감독/포스터 틀림 → TMDB 매칭 로직 `tmdb.ts` (`lookupTitle`), 또는 미스 시
    그라운딩 프롬프트 `enrichMovie.ts` (`buildGroundedPrompt`)
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
  기억)을 켜면 전체 자막을 한 번 스캔해 ①인물·지명·용어의 확정 한국어 표기(글로사리)와
  ②인물 간 존댓말/반말(방향성 있음, 자막 블록 범위가 붙음)을 뽑는다. 파일당 1회이고
  청크별 병렬 번역 호출과 별개 — 결과가 모든 청크 프롬프트에 주입된다(§7). **OFF가
  기본값이라 이 라우트는 사용자가 켜기 전엔 절대 호출되지 않는다.**
- **왜 opt-in인가**: 추출에 20~40초 걸린다. 토글을 켜면 InfoStep 진입과 동시에
  백그라운드로 돌아 지연이 대부분 숨지만(사람이 작품 정보를 검토하는 동안 끝남), 처음
  켜는 순간만은 그 지연이 노출된다. 번역 모델(고급/빠른) 선택과는 **무관한 독립
  토글**이다 — 결정 배경은 `decisions.md` §2-8.
- **품질 레버**:
  - 표기·관계가 틀리거나 아예 안 잡힘 → `prompts/common/cast_sheet_extraction.txt`
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
  - 도착어 → `app/config/languages.ts` (`TARGET_LANGS` enabled 플래그)

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
    - `{{translationRules}}` → `prompts/common/translation_rules_ko.txt`
  - **유저 턴**: `<content_metadata>`(`formatMovieInfo` — 제목/연도/장르/배경·시대/톤앤매너)
    + `<user_notes>` + 청크 위치 + `<glossary>`(파일 전체 표기, §2-C 켰을 때만) +
    `<speech_relations>`(이 청크의 블록 범위와 겹치는 관계만, `getBlockIndexRange` +
    `renderGlossaryTags` — §2-C) + `<subtitle_data>`(타임스탬프 제거, **줄마다
    `[N] 대사` 표식** — `formatBlocksForModel`, `srt.ts`) + 블록 수 지시(구조 기반
    카운트, `parseSrtBlocks(...).length`)
- **품질 레버 (여기가 가장 큰 번역 품질 레버들)**:
  - 번역 규칙(직역 금지·말투·줄길이·마침표 등) → **`translation_rules_ko.txt`**
  - 영화적 번역 철학(인물 목소리·감정·압축) → **`cinematic_translation_philosophy_ko.txt`**
    (cinematic에서만 적용)
  - 페르소나/프롬프트 인젝션 방어 → `subtitle_translation_system.txt`
  - 메타데이터가 프롬프트에 실리는 형식 → `translationContent.ts` (`formatMovieInfo`)
  - 도착어별 규칙 로딩 → `translationContent.ts` (`getLanguageConfig`), `loader.ts`
  - 영어 타깃 규칙 → `translation_rules_en.txt`
  - 이름 표기·존대가 청크마다 흔들림 → §2-C(추출) 참조. 표기는 `translation_rules_ko.txt`
    규칙 5·12에서 고정 규칙으로 못박혀 있음
- **주의**: `translation_rules_ko_original.txt`는 참고용 원본 사본(파이프라인 미사용).
  `castSheet`가 없으면(토글 OFF, 기본값) `<glossary>`/`<speech_relations>`는
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
    둘 다 env, 변경 시 dev 서버 재시작. 로그에 `thinking=`로 찍힘
  - **엄격 모드**(출력 검증+재시도+블록단위 재번역) → `translationService.ts`,
    `TRANSLATION_STRICT_MODE=true`로 켬(기본 off, 비용 폭탄 위험 있어 신중히)

### 9. 타임코드 재조립
- **코드**: **`app/lib/srt.ts` (`reassembleTranslatedChunk`, `indexTranslatedBodies`,
  `formatBlocksForModel`)**
- **하는 일**: 모델 출력을 **줄마다 붙은 `[N]` 표식으로 대조**해 원본 타임코드와 재결합.
  매칭 안 된 블록은 원문 유지 → 이후 자막이 안 밀림. 타임스탬프는 모델에 안 보내므로
  여기서 복원됨. 표식이 본문과 같은 줄에 있어(2026-07-25, `decisions.md` §2-1)
  ①대사가 순수 숫자여도("8", "1999") 표식과 안 겹치고 ②모델이 표식을 빠뜨려도 그
  텍스트가 이웃 블록을 오염시키지 못한다(빈 줄 뒤 표식 없는 고아는 버림). 같은 번호가
  반복된 줄들은 한 블록의 여러 줄로 합쳐짐. 순서 상관없이 아무 마커나 인정.
- **품질 레버**: 재번호 밀림 탐지/수리(현재 미구현 — 모델이 스스로 잘못된 `[N]`을
  내보내는 별개의 실패 모드, 표식 방식과 무관) → `srt.ts` + `TODO.md`. 이게 밀림
  버그의 방어선.

### 9.5. 리딩스피드·최소 길이 타임코드 조정 (CPS / minDuration)
- **코드**: **`app/lib/srt.ts` (`adjustSubtitleTiming`)**, `constants.ts`
  (`CPS_HARD_MAX`/`CPS_TARGET`/`CPS_RECOMMENDED_MIN`/`MIN_SUBTITLE_GAP_MS`/
  `MIN_SUBTITLE_DURATION_MS`), `useTranslation`에서 청크 합친 직후 1회 호출.
- **하는 일**: 두 가지 독립된 조건 중 하나라도 걸리면 같은 방식으로 넓힌다 —
  ① **`cps > CPS_HARD_MAX`**(기본 12, Netflix 한국어 상한, 대사가 있는 블록만) 또는
  ② **구간 길이 < `MIN_SUBTITLE_DURATION_MS`**(기본 800ms, 대사 유무 무관 — 빈 블록도 대상).
  두 조건의 요구량 중 **큰 쪽**을 목표로, **이웃이 비운 침묵(gap)** 안에서 표시창을 넓힌다.
  end를 먼저 뒤로 밀고 모자라면 start를 앞으로 당김. 첫 블록은 앞의 빈 프리롤(0초까지)로
  start를 당길 수 있다. **창은 늘리기만 하고 줄이지 않으며, 절대 겹치지 않는다** — 앞
  블록은 조정된 end, 뒤 블록은 원본 start를 경계로 쓰는 비대칭 + `MIN_SUBTITLE_GAP_MS`.
  전체 파일에 한 번 돌아 청크 경계 이웃까지 커버. 타임코드를 코드가 소유한다는 원칙의 연장.
- **임계값 3단(CPS)**: 12 초과 = 손봄(위반), 10 = 착지 목표, 8 = 그 아래로는 안 내림(목표가
  10이라 자동 보장). 10~12 사이는 상한 밑이라 손대지 않는다.
- **품질 레버**: `CPS_HARD_MAX`(낮추면 더 많은 블록을 손봄), `CPS_TARGET`(낮추면 더 여유롭게
  늘리지만 gap을 더 씀), `MIN_SUBTITLE_GAP_MS`(인접 최소 간격), `MIN_SUBTITLE_DURATION_MS`
  (올리면 더 많은 짧은 블록이 늘어남). 모두 `constants.ts` + env.
  gap이 부족하면 목표까지 못 내려가고 가능한 만큼만 조정.
- **알려진 한계**: 연속 밀집 구간에서 앞 블록이 공유 gap을 end로 먼저 선점하면(greedy) 뒤
  블록이 backward-room을 못 써 덜 조정된다(decisions §2-5). 실측(1480블록)상 여유가 있는데
  미조정으로 남는 블록은 2개 수준.

### 10. 조립 & 다운로드
- **코드**: `useTranslation`(청크 결과 합치기 + §9.5 조정), `app/lib/srt.ts` (`buildOutputFilename`),
  `app/components/simple/DoneStep.tsx`, `TranslationResult`(`failedChunks`/`totalChunks`)
- **품질 레버**: 출력 파일명 규칙 → `buildOutputFilename` / `constants.ts`
  `LANG_SUFFIX` + `SOURCE_LANG_CODES`. `.srt` 직전 토큰이 화이트리스트 언어
  코드면 도착어로 **교체**(`movie.it.srt` → `movie.ko.srt`), 아니면 **추가**
  (`movie.srt` → `movie.ko.srt`). 완료 화면 실패 개수 표시 → `DoneStep.tsx`.

---

## 증상 → 고칠 곳 (빠른 인덱스)

| 증상 | 1차로 볼 곳 |
|---|---|
| 제목/연도가 파일명에서 잘못 뽑힘 | `content_analysis.txt`, `metadataInference.ts` |
| 감독/포스터 안 뜸·틀림 | `tmdb.ts` (`lookupTitle`), `enrichMovie.ts` (`buildGroundedPrompt`) |
| 장르/배경·시대/톤앤매너가 이상함 | `enrichMovie.ts` (`buildKeywordPrompt` / `buildGroundedPrompt`) |
| 배경/시대가 개봉연도로 나옴 | `enrichMovie.ts` 프롬프트 (그라운딩·"개봉연도≠극중배경" 지침) |
| 번역이 직역투/어색함 | `translation_rules_ko.txt` |
| 존댓말/반말·인물 말투가 안 맞음 | 먼저 InfoStep의 "등장인물·용어 일관성" 토글을 켜봤는지 확인(§2-C, 기본 OFF) — 켰다면 `cast_sheet_extraction.txt` 또는 카드에서 직접 관계 수정. 안 켰거나 그래도 안 맞으면 `translation_rules_ko.txt`, (cinematic) `cinematic_translation_philosophy_ko.txt`, `InfoStep`에서 사람이 톤 입력 |
| 같은 이름이 청크마다 다르게 번역됨(표기 흔들림) | InfoStep 토글을 켜지 않았으면 그게 원인(§2-C, 기본 OFF). 켰는데도 흔들리면 `extractCastSheet.ts` `sanitizeCastSheet`(환각 필터로 그 이름이 버려졌을 수 있음) 또는 카드에서 직접 추가 |
| 감정/뉘앙스가 밋밋함 | `cinematic_translation_philosophy_ko.txt` (+ 스타일을 cinematic로) |
| 줄이 너무 김/마침표 등 표기 규칙 | `translation_rules_ko.txt` |
| 두 줄 자막이 한 줄에 `/`로 붙어 나옴 | `translation_rules_ko.txt` 규칙 8·10 예시(같은 번호 줄을 실제 줄바꿈으로 표기, 슬래시 구분 금지). 재조립은 같은 번호를 `\n`으로 합침 → `srt.ts` `indexTranslatedBodies` |
| 자막이 밀림(번호 재배열) | 청크 크기 ↓ `constants.ts` `SERVER_CHUNK_SIZE` (**≥300 금지**), 재조립 `srt.ts`. 조절 절차는 위 §5 |
| 특정 구간에서 자막이 대거 미번역(원문 그대로) | 대사 자체가 숫자인 장면(카운트다운 등) → `srt.ts` `[N]` 표식(§7·§9, `decisions.md` §2-1)이 이미 방지함. 그래도 재발하면 그 청크의 `matched`/`unmatched` 로그 확인 |
| 청크가 대화 중간을 자름 | `srt.ts` (`chunkSrtBlocksAtGaps` 파라미터) |
| 한국어 자막이 너무 빨리 지나감(읽기 힘듦) | `srt.ts` (`adjustSubtitleTiming`), `constants.ts` `CPS_TARGET`/`MIN_SUBTITLE_GAP_MS` — §9.5 |
| 자막이 너무 짧게 스쳐 지나감(대사와 무관하게) | `srt.ts` (`adjustSubtitleTiming`), `constants.ts` `MIN_SUBTITLE_DURATION_MS` — §9.5 |
| 번역이 느림/비쌈 | `constants.ts` `SERVER_CHUNK_SIZE`/`CONCURRENCY`/`thinkingLevelForModel`, 모델(고급/빠른) |
| 특정 청크만 원문 그대로 | 그 청크 호출 실패(원문 폴백) — `gemini.ts` 로그, `translationService.ts` |
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

---

## 아직 안 붙은 것 (참고)

- `computeCps` (`srt.ts`) — 자막별 초당 문자수. 고급 번역의 길이 예산용 프리미티브.
  읽기속도 자동 조정(§9.5 `adjustSubtitleTiming`)은 같은 계산을 쓰지만, `computeCps`
  자체는 아직 다른 기능에 직접 연결돼 있지 않다.
- 청크 경계 겹침 컨텍스트 → `TODO.md`. 고유명사·호칭 글로사리와 인물별 말투 시트는
  §2-C로 완료(2026-07-26) — 더 이상 미착수 항목이 아님.

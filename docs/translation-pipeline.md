# 번역 파이프라인 지도

**품질관리용 지도.** 자막 한 편이 업로드부터 다운로드까지 거치는 전 과정을 순서대로
적고, **각 단계에서 품질을 바꾸려면 어느 파일/함수를 고치면 되는지**를 표시한다.
"왜 이렇게 되어 있는가"는 [`decisions.md`](decisions.md), 미착수 개선안은
[`TODO.md`](TODO.md), 청크 수치 유도는 [`tuning/`](tuning/) 참조.
Netflix 한국어 Timed Text 규칙(참조 번역)과 ZAMAK 준수/갭 대조는
[`standards/netflix-korean-subtitles.md`](standards/netflix-korean-subtitles.md) ·
[`standards/netflix-korean-gap-review.md`](standards/netflix-korean-gap-review.md).

> 파일 경로 + 함수/심볼 이름으로만 가리킨다(줄 번호는 금방 어긋나서 안 적음).
> 기준 시점: 2026-07-31. 구조가 바뀌면 이 문서도 같이 고칠 것.

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
  → [영화·프로] /api/note  전체 자막 1회 스캔 → 연출 메모(짧은 산문) → notes
              (§2-C. 글로사리 표를 대체한 경로 — decisions.md §6-26)
  → WorkPickStep          후보 선택(영화) / 유형·톤 입력(예능·다큐)
  → TranslateSettingsStep 사람이 검토·수정 (+ 연출 메모 카드, 영화면 항상)
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
- **콘텐츠 유형이 여기서 정해진다** (2026-07-31~): 드롭존은 유형을 고르기 전까지
  잠겨 있고, 그 한 번의 선택이 **두 가지**를 동시에 정한다 — ① 정보 수집 분기
  (`movie`만 TMDB enrich, `variety`/`doc`은 summarize — 아래 2-A/2-B), ②
  **읽기 속도 프로필**(`languages.ts`의 `shapes`). 값은
  `ContentType`(=`ContentProfileKey`) `movie` / `variety` / `doc`. 한 줄 자수는
  프로필과 무관하다 — 도착어가 정한다(§9.5 아래 주석, `decisions.md` §1-19).
- **코드**: `app/components/simple/UploadStep.tsx`, `app/hooks/useTranslation.ts`
  (`processFile`), **`app/lib/subtitles/`** (`toCanonicalSrt`, `detect`, `parseVtt`/
  `parseSmi`/`parseAss`, `readSubtitleFile`), 이후 `app/lib/srt.ts` (`parseSrtBlocks`)
- **하는 일**: `.srt`/`.vtt`/`.smi`/`.ass`/`.ssa` 검증 → 바이트 디코드(SMI는 UTF-8
  실패 시 EUC-KR/CP949) → `parseSubtitleDocument`가 **정규 SRT + 원본 오프셋 맵**
  (`SubtitleDoc`)을 만듦 → 블록 분리(번호/타임코드/본문). 이후 파이프라인은 SRT만 본다.
  원본과 맵은 다운로드 단계에서 원본 형식으로 되돌리는 데만 쓰인다 (`decisions.md` §2-13).
- **읽기 실패는 여기서 끝난다**: 파싱은 `app/hooks/useWizard.ts`의 `handleFile`이
  await하므로, 읽히지 않는 파일·이중 언어 SMI는 업로드 화면에 머무른다(다음
  단계로 안 넘어감).
- **차감 장수도 여기서 정해진다** (2026-08-21~, `decisions.md` §6-22): 같은
  `handleFile`이 파싱 직후 `countBlocks(doc.srt)`를 세고, `creditsForUpload`가
  `BLOCKS_PER_CREDIT`(1,200)로 나눠 **올림**한 장수를 업로드 화면에 표시한다
  (`COPY.credits.cost`). 파일이 길다고 거절하지 않는다 — 2026-07-31~08-21에는
  상한(2,000블록) 초과를 여기서 돌려보냈지만, 그 상한과 `/api/translation/begin`의
  413은 함께 없어졌다.
  **화면의 장수는 예고일 뿐 과금이 아니다** — 실제 차감은 `begin_translation_job`이
  자기가 받은 블록 수로 다시 계산한다(`0015_credit_by_lines.sql`). 두 숫자가
  갈라지면 화면이 약속한 것과 청구가 어긋나므로, 클라이언트와 서버가 **같은
  `parseSrtBlocks` 결과**를 세도록 `countBlocks` 한 곳을 통과시킨다.
  `useWizard.test.ts`가 경계(정확히 1,200줄 → 1장, 1,201줄 → 2장)를 고정한다.
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
- **후보가 여러 개일 때 (1순위 자동 채택, "아니에요"를 눌러야만 목록)**: `searchMovie`는
  TMDB 검색 결과가 정확히 1개면 바로 상세조회까지 진행하지만, **2개 이상이면(제목이
  흔하거나 리메이크가 있을 때) era/tone 추출 없이 후보 목록만 반환**한다
  (`{status:'ambiguous', candidates}`, 최대 `MAX_ENRICH_CANDIDATES`개 — `constants.ts`).
  클라이언트(`useWizard.ts`의 `runEnrich`)는 이 목록의 **첫 후보를 그 자리에서
  `/api/enrich` 선택 모드로 다시 호출**해 `enrichMovieById`가 상세조회+era/tone
  추출을 마무리하고, 확신 있는 단일 매치와 완전히 같은 확인 배너("'X'로 인식했어요.
  맞나요?")를 설정 화면에 띄운다. 사용자가 "아니에요"를 눌러야만 `WorkPickStep.tsx`가
  포스터·제목·연도·영화/드라마 구분으로 후보 카드(`CandidateCard`) 전체 목록을
  보여주고, 거기서 다시 고르면(`onSelect` → `confirmWorkPick`) `/api/enrich`를 선택
  모드로 또 호출한다. 1순위 자동 해소 자체가 실패한 경우(드묾)에만 곧장 후보 목록
  화면으로 간다 — 상세는 `docs/decisions.md` §6-4.
- **품질 레버**:
  - 제목/연도/감독/포스터 틀림 → TMDB 검색·정렬 로직 `tmdb.ts` (`searchCandidates`의
    연도매칭→인기도 정렬), 상세조회 `tmdb.ts` (`lookupById`), 또는 미스 시 그라운딩
    프롬프트 `enrichMovie.ts` (`buildGroundedPrompt`)
  - 후보가 계속 엉뚱한 작품으로 자동 선택됨(재검색 정확도) → `tmdb.ts`
    (`searchCandidates`의 정렬 기준), 후보 노출 상한 `constants.ts`
    `MAX_ENRICH_CANDIDATES`, 후보 카드 UI `WorkPickStep.tsx` (`CandidateCard`)
  - 장르/배경·시대/톤앤매너 품질 → **`enrichMovie.ts`의 `buildKeywordPrompt`
    (TMDB 매치용) / `buildGroundedPrompt` (미스용)**. **배경/시대는 "시대, 지역"
    짧은 구절 하나로 못박혀 있다**(2026-07-28) — 전엔 "사회/문화적 특이사항"까지
    요청해서 줄거리·소재 키워드(마피아 부패, 환경보호 등)가 섞여 나왔다. 이 칸은
    말투 추론의 핵심 힌트라 짧게 유지해야 함(§2-C, `translation_rules_<code>.txt`
    규칙 5)
  - 한국어 제목 없을 때 음차 → `enrichMovie.ts` (`needsTransliteration` + 프롬프트)
  - 관련 결정: 배경/시대가 개봉연도로 나오던 버그는 그라운딩 전환으로 해결(커밋
    `9bf6e1c`). 인물별 말투·글로사리는 의도적으로 보류 → `TODO.md`.

### 2-B. 작품 정보 수집 — 기타 영상 (summarize)
- **코드**: `app/api/summarize/route.ts` (AUX 모델, 앞 `SUMMARY_SAMPLE_LINES`줄 샘플)
- **하는 일**: 내용 1~2문장 요약 → `movieInfo.notes` (`TranslateSettingsStep`에서 사용자가 보고 고칠 수 있는 입력란).
- **품질 레버**: 요약 프롬프트는 `summarize/route.ts` 안에 인라인. 샘플 줄 수는
  `constants.ts` `SUMMARY_SAMPLE_LINES`.

### 2-C. 연출 메모 추출 (프로 + 영화 전용)

> **2026-08-21부터 이 자리는 연출 메모가 쓴다.** 글로사리·존대관계 표는
> `GLOSSARY_ENABLED = false`로 꺼져 있다 — 표 자체가 아니라 표에 준 권한이
> 번역 품질을 깎았기 때문이다(`decisions.md` §6-26). 아래 2-C-old는 되살릴 때를
> 위해 남긴 기록이고, **오늘 도는 것은 2-C-new다.**

#### 2-C-new. 연출 메모 (도는 경로)

> **판정은 `directorNoteAppliesTo(model)` 하나다** (`app/lib/glossaryGate.ts`):
> `DIRECTOR_NOTE_ENABLED && creditKindForModel(model) === 'pro'`. 여기에
> **영화 분기 조건**이 하나 더 붙는다(`useWizard`) — 비영화는 `/api/summarize`가
> 이미 같은 `notes` 칸을 쓰므로, 둘 다 돌면 한 필드에 기록자가 둘이 되고
> "먼저 도착한 쪽"이라는 경주가 된다.

- **코드**: `app/api/note/route.ts` → `app/lib/server/extractDirectorNote.ts`
  (`extractDirectorNote` → `fetchCastAnchors` + `buildUserTurn`을
  `extractCastSheet.ts`에서 **그대로 재사용** → 프로바이더 분기 →
  `sanitizeDirectorNote`), 훅 `app/hooks/useDirectorNote.ts`, 프롬프트
  `prompts/common/director_note.txt`, 화면은 `TranslateSettingsStep`의 메모 카드.
- **하는 일**: 자막 전체를 한 번 읽고 **짧은 산문 메모**를 써서
  `movieInfo.notes`에 넣는다. 세 종류만 적게 프롬프트가 제한한다 —
  ①말투 지형(쌍 나열 금지, 덩어리로) ②내레이션·낭독의 문체
  ③**오용 위험이 있는 표기 몇 개만**(등장인물 전원 나열 금지).
- **왜 표가 아니라 메모인가**: 메모는 `<user_notes>`로 실린다. 그 태그는 시스템
  프롬프트의 신뢰 경계 목록에 이미 있는 **데이터** 태그이고, 규칙을 이길 권한이
  구조적으로 없다. 표를 약하게 만든 게 아니라 권한을 줄 수 없는 자리에 놓았다.
- **품질 레버**:
  - 메모가 일반론을 늘어놓음("자연스럽게 옮겨라" 같은 것) → `director_note.txt`의
    `[가장 중요한 것]` 절. 번역가가 이미 아는 것을 적지 말라고 최상단에 박혀 있다.
  - 등장인물 이름을 전부 나열함 → 같은 파일 3번 항목의 선별 기준.
  - 메모가 너무 김 → `DIRECTOR_NOTE_MAX_CHARS`(기본 600). **프롬프트와 코드 양쪽에**
    걸려 있다. 길어지면 다시 규칙이 되고, 그게 글로사리가 실패한 방식이다.
  - 마지막 문장이 중간에서 끊김 → `sanitizeDirectorNote`는 **줄 단위**로 버린다.
    문자로 자르면 `Aldo Moro → 알도 모`처럼 틀린 지시가 남는다.
  - 사용자 입력이 덮임 → 그럴 수 없다. 자동 채우기는 `prev.notes || note`이고,
    통째로 덮는 것은 "다시 쓰기"뿐이며 그 전에 확인을 받는다(CLAUDE.md 불변식 5).
  - 메모가 비어 있음 = 정상 강등. 어떤 실패(키 없음·API 오류·파싱 실패)든 빈
    문자열로 떨어지고 번역을 막지 않는다.
- **관측**: 서버 로그 `[note] provider=… model=… prompt=… output=…` 한 줄(파일당 1회).
- **비용**: 글로사리와 같은 프로바이더·모델·발췌 로직을 쓰므로 입력 원가는 같고,
  출력이 표(수십 항목 JSON)에서 산문 한 덩이(≤600자)로 줄어 더 싸다.

#### 2-C-old. 글로사리·존대관계 추출 (현재 꺼짐 — 되살릴 때의 기록)

> **판정은 `glossaryAppliesTo(model)` 하나다** (`app/lib/glossaryGate.ts`):
> `GLOSSARY_ENABLED && creditKindForModel(model) === 'pro'`. 사용자가 켜고 끄는
> 토글은 없다 — 프로면 항상 돌고 라이트면 안 돈다(`decisions.md` §6-25).
> 이 함수를 **클라이언트와 서버가 함께 읽는다**: `useWizard`가 카드와 추출을
> 켜고, `requestValidation.ts`가 라이트 요청의 `castSheet`를 버리며,
> `/api/glossary`가 프로가 아닌 요청에 빈 시트를 돌려준다. 불변식 4는 화면
> 조건부 렌더가 아니라 서버가 지킨다 — 낡은 탭 하나면 깨지기 때문이다.
> `GLOSSARY_ENABLED`(옛 이름 `GLOSSARY_UI_ENABLED`)는 이제 **비상 차단기**로만
> 남는다 — 추출 프로바이더가 죽으면 재배포 없이 여기서 경로 전체를 끈다.

- **코드**: `app/api/glossary/route.ts` → `app/lib/server/extractCastSheet.ts`
  (`extractCastSheet` → `fetchCastAnchors`(TMDB cast, best-effort) + 프로바이더
  분기(`GLOSSARY_PROVIDER`, 기본 `openai` → `openaiGenerateJson` Structured
  Outputs / `gemini` → Gemini `responseSchema`) → `sanitizeCastSheet`), 렌더
  `app/lib/prompts/glossaryContent.ts` (`renderGlossaryTags`), 프롬프트
  `prompts/common/cast_sheet_extraction.txt`, 토글 훅 `app/hooks/useCastSheet.ts`,
  카드 `app/components/simple/CastSheetCard.tsx`.
- **하는 일**: 프로 번역이면 TranslateSettingsStep 진입과 동시에 전체 자막을 한 번 스캔해 ①인물·지명·용어의 확정 **도착어 표기**(글로사리,
  `GlossaryTerm.target`)와 ②인물 간 말투(방향성 있음, 자막 블록 범위가 붙음)를 뽑는다.
  말투 값은 언어 중립(`formal`/`informal`/`mixed`)으로 저장하고, 프롬프트·UI에는
  도착어의 어휘(존댓말·반말 / 敬語·タメ口 / usted·tú …)로 번역해 보여준다 —
  라벨 출처는 `app/config/languages.ts`의 `TargetLang.formality`.
  ③**내레이션 문체**(`CastSheet.narration` — `none`/`formal`/`literary`/`mixed`)도
  같이 판정한다. 청크마다 따로 판단하면 1번 청크는 낭독으로 3번 청크는 서술로 읽어
  어미가 갈리므로 파일당 한 번 정한다. 렌더는 태그가 아니라 유저 턴의 한 줄이고
  (`NARRATION_LINE`, `glossaryContent.ts`), `none`이면 아무것도 안 붙는다.
  잘못된 해요체 내레이션은 프리패스가 안 도는 라이트에서도 결함이므로,
  `translation_rules_ko.txt` 9번이 "대화가 아닌 글에 해요체 금지"를 상시로 받는다.
  **말투 축이 없는 언어(영어·중국어)는 `formality: null`이라 relations를 아예 뽑지
  않고 `<speech_relations>` 태그도 나가지 않는다**(§7). 파일당 1회이고
  청크별 병렬 번역 호출과 별개 — 결과가 모든 청크 프롬프트에 주입된다(§7).
  **라이트 번역이면 이 라우트는 호출되지 않는다.**
- **왜 프로 전용인가**: 추출에 20~40초 걸리고 파일당 한 번 모델을 더 태운다.
  `COPY.settings.proDesc`가 이미 "작품 맥락 분석과 인물명 일관성"을 프로의 약속으로
  팔고 있고, 프로 손익분기 계산(`tuning/cost-per-block.md`)에 이 원가가 이미 들어가
  있다 — 말과 값이 둘 다 "프로에 포함"을 가리킨다. 지연은 사람이 작품 정보를
  검토하는 동안 백그라운드로 돌아 대부분 숨고, 남는 만큼은 하단 바의 ETA가
  합산해 말한다(`GLOSSARY_WAIT_MS`). 결정 배경은 `decisions.md` §2-9 · §6-25.
- **사람이 고칠 수 있어야 한다**: 번역 AI는 이 표를 **그대로 따른다**(참고 자료가
  아니다 — `glossary_directive.txt`, §6-24). 그래서 편집 화면(`CastSheetCard` +
  `GlossaryTermsTab`/`SpeechRelationsTab`)은 편의 기능이 아니라 이 설계의 전제다:
  표가 틀렸을 때 바로잡을 수 있는 유일한 지점이다. 카드는 **말투 탭이 펼쳐진 채**
  나온다 — 틀릴 수 있는 쪽이 말투이기 때문이다(표기는 실측에서 이형 0건).
- **품질 레버**:
  - **target에 자막에 없는 성·직함이 붙음**(`Camillo` → `카밀로 벨로키오`) →
    `cast_sheet_extraction.txt` 할 일 1의 "target은 source를 대체할 표기" 조항.
    번역 AI가 표를 그대로 따르므로(§6-24) 이게 틀리면 애칭을 부르는 장면까지
    풀네임으로 나간다. 성은 `note`에 적히면 된다 — note도 프롬프트에 함께 나간다.
  - 표기·관계가 틀리거나 아예 안 잡힘 → `prompts/common/cast_sheet_extraction.txt`
    (말투 파트는 별도 파일 `prompts/common/cast_sheet_formality_task.txt` — 말투 축이
    있는 언어에서만 주입됨, `extractCastSheet.ts`의 `buildSystemInstruction`)
  - 지어낸 이름이 섞임(환각) → `extractCastSheet.ts`의 `sanitizeCastSheet`
    (실제 자막 문자열에 없는 `source`는 버림 — 이게 이 기능의 핵심 방어선)
  - **지명·조직명이 화자(from/to)로 섞임** → `sanitizeCastSheet`의 `validTargets`가
    `kind==='person'`인 term만 허용(2026-07-28). 전엔 kind 무관 전체 term이 후보였음
    — 프롬프트(`cast_sheet_formality_task.txt`)도 "from/to는 인물만" 명시로 이중 방어
  - 인물명 표기가 TMDB와 다름 → `tmdb.ts`의 `cast`(상위 12명, 배역명+배우명, 한국어
    표기는 아님 — 식별 힌트일 뿐 모델이 직접 음차)
  - 청크당 프롬프트 비용이 커짐 → `constants.ts` `GLOSSARY_MAX_TERMS`/`_RELATIONS`/`_CHARS`
  - 후반 청크가 초반 관계를 물려받음(또는 그 반대) → 있으면 안 되는 일 — `composer.ts`가
    `getBlockIndexRange`로 청크의 실제 블록 범위를 구해 겹치는 관계만 넣는다
    (`glossaryContent.ts` `renderGlossaryTags`)
  - 사람이 잘못된 항목을 고치고 싶음 → `CastSheetCard.tsx`에서 직접 편집(표기/삭제/추가,
    말투 드롭다운) 가능
  - **모델·프로바이더** → `GLOSSARY_PROVIDER`(기본 `openai`) + `GLOSSARY_MODEL`(기본
    `gpt-5.6-luna`). 실패·키 없음은 빈 시트 + warn 로그 — 번역을 막지 않음(§2-9).
    `GLOSSARY_THINKING_LEVEL`은 Gemini 경로에서만 의미 있음. 비용 관측은
    `[glossary] provider=… model=… prompt=… output=…` 한 줄(파일당 1회)
- **모델·비용 비교 실험**: `scripts/glossary-ab.mts` (`npm run glossary`)가
  `extractCastSheet.ts`에서 export된 `buildSystemInstruction`/`buildUserTurn`/
  `sanitizeCastSheet`/`fetchCastAnchors`/`CAST_SHEET_JSON_SCHEMA`를 그대로 재사용해
  **같은 프롬프트**를 Gemini(기본)·Claude·OpenAI 세 프로바이더에 각각 태운다
  (`provider=gemini|claude|openai`). Claude 호출은 `app/lib/providers/claude.ts` —
  **번역 production 경로(`registry.ts`, `ALLOWED_MODELS`)는 안 건드림**. OpenAI는
  글로사리 production에도 쓰이므로 `OPENAI_API_KEY`가 실험 전용이 아니다.
  `GLOSSARY_DEBUG=1`(스크립트가 자동 설정)이 `[glossary-sanitize]` 줄로 kind별
  term 개수·`droppedNonPerson`(지명이 화자로 잘못 뽑힌 뒤 코드가 걸러낸 수)을 찍는다 —
  2026-07-28 지명 오분류 버그의 회귀 감시 지표.
  **프로덕션 기본 모델: GPT-5.6-luna**(`decisions.md` §2-14) — 근거는 비용이 아니라
  관계 추론 역량 차이(flash-lite는 명백한 증거가 있는 관계도 놓침). Gemini로
  롤백하려면 `GLOSSARY_PROVIDER=gemini` + Gemini `GLOSSARY_MODEL`.

### 3. 사용자 검토·수정 (WorkPickStep → TranslateSettingsStep)
- **코드**: 작품 후보 확정·기타 유형/톤 입력은 `app/components/beta/WorkPickStep.tsx`,
  이후 배경/시대·톤앤매너 편집·모델 선택은 `app/components/beta/TranslateSettingsStep.tsx`
  (문구 `app/i18n/simpleCopy.ts` `COPY.workPick`/`COPY.settings`), 글로사리 카드는
  `app/components/simple/CastSheetCard.tsx`(§2-C). 옛 단일 화면
  `app/components/simple/InfoStep.tsx`는 이 두 화면으로 대체되며 삭제됐다
  (`decisions.md` §6-3).
- **하는 일**: (영화) `WorkPickStep`에서 후보를 확정하고 — 정확히는 1순위가 자동
  채택되고 "아니에요"를 눌렀을 때만 이 화면에서 직접 고른다(§2-A) —
  `TranslateSettingsStep`에서 장르·배경/시대·톤앤매너를 **사람이 편집 가능** —
  자동 수집이 틀려도 여기서 최종 교정된 값이 번역에 들어간다. (기타 유형)
  `WorkPickStep`에서 콘텐츠 유형·톤을 사람이 직접
  입력하면 각각 `movieInfo.genre`/`movieInfo.tone`으로 들어간다(`confirmWorkPick`,
  `useWizard.ts`). 글로사리 토글을 켰다면 표기·존대관계도 설정 화면에서 편집
  가능(§2-C).
- **품질 레버**: 후보 카드 표시/선택 로직 → `WorkPickStep.tsx`. 편집 가능한 필드
  구성 → `TranslateSettingsStep.tsx`. 필드 라벨/힌트 문구 → `simpleCopy.ts`.
  **자동화가 애매하면 이 사람-교정 단계를 강화하는 게 가장 안전.**

### 4. 번역 시작 & 크레딧 & 스타일 선택
- **코드**: `app/page.tsx` (`handleTranslate`) → `useTranslation.translate(...)`,
  `app/api/translation/begin/route.ts`
- **하는 일**: 크레딧 1 차감 → `jobId` 발급(파일당 1회). 번역 스타일·도착어 결정.
- **품질 레버**:
  - **번역 스타일** `meaning`(의미보존) / `cinematic`(영화적) — `TranslateSettingsStep`의
    **"[실험] 번역 철학 프롬프트 포함"** 체크박스가 정한다(기본 OFF). 상태는
    `useWizard.philosophyOn`이고, 켜지면 `translate(..., 'cinematic')`이 되어 composer가
    `cinematic_translation_philosophy_ko.txt`를 시스템에 얹는다. 철학 유무의 품질 차이를
    눈으로 비교하려고 잠깐 노출한 스위치라 저장하지 않는다(새로고침하면 꺼짐) —
    결론이 나면 토글·`COPY.settings.philosophy*`를 통째로 지우고 스타일을 고정한다.
  - 도착어 → **`app/config/languages.ts` (`TARGET_LANGS`)** — 한 행이 곧 한 언어다:
    picker 표시(label/mono/enabled), 프롬프트(promptLabel/lineMaxChars/formality),
    후처리(trailingPunctuation + `shapes[프로필].target/hardMax`). 현재 활성: 한국어·영어·일본어·스페인어·
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

이 표는 **`SERVER_CHUNK_SIZE`(flash 전용)** 얘기다. Pro는 `PRO_CHUNK_SIZE`(기본
250, `chunkSizeForModel(model)`가 분기)로 별도 관리한다 — flash의 100은 재번호
드리프트 반경 축소가 목적이고, Pro의 250은 HIGH thinking 토큰 비용 절감이
목적이라 근거 자체가 다르다(`decisions.md` §2-15). 300 미만 규칙은 flash에서
관측된 실패모드라 Pro에도 안전 마진으로 유지했을 뿐, Pro 자체에서 재현된 적은
없다.

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
- **진행 바**: 채워지는 속도는 `app/lib/progressEstimate.ts`가 파일 크기(청크 수)와
  모델로 계산한다(`chunk-size-model.md` §1 실측 파라미터). `constants.ts`
  `TRANSLATION_ESTIMATE_MS`(flash 20초 / pro 165초)는 블록 수를 모를 때의 폴백뿐이다.
  바 자체는 `ProgressStep.tsx` + `useEasedProgress.ts` — `max(실제 청크 착지분,
  밴드 끝을 향한 지수 이징)`이라 천장을 넘지 못한다. 밴드는 `progressStages.ts`.

### 7. 프롬프트 조합 ⭐ (번역 품질의 핵심 집결지)
- **코드**: `app/api/translate/route.ts` → `app/lib/server/translationService.ts`
  (`translateSubtitle`) → **`app/lib/prompts/composer.ts` (`composeTranslationPrompt`)**
  → `app/lib/prompts/translationContent.ts` (`buildTranslationVariables`,
  `formatMovieInfo`) + `app/lib/prompts/glossaryContent.ts` (`renderGlossaryTags`),
  로더 `app/lib/prompts/loader.ts`
- **조립 구조**:
  - **시스템 프롬프트**:
    - 페르소나 + 신뢰 경계 → `prompts/common/subtitle_translation_system.txt`
      (`<glossary>`, `<speech_relations>`도 이 경계에 포함 — 프로일 때만 실제로 등장)
    - `{{glossaryDirective}}` → **오늘은 항상 빈 문자열이다**(글로사리 꺼짐).
      켜져 있던 시절에는 `prompts/common/glossary_directive.txt`가
      `<translation_rules>` 뒤에 조건부로 붙어 "표기·말투는 위 규칙보다 이 표가
      우선"을 선언했고, **그 문장이 품질 저하의 원인이었다** — 시스템 프롬프트의
      마지막 줄이라 recency상 가장 세게 먹히면서 `<translation_philosophy>`를
      한 단계 밑으로 밀었다(`decisions.md` §6-26). 되살릴 때 이 문장을 그대로
      쓰지 말 것
    - `{{translationPhilosophy}}` → `prompts/common/cinematic_translation_philosophy_ko.txt`
      (**cinematic 스타일에서만**; meaning은 빈 문자열)
    - `{{translationRules}}` → **도착어별 독립 파일
      `prompts/common/translation_rules_<code>.txt`**(형식 불변식 + 문체·말투·문장부호가
      한 파일에, **그 언어로 작성**; `{{lineMaxChars}}`만 `languages.ts` 값으로 치환 —
      `translationContent.ts`의 `buildTranslationRules`)
  - **유저 턴**: `<content_metadata>`(`formatMovieInfo` — 제목/연도/장르/배경·시대/톤앤매너)
    + `<user_notes>`(**영화·프로면 연출 메모가 여기 실린다** — §2-C-new;
    비영화는 `/api/summarize` 요약; 어느 쪽이든 사용자가 고친 최종본)
    + 청크 위치 + `<glossary>`(파일 전체 표기, §2-C-old를 되켰을 때만) +
    `<speech_relations>`(이 청크의 블록 범위와 겹치는 관계만, `getBlockIndexRange` +
    `renderGlossaryTags` — §2-C) + 내레이션 문체 한 줄(§2-C, `narration !== 'none'`
    일 때만) + `<subtitle_data>`(타임스탬프 제거, **줄마다
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
  - 줄 길이 상한 → `languages.ts`의 `lineMaxChars`(ko 25 / ja 20 / zh 18 / 라틴계 42).
    **도착어별이고 콘텐츠 프로필과 무관하다** — 프로필은 노출 시간만 바꾼다
    (`decisions.md` §1-19). 그래서 프롬프트 조합은 프로필을 아예 받지 않는다
  - 이름 표기·말투가 청크마다 흔들림 → §2-C-new(연출 메모). 오용 위험이 있는
    표기는 메모가 짚어 주고, 그 밖의 표기 고정은 각 `translation_rules_<code>.txt`의
    우선순위 규칙에 못박혀 있음
  - **번역이 "정확한데 밋밋함"** → 프롬프트에 규칙을 이기는 지시문이 들어갔는지
    의심할 것. 시스템 프롬프트의 **마지막 줄**이 특히 위험하다(`decisions.md` §6-26)
- **주의**: `castSheet`가 없으면(현재 항상 그렇다 — 글로사리 꺼짐)
  `<glossary>`/`<speech_relations>`는 `.filter(Boolean)`으로 완전히 드롭돼 프롬프트가
  이 기능 도입 이전과 **바이트 단위로** 같다 — `composer.test.ts` 회귀 테스트로
  고정됨. 이 성질이 §6-26에서 "끄기"를 한 줄로 만들어 줬다.

### 8. 모델 호출
- **코드**: `translateSubtitle` → `app/lib/providers/gemini.ts` (`generateModelText`),
  설정 `app/config/constants.ts`
- **품질 레버**:
  - 번역 모델 → UI에서 **고급번역** (`PRO_MODEL` = `gemini-3.1-pro-preview`) /
    **빠른번역** (`FLASH_MODEL` = `gemini-3.6-flash`). 허용 목록은
    `constants.ts` `ALLOWED_MODELS`. 하니스 기본은 `TRANSLATION_MODEL`(env
    `NEXT_PUBLIC_TRANSLATION_MODEL`, 기본 flash)
  - thinking 수준 → `thinkingLevelForModel(model)`: flash는
    `THINKING_LEVEL`(기본 LOW), Pro는 `PRO_THINKING_LEVEL`(기본 **HIGH**,
    0.18.0 — `docs/decisions.md` §2-15, 체크리스트 `docs/TODO.md`). 둘 다 env,
    변경 시 dev 서버 재시작. 로그에 `thinking=`로 찍힘. ⚠️ flash와 달리 pro는
    MINIMAL을 설정할 수 없고(API가 거부) LOW도 `thoughts=0`이 아니다 —
    실측·비용 영향은 `docs/decisions.md` §2-4-1, `docs/tuning/gemini-limits.md`
    §6-2 참고. MEDIUM은 LOW 대비 정렬 안정성
    이득이 없이 비용만 늘었다는 게 §2-15에서 확인됨 — MEDIUM을 굳이 쓸 이유는 없음
  - **엄격 모드**(출력 검증+재시도+블록단위 재번역) → `translationService.ts`,
    `TRANSLATION_STRICT_MODE=true`로 켬(기본 off, 비용 폭탄 위험 있어 신중히)
  - **2단계(번역 + 검수) 실험** → 프로덕션엔 **아직 없다.** 1차 번역 위에 모델을
    한 번 더 태우는 검수 패스는 하네스(`npm run review`,
    `scripts/review.mts` + `scripts/prompts/review_ko.txt`)로만 존재한다.
    비용은 Pro 단독의 53%로 통과했지만 검수가 자막 한 줄을 버리는 사고가 나서
    배선을 보류 중 — 실측과 판정은 `docs/tuning/review-pass.md`

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

### 9.5. 리딩스피드·최소 길이 타임코드 조정 (CPS / minDuration, 도착어 × 프로필)
- **코드**: **`app/lib/srt.ts` (`adjustSubtitleTiming`)**, `constants.ts`
  (`CPS_HARD_MAX`/`CPS_TARGET`/`CPS_RECOMMENDED_MIN`/`MIN_SUBTITLE_GAP_MS`/
  `MIN_SUBTITLE_DURATION_MS`), `useTranslation`에서 청크 합친 직후 1회 호출.
- **하는 일**: 두 가지 독립된 조건 중 하나라도 걸리면 같은 방식으로 넓힌다 —
  ① **`cps > 프로필의 hardMax`**(한국어: 영화 14 / 예능 16 / 다큐 12 = Netflix 한국어
  상한, ja/zh 9, 라틴계 20 — `languages.ts`의 `TargetLang.shapes`, 해석은
  `constants.ts`의 `getReadingSpeed(도착어, 프로필)`) 또는
  ② **구간 길이 < `MIN_SUBTITLE_DURATION_MS`**(기본 800ms, 대사 유무 무관 — 빈 블록도 대상).
  두 조건의 요구량 중 **큰 쪽**을 목표로, **이웃이 비운 침묵(gap)** 안에서 표시창을 넓힌다.
  end를 먼저 뒤로 밀고 모자라면 start를 앞으로 당김. 첫 블록은 앞의 빈 프리롤(0초까지)로
  start를 당길 수 있다. **창은 늘리기만 하고 줄이지 않으며, 절대 겹치지 않는다** — 앞
  블록은 조정된 end, 뒤 블록은 원본 start를 경계로 쓰는 비대칭 + `MIN_SUBTITLE_GAP_MS`.
  전체 파일에 한 번 돌아 청크 경계 이웃까지 커버. 타임코드를 코드가 소유한다는 원칙의 연장.
- **임계값(CPS)**: `hardMax` 초과 = 손봄(위반), `target` = 착지 목표, 그 아래로는 안
  내림(목표가 target이라 자동 보장). 둘 사이는 상한 밑이라 손대지 않는다. 한국어
  영화 프로필이면 14 초과를 12로 내리는 식.
- **품질 레버**: 기본값은 `languages.ts`의 `shapes`(한국어만 실측 기반, 나머지는
  공개 스타일 가이드 기반 추정 — `tuning/reading-speed.md`). env
  `NEXT_PUBLIC_CPS_HARD_MAX`/`_TARGET`을 설정하면 **모든 도착어·모든 프로필에
  일괄 적용되는 전역 오버라이드**로 동작한다. `CPS_HARD_MAX`(낮추면 더 많은 블록을 손봄), `CPS_TARGET`(낮추면 더 여유롭게
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
  - **최종 표기 재기록**(`ellipsis` 옵션, `TargetLang.ellipsis`, 2026-08-18~): 위
    정규화·자수 계산·문장부호 스트립이 전부 끝난 **마지막**에, 내부 표준 `…`를
    도착어별 표기로 한 번 더 바꾼다. **지금은 전 도착어가 `…`라 실질 no-op**이지만
    배선은 살아 있다(한국어를 `...`로 내보냈다가 같은 날 되돌렸다 — `decisions.md`
    §6-13). 자수 계산·문장부호 스트립은 항상 `…` 1글자 기준으로 도는 채 유지한다 —
    재기록을 먼저 하면 `...` 같은 여러 글자 표기가 자수를 부풀리고, 끝 글자 `.`이
    문장부호 스트립에 다시 걸린다. 호출부가 `ellipsis`를 안 넘기면 `…`로 남아
    하위호환.
  - **2줄 상한**(2026-07-28부터 **코드 전담** — 프롬프트에서 제거됨): 줄이 3개 이상이면
    2번째 줄부터 공백으로 합쳐 강제로 2줄로 만든다. 텍스트 유실 없음(공백으로
    이어붙일 뿐 아무것도 버리지 않음).
  - **불필요한 2줄 접기**(`linesJoined`, 2026-08-15~): 위의 거울상. 두 줄을 이어도
    `lineMaxChars`(도착어) 안에 들어가면 한 줄로 되돌린다 — 모델이 원문의 줄바꿈을
    관성적으로 물려받아 `내 아내와 / 딸`처럼 7자를 두 줄로 쓰는 걸 막는다. **"들어가는가"는
    산술이라 코드 몫이고, "어디서 끊을 것인가"는 여전히 프롬프트 몫**이다.
    - 자수는 **태그를 뺀 보이는 글자 수**로 센다(`<i>`만으로 7자를 잡아먹는다).
    - **화자 구분(`- A` / `- B`)은 접지 않는다** — 대시는 두 줄로 떨어져 있을 때만
      화자 구분으로 읽힌다. 앞의 태그는 건너뛰고 판정하므로 `<i>- 몰라</i>`도 걸린다.
    - **이었을 때 태그 짝이 맞아야 접는다**(`hasBalancedTags`). `<i>속삭이며` + `그가
      말했다`(닫는 태그 없음)를 접으면 줄바꿈에서 이탤릭을 끝내는 플레이어에서
      둘째 줄까지 새로 기울어진다. 반대로 `<i>살아남은 벨로키오` + `남매들은</i>`는
      이어야 짝이 완성되고 덮는 범위는 그대로라 접는다.
    - **문장 경계에서도 접지 않는다**(2026-08-15~): "내 아내와 / 딸"은 한 구가
      쓸데없이 쪼개진 것이고, "DVD 버전을 추천합니다 / 화질이 더 좋거든요"는 문장
      둘이다. 후자는 한 줄에 들어가도 경계를 지킨다. 판정은 **문장부호 제거 전**에
      한다 — 마침표를 떼면 증거가 사라진다. 신호는 줄 끝 `.?!…`(닫는 따옴표·태그
      너머까지 봄)이거나, 마침표를 안 쓴 한국어 서술 어미(`[다요죠까네군]`). 애매한
      어미(자·나·라)는 일부러 빼 둔다 — 접기를 놓치면 두 줄로 남는 것뿐이고, 잘못
      접으면 문장 둘이 한 줄에 붙는다. 둘째 줄이 따옴표로 열리면 그것도 접지 않는다
      (`내게 말했어 / "이길 방법은…"`는 전언과 인용이다).
    - **문장부호 제거 뒤에 돈다** — 마침표 하나가 빠지면서 상한 안으로 들어오는
      경우가 있어서 순서가 중요하다. 문장 경계 판정만 제거 **앞**이다.
    - `lineMaxChars`를 안 넘기면 이 규칙은 아예 안 돈다(도착어를 모르는 호출부 보호).
    프롬프트 규칙 2도 같은 경계를 모델에게 미리 시킨다("한 자막에 문장이 둘이면
    한 줄에 들어가도 `|`로 나눠") — 코드는 모델이 안 나눈 경우의 안전망이다.
  - **한 줄 두 화자 분리**(`speakerLinesSplit`, 2026-08-15~): `- 네. - 올해…`처럼
    한 줄에 화자가 둘이면 줄당 한 화자로 쪼갠다(기준 문서 §I.6). 2줄 상한 **앞**에
    돌아서, 생긴 셋째 줄은 둘째 화자 줄로 다시 접힌다. 선행 대시가 있는 줄만
    건드리므로 `3 - 4시` 같은 일반 하이픈은 안 걸린다. 둘째 화자의 공백은 없어도
    된다(`- 네. -올해…`) — 뒤따르는 대시 정규화가 이어받아 고친다.
  - **화자 대시 정규화**(`speakerDashesNormalized`, 2026-08-25~): 대시가 있기만 하면
    나머지는 산술이라 코드가 못박는 두 가지(기준 문서 §I.6).
    - **대시 뒤 공백**: `-그래` → `- 그래`. 줄 **머리**만 본다(줄 중간 하이픈은 일반
      텍스트). 대시 뒤가 숫자면 안 건드린다(`-5도야`는 음수), `--`도 제외.
    - **짝 없는 대시 채우기**: 2줄 블록에서 **한 줄만** 대시를 달고 있으면 나머지
      줄에도 붙인다. `자극제? / -그래` → `- 자극제? / - 그래`. 둘째 화자에만 대시를
      다는 원문 관행이 번역에도 그대로 딸려오는 걸 막는다. 앞의 태그는 건너뛰므로
      `<i>어디 가?</i>`는 `<i>- 어디 가?</i>`가 된다.
    - 2줄 상한 **뒤**, 문장부호 스트립·접기 **앞**에 돈다 — 뒤의 둘이 `isSpeakerLine`을
      읽으므로, 대시가 채워진 뒤라야 화자 줄이 접히지 않는다.
    - 프롬프트 쪽 짝은 `translation_rules_<code>.txt` 규칙 2와 `line_split_ko.txt`
      규칙 3("원문 어느 줄이든 대시로 시작하면 화자가 둘") — 코드는 안전망이다.
  - **줄 중간 마침표 → 쉼표**(`midLinePeriodsToCommas`, 2026-08-15~): 한 자막 안의
    문장 둘은 쉼표로 잇는다(기준 문서 §I.13, "사랑해. 그게 내가" → "사랑해, 그게
    내가"). 줄 끝 제거는 줄 **끝**만 보므로 `압니다. 결혼식에…`는 예전엔 그대로
    나갔다. 한글 음절에만 앵커해서 소수(`3.5`)·라틴 약어(`Mr.`)는 안 건드린다.
    `trailingPunctuation`에 `.`가 있는 도착어만 — 마침표를 유지하는 언어는 여기도
    유지한다.
  - **문장 끝 마침표·줄 끝 쉼표 생략**: 각 줄 끝의 문장부호 하나를 제거. **어떤 문자를
    지울지는 도착어가 정한다** — `languages.ts`의 `trailingPunctuation`(ko `.,` /
    ja `.,。、` / zh `.,。，` / 영어·스페인어·프랑스어·독일어는 빈 문자열이라 **아예
    건드리지 않는다** — 라틴계 자막 관행은 문장부호를 유지한다).
    **"줄 끝"은 텍스트의 끝이지 문자열의 끝이 아니다**(2026-08-15 수정): 닫는
    태그·닫는 따옴표가 뒤에 붙어 있으면 건너뛰고 그 앞의 문장부호를 뗀다. 이전
    정규식은 `[.,]\s*$`로 문자열 끝에 앵커링돼 있어서 `<i>2016년 12월 16일,</i>`
    같은 이탤릭 줄을 통째로 놓쳤다 — 내레이션이 많은 작품에서 실측하니
    (Marx può aspettare, 1126블록) 28줄이 이렇게 새고 있었고 **전부 태그로 끝나는
    줄이었다**(태그 없는 줄은 단 하나도 안 샜다). 회귀는 `srt.test.ts`가 고정.
- **줄 길이 초과 시 의미 단위 두 줄 나누기**(`translation_rules_<code>.txt` 규칙 2 —
  `|` 삽입)는 여전히 AI 담당이다 — 어디서 끊어야 자연스러운지는 의미 판단이라 코드가
  임의 지점(예: 중간 공백)에서 자르면 어색한 줄바꿈을 강제로 만들 위험이 더 크다.
  AI는 `|`로 **끊을 지점만 지정**하고 실제 줄바꿈은 코드가 수행한다. 코드의 2줄 상한은
  "AI가 `|`를 두 개 이상 넣었을 때의 안전망"이다.
  **한국어 규칙 2에는 두 개의 수가 있다**: 권장선 **16자**(Netflix 한국어 기준,
  공백·문장부호 포함, 프롬프트에만 존재)와 강제선 **`lineMaxChars` 18자**
  (`languages.ts`). 16자는 코드가 모르는 권유이므로 "번역문을 짧게
  쓰라"는 압력일 뿐 줄 수를 정하지 않는다. 실제로 나뉘는 지점은 18자다.
  **접기(`linesJoined`)도 같은 18자로 판정**하므로, 접은 결과가 프롬프트라면
  나눠야 했을 줄이 되는 일은 없다 — 한 상수가 분할 트리거와 접기 예산을 겸한다.
  19자를 고른 근거(압축 필요 블록 4.9%→0.9%)와 ⚠️ 측정에 쓴 샘플이 전문가 자막이
  아니라 **우리 이전 출력**이라는 점, 그리고 이후 18자로 내린 것(재측정 없이)은
  `decisions.md` §2-6.
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

### 9.8. 번역 없이 규칙만 적용하는 경로 (`/polish`, 2026-08-19)

§9.7의 규칙 엔진을 **번역 파이프라인 밖에서** 쓰는 두 번째 경로. 이미 한국어인
자막을 받아 표기 규칙만 적용해 돌려준다. 설계 전문은
`docs/superpowers/specs/2026-08-19-polish-page-design.md`.

| # | 단계 | 담당 | 파일 |
|---|---|---|---|
| 1 | 업로드 → 정규 SRT + `SubtitleDoc` | 코드 | `app/lib/subtitles/` |
| 2 | 1차 `enforceTextRules` | 코드 | `app/lib/srt.ts` |
| 3 | 상한 초과 블록 수집 | 코드 | `collectOverLongBlocks` (`app/lib/polish.ts`) |
| 4 | **초과 0건이면 AI 건너뜀** | — | `applySubtitleRules` (`app/lib/polish.ts`) |
| 5 | 초과분만 한 요청으로 전송 | 서버 | `/api/polish` → `polishService` |
| 6 | 번호로 제자리 교체 | 코드 | `spliceBlocks` (`app/lib/polish.ts`) |
| 7 | 2차 `enforceTextRules` | 코드 | AI 결과에 2줄 상한·접기·마침표 재적용 |
| 8 | (opt-in) 읽기 속도 조정 | 코드 | `adjustSubtitleTimingWithReport` (`app/lib/srt.ts`) |
| 9 | `buildDownloads` | 코드 | `app/lib/downloads.ts` |

⚠️ **이 경로의 AI는 줄바꿈만 한다 — 줄이지 않는다.** `line_split_ko.txt`에는
2026-08-21까지 *"나누고도 넘치면 뜻을 지킨 채 줄여. 정보를 빼거나 더하지 마"*라는
조항이 있었다. 한 줄에서 "줄여"와 "빼지 마"를 동시에 요구하는 문장이라, 두 줄로
쪼개도 안 들어가는 블록(긴 이름 나열 등)에서 모델이 어느 쪽을 버릴지 정해져 있지
않았다. **대표 결정으로 그 조항을 뺐다** — 길이는 어차피 코드가 최종 판정하고
(`enforceTextRules`), 넘치는 줄이 남는 것이 내용이 사라지는 것보다 낫다.
→ 그래서 **상한을 넘는 줄이 결과에 남을 수 있다.** 그건 결함이 아니라 이 선택의
비용이다.

**기본값은 여전히 "타임코드를 읽지도 쓰지도 않는다"**(2026-08-21까지는 유일한
동작이었다). `applySubtitleRules`의 네 번째 인자 `timing`이 없으면 8단계 자체가
없는 것과 같아, 번역 경로의 "밀리지 않는다"보다 센 "바뀌지 않는다"가 그대로
성립한다.

**켰을 때만 8단계가 열린다.** 업로드 화면의 토글(기본 OFF, `PolishUploadStep`)로
읽기 속도 밴드를 고르면 마지막에 딱 한 번 `adjustSubtitleTimingWithReport`가 돈다.
순서가 중요하다 — 2차 `enforceTextRules` **뒤**여야 마침표 제거·두 줄 접기로
글자 수가 확정된 상태에서 CPS를 잰다. 밴드는

- **프리셋** = `languages.ts`의 `shapes`(영화 10/12 · 예능 8/11 · 강연 12/15)를
  그대로 쓴다. 번역 경로가 콘텐츠 유형으로 고르는 것과 같은 표다 — 여기서 숫자를
  새로 적으면 같은 제품이 화면마다 다른 읽기 속도를 판다.
- **직접 설정** = `CPS_USER_RANGE`(4~20) 안에서 최소·최대를 고른다. 화면의
  "최대"는 엔진의 `cpsHardMax`(손댈지 가르는 발동선), "최소"는 `cpsTarget`
  (손댄 자막이 내려앉는 자리)이다. **최소는 하한 보장이 아니다** — 이 엔진은
  노출을 넓히기만 하므로 원래 그보다 느린 자막은 손대지 않는다. 최소 ≥ 최대는
  모순이라 업로드 자체를 막는다.

완료 화면의 "자막 N개의 노출 시간을 늘렸습니다"는 `PolishSummary.timingAdjusted` —
**실제로 창이 넓어진** 블록만 센다. 발동은 했지만 앞뒤 여백이 없어 못 넓힌 블록은
빼는데, 그건 보는 사람에게 아무 일도 안 일어난 것이기 때문이다(`doneReport.ts`의
"측정 안 한 숫자는 안 적는다"와 같은 규칙).

**병합을 새로 안 짰다.** `reassembleTranslatedChunk`(§9)를 그대로 쓴다 — 그 함수는
위치가 아니라 **번호로** 대조하므로 청크가 연속일 필요가 없다. 초과 블록만 원본
번호·타임코드째 뽑아 이어 붙이면 그게 곧 유효한 청크이고, 모르는 번호 버리기·빠진
번호 폴백·`|` 분리·모델 타임스탬프 불신이 전부 공짜로 따라온다. `polish.ts`가 새로
하는 일은 뽑기(3)와 되돌리기(6)뿐이다.

2~7은 `applySubtitleRules` 한 함수에 있다 — 훅(`usePolish`)은 파일 읽기·거절
처리·화면 상태만 맡는다. 파이프라인을 순수 함수로 뽑아 둔 이유는 `useWizard`가
`countBlocks`·`exceedsCreditCap`을 뽑아 둔 이유와 같다: **초과 0건이면 모델을 안
부른다**는 성질이 이 기능의 경제성이므로 렌더 없이 검증되어야 한다. 그래서 모델
호출을 인자로 주입받는다 — 호출 여부가 곧 비용이고, `polish.test.ts`가 그걸 센다.

**청크 분할은 서버가 한다**(`POLISH_CHUNK_SIZE`). 클라이언트가 한 요청에 다 보내는
이유는 레이트 리밋이 요청 단위로 세기 때문 — 청크마다 쪼갰다면 "하루 5회"가 파일
한두 개로 줄었을 것이다.

**한도가 유일한 천장이다.** 크레딧을 안 쓰므로 `/api/translate`의 job 검사에 해당하는
가드가 없다. `RATE_LIMITS.polish`(하루 5회, §12의 `api_rate_limits` 재사용)가 그
자리를 메운다 — 편의 기능이 아니라 보안 요소다.

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

### 11. 계측 (베타)
- **코드**: 모델 호출 1회당 — provider의 `generateModelText`(`app/lib/providers/gemini.ts`)가
  `{ text, usage, thinkingLevel }`를 반환(타입 `app/lib/providers/types.ts`) →
  `/api/translate`가 `app/lib/server/chunkUsage.ts`(`recordChunkUsage`)로
  `translation_chunk_usage`에 1행 기록(재시도·§9.65 sweep 라운드도 각각 1행 —
  sweep은 `phase='sweep'`으로 구분). **번역 밖의 모델 호출도 같은 표에
  들어간다**(2026-08-22, 마이그레이션 0017): 연출 메모는 `phase='note'`로
  파일당 1행(`/api/note`), 규칙 적용은 `phase='polish'`로 청크당 1행
  (`/api/polish`). 둘 다 크레딧을 안 쓰므로 붙일 job이 없고 `job_id`가 null이다
  — 그전까지 이 호출들은 Vercel 로그에만 남아 계정별 사용량 집계가 실제
  청구서보다 적게 나왔다. 서비스는 측정치를 **반환만** 하고
  (`extractDirectorNote`의 `DirectorNoteResult.measurement`,
  `splitLongLines`의 `onCall`) 쓰는 것은 라우트다 — 서비스가 요청의 신원을
  알지 않게 하려는 것으로, `/api/translate`가 하는 것과 같은 분리다. 런 1회당 — `useTranslation.ts` 완료 시
  `app/lib/client/metrics.ts`(`sendRunMetrics`) → `/api/translation/metrics` →
  RPC `record_job_metrics` → `translation_jobs`의 실측 컬럼(청크 수·소요·잔여
  블록 등). 피드백 — 완료 화면 별점은 그 자리에서(`DoneStep.tsx`,
  `sendFeedback`), "실제로 썼는지·뭐가 문제였는지"는 재방문 때
  (`app/hooks/useFeedbackFollowup.ts`, `app/components/beta/FeedbackFollowup.tsx`)
  `/api/feedback/pending`으로 대상을 받아 `/api/feedback`에 usability·
  issueKinds·reportedBlocks를 기록(둘 다 `app/lib/client/feedback.ts`). 퍼널
  이벤트 — `translation_jobs`로 이미 알 수 있는 건 제외한 4개만
  `app/lib/client/events.ts`(`recordEvent`) → `/api/events` → `beta_events`
  (업로드 거절 · 설정 확정 · 다운로드 클릭 · 크레딧 소진 화면 노출, 목록은
  `constants.ts` `BETA_EVENTS`).
- **스키마**: `supabase/migrations/0009_beta_metrics.sql` +
  `0017_prepass_usage.sql`(job_id nullable · phase에 note·polish 추가; 적용
  상태는 README의 스키마 절 참고).
- **조회**: 매일 아침은 `supabase/daily.sql` — 신규가입·로그인·업로드·완료·
  재방문 5개를 어제/최근7일 두 줄로 뽑는 저장용 쿼리다. 업로드·완료는
  `beta_events`가 아니라 `translation_jobs`에서 센다(서버가 쓴 행이라
  fire-and-forget 유실이 없다). 숫자가 이상할 때만 `supabase/beta-review.sql`의
  해당 블록으로 내려간다 — 대응표는 daily.sql 하단에 있다. **익명 방문은 어느
  쪽에도 없다**: `beta_events.user_id`가 `not null`이라 로그인 전 행동은 이
  테이블에 남지 않는다. API 사용량과 그 가격은
  `supabase/api-usage.sql` — 평소 보는 것은 계정별 하나(월 하나를 넣으면 전
  계정이 한 줄씩, 그 달 값과 누적 값이 나란히), 나머지 둘(전체 누적·전체
  월별)은 구글 청구서와 대조할 때 쓴다. 단가표는 하드코딩이고
  `docs/tuning/cost-per-block.md`에서 왔다 — 단가가 바뀌면 쿼리 안의
  `rates`를 같이 고친다. 월 경계는 **KST 1일 00:00**이라 구글 청구서의
  태평양시 경계와 몇 시간 어긋난다.
- **불변식**: 자막 텍스트는 계측 어디에도 저장하지 않는다 —
  `feedback.reported_blocks`는 정수(SRT 시퀀스 번호) 배열이고, 그 줄의
  텍스트는 보관된 결과물(0007)에서 읽는다. 계측 실패가 번역·화면을 깨면 안
  되므로 모든 경로가 fire-and-forget이고 실패를 삼킨다. 미측정은 `null`로
  남는다 — "실패 0건"과 "측정 못 함"은 반대되는 사실이라 `0`으로 뭉개지 않는다.

### 12. 가드레일 — 레이트 리밋 · 서버 예외 기록 (2026-08-03)
- **레이트 리밋**: 위 §1·§2-A·§2-B·§2-C의 네 라우트(`/api/analyze`·`/api/enrich`·
  `/api/summarize`·`/api/glossary`)는 **크레딧을 안 쓰면서 실제 API 비용을 낸다.**
  그래서 `requireUser()` 바로 뒤에 `enforceRateLimit(버킷)`
  (`app/lib/server/rateLimit.ts`)이 붙는다. 한도는 `constants.ts`의 `RATE_LIMITS`
  — 앞의 셋이 `aux` 버킷을 **합산해서** 분당 20회, 글로사리는 자기 버킷으로
  분당 5회. 카운터는 Postgres(`consume_rate_limit`, `0011`)에 있다. 서버리스라
  프로세스 메모리로는 인스턴스마다 따로 세어 가드가 되지 않는다.
  거절은 429 + `Retry-After` + `COPY.error.rateLimited`.
  **번역 경로(§4~§9)에는 안 붙는다** — 거기는 크레딧이 이미 상한이다.
- **fail-open**: RPC가 실패하면 통과시킨다(`requireUser()`의 fail-closed와 반대).
  근거는 `rateLimit.ts`의 주석에 있다 — 이 가드가 막는 건 이미 인증된 한 사람의
  반복 호출이고, DB 블립 때문에 전원의 업로드가 죽는 쪽이 더 나쁘다.
- **서버 예외 기록**: `reportServerError()`(`app/lib/server/reportError.ts`)가
  `server_errors`(0011)에 라우트·예외명·메시지(500자 절단)·상태·평평한 detail만
  남긴다. `console.error`는 그대로 두고 **추가로** 쌓는 것이다 — 스택 전문은
  Vercel 로그, 이 표는 "같은 게 반복되는가". 조회는 `supabase/beta-review.sql` §8.
- **배선된 곳**: analyze(파싱 실패 포함) · summarize · enrich · glossary ·
  `/api/translate`(500만 — 400은 호출자 잘못이고, 모델 호출 실패는 이미
  `translation_chunk_usage`에 error_code로 남아 중복이다) ·
  `/api/translation/begin` · `/api/translation/result`(record·upload 두 단계).
- **glossary가 특히 중요한 이유**: 이 라우트는 실패해도 빈 시트를 200으로 돌려준다
  (§2-C). 화면상 "고유명사가 없는 파일"과 구분이 안 되므로, 기록이 없으면 조용히
  꺼진 채로 베타가 끝난다. 단, `extractCastSheet` **안에서** 삼켜지는 폴백
  (키 없음·파싱 실패)은 라우트까지 안 올라오므로 여전히 기록되지 않는다.
- **불변식**: §11과 같다 — 자막 텍스트는 이 두 표 어디에도 들어가지 않는다.
  `detail`에 프롬프트·요청 본문·대사를 넣지 말 것. 기록 실패는 삼킨다(예외를
  처리하다 두 번째 예외가 나면 안 된다).

---

## 증상 → 고칠 곳 (빠른 인덱스)

| 증상 | 1차로 볼 곳 |
|---|---|
| VTT/SMI/ASS가 안 열리거나 큐가 비었다 | `app/lib/subtitles/` (`detect`/`parseVtt`/`parseSmi`/`parseAss`/`decode`), 업로드 `accept` — §0 · `decisions.md` §2-13 |
| SMI 한글이 깨짐 | `decodeSubtitleBytes` (UTF-8 → EUC-KR/CP949 폴백) — §0 |
| 올린 형식으로 받는 버튼이 안 뜬다 | `SubtitleDoc.roundTrip` — writer가 있는 포맷만 뜬다(현재 VTT). `document.ts`의 `WRITERS` — §10 |
| 받은 파일에서 스타일·헤더가 사라졌다 | splice가 아니라 SRT 폴백으로 내려갔을 가능성. `buildDownloads`의 콘솔 경고 확인 — §10 |
| 번역문에 원문 언어가 섞여 있다(SMI) | `resolveTrack` (`smi.ts`) — 트랙 2개 이상이면 업로드에서 거절되어야 한다 — §0 |
| "요청이 너무 잦습니다"(429)가 정상 사용 중에 뜬다 | 한도가 잘못 잡힌 것이다 — `constants.ts` `RATE_LIMITS` — §12. 어느 유저가 얼마나 쳤는지는 `beta-review.sql` §9 |
| 서버가 조용히 실패하는 것 같다 | `server_errors` — `beta-review.sql` §8. 라우트가 §12의 배선 목록에 있는지 먼저 확인 |
| 제목/연도가 파일명에서 잘못 뽑힘 | `content_analysis.txt`, `metadataInference.ts` |
| 감독/포스터 안 뜸·틀림 | `tmdb.ts` (`searchCandidates`/`lookupById`), `enrichMovie.ts` (`buildGroundedPrompt`) |
| 재검색해도 계속 다른(엉뚱한) 작품이 나옴 | `tmdb.ts` (`searchCandidates` 정렬), `enrichMovie.ts` (`searchMovie`의 후보 임계값), `WorkPickStep.tsx` (`CandidateCard`) — §2-A "후보가 여러 개일 때" |
| 장르/배경·시대/톤앤매너가 이상함 | `enrichMovie.ts` (`buildKeywordPrompt` / `buildGroundedPrompt`) |
| 배경/시대가 개봉연도로 나옴 | `enrichMovie.ts` 프롬프트 (그라운딩·"개봉연도≠극중배경" 지침) |
| 번역이 직역투/어색함 | 해당 도착어의 `translation_rules_<code>.txt` |
| 인물명 표기가 청크마다 다르다 | `prompts/common/glossary_directive.txt`(지시문이 붙었는지), `app/lib/prompts/glossaryContent.ts`(캡에 잘려나갔는지), `extractCastSheet.ts`(추출 품질) — §2-C · `decisions.md` §6-24 |
| 말투 방향이 표와 다르다 | 표가 틀렸을 가능성이 먼저다 — 설정 화면 말투 탭에서 고친다(번역 AI는 표를 그대로 따른다). 표가 맞는데 안 지켜지면 `glossary_directive.txt` 2번 줄 — §2-C |
| 내레이션이 해요체로 나온다 | `CastSheet.narration` 판정(설정 화면 말투 탭에서 고칠 수 있다) + `translation_rules_ko.txt` 9번 — §2-C |
| 도착어를 추가하고 싶음 | `app/config/languages.ts`에 한 행 + `prompts/common/translation_rules_<code>.txt` — §4. 실제 모델 출력 확인은 `LIVE_LANG_SMOKE=1 npx vitest run app/lib/prompts/liveLang.smoke.test.ts` |
| 영어/중국어인데 존댓말 관계표가 안 보임 | 정상 — 그 언어엔 문법적 말투 축이 없어 relations를 안 만든다(§2-C, `languages.ts`의 `formality: null`) |
| 영어 자막인데 문장 끝 마침표가 사라짐 | `languages.ts`의 `trailingPunctuation`이 비어 있어야 정상 — 값이 있으면 §9.7이 지운다 |
| 일본어/중국어 자막이 너무 빨리 지나감 | `languages.ts`의 `shapes`(도착어×프로필 CPS) — §9.5 |
| 예능인데 자막이 영화처럼 오래 떠 있음(또는 그 반대) | 업로드 화면의 콘텐츠 유형 선택(§0) → `languages.ts`의 `shapes[프로필]` — §9.5 |
| 존댓말/반말·인물 말투가 안 맞음(말투 축이 있는 언어) | 먼저 TranslateSettingsStep의 "등장인물·용어 일관성" 토글을 켜봤는지 확인(§2-C, 기본 OFF) — 켰다면 `cast_sheet_extraction.txt` 또는 `CastSheetCard`에서 직접 관계 수정. 안 켰거나 그래도 안 맞으면 `translation_rules_ko.txt`, (cinematic) `cinematic_translation_philosophy_ko.txt`, `TranslateSettingsStep`에서 사람이 톤 입력 |
| 같은 이름이 청크마다 다르게 번역됨(표기 흔들림) | TranslateSettingsStep 토글을 켜지 않았으면 그게 원인(§2-C, 기본 OFF). 켰는데도 흔들리면 `extractCastSheet.ts` `sanitizeCastSheet`(환각 필터로 그 이름이 버려졌을 수 있음) 또는 `CastSheetCard`에서 직접 추가 |
| 감정/뉘앙스가 밋밋함 | `cinematic_translation_philosophy_ko.txt` (+ 스타일을 cinematic로) |
| 줄이 18자 넘는데 안 나뉨(의미 단위 줄바꿈) | `translation_rules_ko.txt` 규칙 2 — AI가 `|`로 끊을 지점만 지정, 실제 줄바꿈은 코드. 끊을 위치 판단은 프롬프트로만 유도(§9.7 스코프 밖) |
| 줄이 16자를 넘음 | 18자까지는 정상 — 16자는 규칙 2의 **권장선**이고 강제선은 `lineMaxChars` **18자**다(§9.7, `decisions.md` §2-6). 18자를 넘으면 그때가 규칙 2 위반 |
| 마침표·쉼표가 줄 끝에 남아 있음 / 3줄 이상 나옴 / `...`가 `…`로 안 바뀜 | `srt.ts` (`enforceTextRules`) — 이 셋은 코드가 강제하므로 재발하면 버그. `decisions.md` §2-8 — §9.7 |
| 말줄임표 표기를 도착어별로 바꾸고 싶음 | `languages.ts`의 그 언어 행 `ellipsis` 한 줄. 배선(`TextRuleOptions.ellipsis`)은 언어 중립이라 코드는 안 건드려도 된다 — §9.7, `decisions.md` §6-13 |
| 한 줄 안에 문장 마침표가 남아 있음 (`압니다. 결혼식에`) | `srt.ts` (`enforceTextRules`의 `midLinePeriodsToCommas`) — 한글 음절 뒤 `.`만 쉼표로 바꾼다. 소수·라틴 약어는 정상. `trailingPunctuation`에 `.`가 없는 도착어는 안 고친다 — §9.7 |
| 한 줄에 화자가 둘 (`- A. - B`) | `srt.ts` (`enforceTextRules`의 `speakerLinesSplit`) — 줄당 한 화자로 쪼갠 뒤 2줄 상한이 둘째 화자를 접는다 — §9.7 |
| 한 줄만 대시가 붙음 (`자극제?` / `-그래`) 또는 대시 뒤 공백 없음 | `srt.ts` (`enforceTextRules`의 `speakerDashesNormalized`) — 공백을 채우고 짝 없는 줄에 대시를 붙인다. 프롬프트 쪽 유도는 `translation_rules_<code>.txt` 규칙 2 / `line_split_ko.txt` 규칙 3 — §9.7 |
| 두 줄 자막이 한 줄로 붙어 나옴 | 먼저 **의도된 접기**인지 확인 — 이어도 `lineMaxChars` 안이고 문장 경계·따옴표 시작이 아니면 `enforceTextRules`(`linesJoined`)가 일부러 합친다(§9.7). 문장 둘인데 붙었으면 경계 판정 회귀(`srt.test.ts`). 상한을 넘는데도 붙어 나오면 `translation_rules_<code>.txt` 규칙 2(`|` 하나로 끊기) + 재조립이 `|`를 `\n`으로 바꾸는 자리 → `srt.ts` `LINE_BREAK_MARK`, `indexTranslatedBodies` |
| 한 줄에 들어가는데 굳이 두 줄로 나옴 | `srt.ts` (`enforceTextRules`의 `linesJoined`) — 접기 예외에 걸렸을 수 있다(화자 대시, 태그 짝 안 맞음, **문장 경계**, 둘째 줄이 따옴표로 시작) 또는 호출부가 `lineMaxChars`를 안 넘김. 문장 둘이면 의도된 비접기다. 프롬프트 쪽 유도는 `translation_rules_<code>.txt` 규칙 2 — §9.7 |
| 자막 본문에 `|`가 그대로 보임 | 재조립을 안 거친 산출물이거나(하네스 원본 등) `|`가 두 개 이상이라 2줄 상한에 걸린 경우 → `srt.ts` `indexTranslatedBodies`, `enforceTextRules` |
| 블록이 합쳐져 나옴(한 자막에 두 자막 내용) | 한 번호 = 한 줄 위반이라 블록 수 불일치로 잡힌다. 규칙 1·2를 확인하고, 재발하면 `decisions.md` §2-1 (3)의 실측 절차대로 하네스로 재현 |
| 이웃 자막 본문에 `[N me]` 같은 깨진 마커가 끼어 있고 그 번호는 원문 폴백 | 모델이 마커 안에 잡텍스트를 섞음 → `srt.ts` `MARKER_LINE`이 `[숫자…]`를 흡수함(`decisions.md` §2-1·§2-3-3). 재발 시 정규식·`srt.test.ts` 회귀 확인 |
| /polish가 긴 줄을 안 나눔 | 먼저 초과 줄이 실제로 있는지 확인 — 18자 이하면 AI를 안 부르는 게 정상이다(§9.8의 4번). 있는데도 그대로면 `prompts/common/line_split_ko.txt` 또는 청크 실패 → 응답의 `failedChunks`, 완료 화면의 "N개 자막은 나누지 못했습니다" |
| /polish에서 "오늘 사용할 수 있는 횟수를 모두 썼습니다" | 정상 — `RATE_LIMITS.polish`(하루 5회). 크레딧을 안 쓰는 라우트라 이 한도가 유일한 천장이다 — §9.8 |
| /polish 결과의 타임코드가 원본과 다름 | 업로드 화면의 "노출 시간도 읽기 속도에 맞추기"를 켰다면 정상 — 켠 사람에게만 §9.8의 8단계가 돈다. **껐는데도 다르면 버그다**: 그때는 타임스탬프를 쓰는 코드가 이 경로에 하나도 없다 — `spliceBlocks`나 포맷 어댑터(`app/lib/subtitles/`)를 의심할 것 |
| /polish에서 켰는데도 노출이 안 늘어남 | 앞뒤 자막이 붙어 있어 빌릴 침묵이 없는 경우가 대부분이다 — `adjustSubtitleTiming`은 겹침을 만들지 않으려 여백 안에서만 넓힌다(§9.5). 완료 화면의 개수(`timingAdjusted`)가 실제로 넓어진 수다 |
| 자막이 밀림(번호 재배열) | 청크 크기 ↓ `constants.ts` `SERVER_CHUNK_SIZE` (**≥300 금지**), 재조립 `srt.ts`. 조절 절차는 위 §5 |
| 특정 구간에서 자막이 대거 미번역(원문 그대로) | 대사 자체가 숫자인 장면(카운트다운 등) → `srt.ts` `[N]` 표식(§7·§9, `decisions.md` §2-1)이 이미 방지함. 그래도 재발하면 그 청크의 `matched`/`unmatched` 로그 확인 |
| 청크가 대화 중간을 자름 | `srt.ts` (`chunkSrtBlocksAtGaps` 파라미터) |
| 한국어 자막이 너무 빨리 지나감(읽기 힘듦) | `srt.ts` (`adjustSubtitleTiming`), `languages.ts` `shapes[프로필].target` (또는 전역 env `CPS_TARGET`)/`MIN_SUBTITLE_GAP_MS` — §9.5 |
| 자막이 너무 짧게 스쳐 지나감(대사와 무관하게) | `srt.ts` (`adjustSubtitleTiming`), `constants.ts` `MIN_SUBTITLE_DURATION_MS` — §9.5 |
| 번역이 느림/비쌈 | `constants.ts` `SERVER_CHUNK_SIZE`(flash)/`PRO_CHUNK_SIZE`(Pro)/`CONCURRENCY`/`thinkingLevelForModel`, 모델(고급/빠른). **블록당 실측 원가는 `tuning/cost-per-block.md`** — 비용이 예상과 다르면 여기부터 볼 것 |
| 비용을 **줄이고 싶다**(어느 노브가 실제로 효과 있나) | `tuning/token-economics.md` — 비용의 67%가 thinking, 6%가 입력이라 프롬프트 토큰 절감·캐싱은 거의 무의미하다. 이미 당긴 레버와 안 당긴 레버가 우선순위로 정리돼 있음 |
| 긴 파일에 번역권이 2장 이상 나감 | 정상 — 자막 1,200줄당 1장 올림 차감(`BLOCKS_PER_CREDIT`, `decisions.md` §6-22). 장수는 업로드 화면에서 미리 표시된다. 분모를 바꾸려면 `constants.ts`(원가 근거가 그 주석에 있음)와 `0015_credit_by_lines.sql`의 리터럴을 **같은 커밋에서** 함께 고칠 것 |
| "파일이 너무 커요"로 거절됨 | 더 이상 없는 동작이다(2026-08-21까지 존재). 아직 뜬다면 배포된 번들이 낡았거나, polish 경로(`POLISH_MAX_BLOCKS`, 2,000블록)를 보고 있는 것이다 |
| 특정 청크만 원문 그대로 | 그 청크 호출 실패 + sweep도 못 건짐 — `gemini.ts` 로그, `chunkRetry.ts`(1차 판단), `[sweep]` 콘솔 로그의 `stoppedBy` — §9.6·§9.65 |
| 일부 줄만 원문 그대로 | sweep을 통과하고도 남은 줄. `[sweep] ... stopped by` 로그로 원인 구분: `no-progress`(모델이 계속 같은 실패) / `budget`(호출 상한) / `fatal`(quota·auth) — §9.65 |
| 원문으로 남은 줄이 늘었는데 비용은 그대로 | sweep이 안 돌았다는 뜻. `leftover` 수거(`useTranslation.ts`)나 `unmatchedIndices` 배관(`srt.ts`→SSE)이 끊겼는지 확인 — §9.65 |
| sweep 때문에 비용이 걱정됨 | 상한은 `constants.ts` `RECOVERY`(라운드)와 `computeSweepBudget`(호출 수). 실제 소비는 `[sweep] ... calls N` 로그 — §9.65 |
| API 한도 초과 이후 남은 파일이 통째로 원문 | 의도된 전역 중단(quota/auth) — `chunkRetry.ts` `RetryState.fatalCode`, 화면엔 `stopReason` 배너 — §9.6 |
| 에러 종류에 따라 재시도/중단 동작을 바꾸고 싶음 | `translationErrors.ts` 분류(`classifyError`)·성격 함수(`isFatalCode`/`isRetryableCode`) — §9.6 |
| 진행 바가 너무 빨리 차서 끝에서 오래 기다림(또는 그 반대) | `app/lib/progressEstimate.ts`의 v·t_out·θ(출처는 `tuning/chunk-size-model.md` §1), 이징 곡선은 `app/lib/easing.ts` — §6 |
| 진행 바가 계단으로 튐 / 한참 멈춰 있음 | `useEasedProgress.ts`(rAF·reduced-motion), 밴드는 `progressStages.ts` |
| 타임코드 검증 단계가 안 보이고 완료로 넘어감 | `constants.ts` `MIN_VERIFY_MS`, 표시 순서는 `useTranslation.ts`의 `finalizing` 세팅 위치 |
| 화면 문구가 이상함 | `app/i18n/simpleCopy.ts` (하드코딩 금지) |
| 베타 계측(토큰·이벤트)이 안 남는다 | 서버는 `chunkUsage.ts`/`api/translate/route.ts` 로그부터, 클라는 `metrics.ts`/`events.ts`의 fire-and-forget이 실패를 삼켰을 수 있음 — 네트워크 탭에서 `/api/translation/metrics`·`/api/events` 확인 — §11 |
| 재방문 피드백 모달이 안 뜬다 | `pending_feedback_job()` 조건(완료 6시간~30일, 미응답, 미해제) 미충족이 정상 — Supabase에서 `translation_jobs`/`feedback` 직접 조회 — §11 |

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

# CLAUDE.md

세션 시작 시 반드시 읽는다 — 상세는 아래 문서들로 넘긴다.

나는 개발자 출신 회사 대표이고, 너는 20년차 풀스택 웹개발자이자 PM이야.

**ZAMAK** — SRT·VTT·SMI·ASS 자막을 Gemini로 번역하는 Next.js 앱. 업로드 포맷은
가장자리에서 정규 SRT로 바꾸고, **타임코드는 코드가 소유하고 AI는 번호+대사만
다룬다** (그래서 번역 후에도 싱크가 안 밀린다). 다운로드는 원본 형식(현재 VTT까지)
또는 `.srt` — 원본 형식은 재작성이 아니라 원본에 대사만 끼워넣는다.

## ⚠️ 번역 관련 코드를 바꾸면 '문서 지도'도 같은 커밋에서 갱신할 것

`docs/translation-pipeline.md`는 업로드→다운로드 전 과정과 "증상→고칠 파일"을 적은
품질관리 지도다. 아래를 건드리면 그 지도가 낡으니 함께 고친다:
프롬프트(`prompts/`), enrich(`app/lib/server/enrichMovie.ts`, `tmdb.ts`),
글로사리 추출(`app/lib/server/extractCastSheet.ts`, `app/api/glossary`),
청킹·재조립(`app/lib/srt.ts`), 포맷 어댑터(`app/lib/subtitles/`),
프롬프트 조합(`app/lib/prompts/`),
번역 서비스/라우트(`app/lib/server/translationService.ts`, `app/api/translate`),
관련 상수(`app/config/constants.ts`).

## 문서 지도

- `README.md` — 설치·인증·결제·환경변수 등 상세.
- `docs/translation-pipeline.md` — 번역 파이프라인 단계별 + 품질 레버.
- `docs/decisions.md` — "왜 이렇게 되어 있나" (뒤집힌 결정 포함).
- `docs/TODO.md` — 미착수 개선안.
- `docs/tuning/` — 청크 크기 등 수치 유도. 블록당 실측 원가는 `cost-per-block.md`,
  "토큰이 어디로 가는가"(비용 레버 우선순위)는 `token-economics.md`.
- `docs/standards/` — 외부 스타일 가이드 참조(Netflix 한국어 자막 번역·갭 검토).

## 명령

- 개발 서버: `npm run dev` (프리뷰는 Browser 도구로 — Bash로 서버 띄우지 말 것)
- 검증: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`

## 깨면 안 되는 불변식

1. **청크 입력 블록 수 = 출력 블록 수** (재조립이 번호로 대조).
2. **타임코드는 코드가 복원** — 모델엔 번호+대사만 보내고, 모델이 뱉은 타임스탬프는 불신.
3. **청크 크기 상한**: 재번호 드리프트 천장(~600블록) 밑으로 유지.
4. **UI 버킷↔AI 버킷↔글로사리 버킷 분리**: 제목/연도/감독/포스터(화면용)와
   장르/배경/톤(프롬프트용)을 섞지 말 것. `movieInfo.notes`는 사용자 자유 입력 전용.
   글로사리·존대관계(`CastSheet`, `app/types/glossary.ts`)는 이 둘과 또 다른 제3의
   버킷 — `MovieInfo`에 합치지 말고 별도 타입·별도 프롬프트 태그(`<glossary>`,
   `<speech_relations>`)로 유지한다. 글로사리는 **프로 번역에만** 붙는다
   (`app/lib/glossaryGate.ts`의 `glossaryAppliesTo`). 라이트면 이 버킷은
   프롬프트에 아예 나타나지 않아야 하고, 그 강제는 화면이 아니라 서버
   (`requestValidation.ts`)가 한다.

## 컨벤션

- 화면 문구는 하드코딩 금지 → `app/i18n/simpleCopy.ts` (`COPY`).
- 설정/상수는 `app/config/constants.ts` 한 곳.
- 도착어는 한국어만 활성 → `app/config/languages.ts`.

## 지시사항

- 사용자의 요구사항을 파악한 후 구현 계획을 보고 후 승인이 나면 구현을 시작한다.
- 구현이 끝나면 문서 지도와 버전 업데이트 한다.
- 기능 단위로 커밋한다.
- 베타(main)에 포함되지 않는 기능은 `feature/<이름>` 브랜치 + git worktree에서
  개발한다. 워크트리는 리포 밖 형제 디렉터리에 만든다
  (`/Users/jian/projects/zamak-worktrees/<이름>`) — 리포 안에 두면 dev 서버
  워처와 tsc/eslint 글로브가 워크트리를 함께 훑는다.
  - 현재 분리된 것: **`feature/payments`** — 토스페이먼츠 결제 일체(라우트·
    toss.ts·packs.ts·PurchaseStep·`COPY.purchase`). 가맹점 심사 대기 중이라
    베타에서 뺐다. 상세와 재개 절차는 `docs/TODO.md`의 "결제 오픈 시 후속 작업".
  - **main에서 기능을 뺄 때 마이그레이션은 같이 빼지 말 것.** 이미 실 DB에
    적용됐고 뒤 번호가 앞 번호를 참조할 수 있다(예: `0004`가 `0002`의
    `settle_order`를 재정의) — 파일을 지우면 새 DB 세팅에서 체인이 끊긴다.

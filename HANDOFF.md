# ZAMAK 핸드오프 — 2026-07-21 세션 종료

나는 개발자 출신 회사 대표이고, 너는 20년차 풀스택 웹개발자이자 PM이다.
ZAMAK은 SRT 자막을 Gemini로 번역하는 Next.js 사이트다 (`/Users/jian/projects/zamak`).

## 먼저 읽을 것 (순서대로)

1. 프로젝트 메모리 `zamak-redesign.md`, `zamak-business-model.md`
2. **`docs/decisions.md`** — 기획·설계 결정과 그 이유. 뒤집힌 결정도 취소선으로 남아 있으니
   같은 논의를 반복하지 말 것
3. `docs/tuning/chunk-size-model.md` — B/K 유도 전 과정
4. `README.md` — 현재 아키텍처

---

## 🔴 다음 세션 첫 작업: `feat/landing` 머지

랜딩 페이지 작업이 **별도 워크트리에서 완료됐는데 아직 main에 안 들어왔다.** 이것부터 처리한다.

```
워크트리: /Users/jian/projects/zamak-landing  (브랜치 feat/landing)
커밋 3개:
  9e309fb Document landing-page decisions in decisions.md
  8c00864 Rename middleware.ts to proxy.ts (Next 16 convention)
  55677cc Replace bare sign-in gate with a static landing page
```

변경 규모: 9파일, +307/-112. `SignInGate.tsx` 삭제 → `LandingPage.tsx` 신설,
`simpleCopy.ts`에 `COPY.landing` 추가, `middleware.ts` → `proxy.ts` 리네임 포함.

**병합 충돌은 없다** — scratch 워크트리에서 dry-run 머지로 확인 완료(`docs/decisions.md`가
양쪽에서 수정됐지만 auto-merge 성공).

### 머지 절차

1. `git merge feat/landing` (main에서)
2. **머지 후 반드시 검증**: `npx tsc --noEmit` / `npx eslint app proxy.ts` / `npx vitest run`
   - ⚠️ `middleware.ts`가 `proxy.ts`로 바뀌었으므로 **lint 명령의 파일명이 달라진다**.
     기존 컨벤션 `npx eslint app middleware.ts`는 이제 안 먹는다
   - ⚠️ 이번 세션에서 main이 `providers/`, `prompts/`, `translationService`를 크게 고쳤다.
     dry-run은 텍스트 충돌만 확인한 것이지 **의미적 충돌은 테스트로 확인해야 한다**
3. 랜딩 화면 실제 확인: `preview_start(name: "zamak-dev")` → 익명 상태로 접속
4. 문제 없으면 워크트리 정리: `git worktree remove ../zamak-landing`
   (그 안의 `HANDOFF-landing.md`는 커밋 안 된 임시 문서라 같이 사라진다 — 정상)

---

## 이번 세션에서 확정한 것

### 1) THINKING_LEVEL = **LOW 최종 확정** ✅

대표가 직접 품질 비교 → **MEDIUM과 유의미한 차이 없음**. LOW로 확정하고 더 이상 논의하지
않는다. MEDIUM/HIGH는 thinking 토큰을 실제로 써서 비용·시간이 3~4.5배가 되는데 그만한
값을 못 한다(HIGH는 적자).

**실측 원가: 1,480블록 영화 1편 ≈ 400원** (LOW, B=125, 12청크, `thoughts=0`)

⚠️ **단, `thoughts=0`은 프롬프트 의존적이다.** 짧은 청크에 긴 지침을 붙인 테스트에서는
LOW인데도 `thoughts=781`이 나왔다. 프롬프트를 크게 늘리면 이 결정의 전제가 무너지고,
`th≠0`이 되면 B=125의 근거("비용 곡선이 평평하다")도 같이 흔들린다. 재측정할 것.

### 2) 프롬프트 구조 변경 — system/user 분리 (커밋 `9936527`)

**프롬프트 문구는 한 글자도 안 바꾸고 구조만 옮겼다.**

- 고정 지시(역할·신뢰경계·규칙 11개) → API의 `systemInstruction` 채널
- 요청별 데이터(`content_metadata`·`user_notes`·`subtitle_data`) → user 턴
- 블록 수 확인 문구를 데이터 **앞 → 뒤**로 이동 (task-at-the-end)
- 빈 `gemini/adapter.txt`가 만들던 트리플 빈줄 버그 제거
- 이제 무의미해진 댕글링 문장("모델별 지침 뒤에 오는…") 삭제
- `composeTranslationPrompt`가 문자열 대신 `{system, user}` 반환
- 파일명: `subtitle_translation.txt` → `subtitle_translation_system.txt`

**채택 근거는 캐싱이 아니라 (a) 주입 방어 (b) 순서 규율이다.** `user_notes`는
`/api/enrich`가 Google Search grounding으로 웹에서 긁어온 텍스트라, 지시와 데이터가
API 레벨에서 분리되는 게 실질적 이득이다. **실측 결과 캐싱은 안 걸렸다(`cached=0`).**

### 3) translation_rules_ko.txt 개선 (미커밋)

코드와 대조 검토 후 **3줄만** 수정. 대표가 직접 반영함.

| 규칙 | 변경 | 이유 |
|---|---|---|
| 1 | "포맷 보존이 최우선" 삭제 → **"재배열 금지 / 출력 순서도 입력과 동일"** 추가 | `srt.ts`의 매칭이 **단조증가**를 요구하는데 규칙에 순서 보존이 없었다 |
| 3 | "코드 블록(```)" 명시 | `stripCodeFence`가 실제로 방어하는 패턴 |
| 11 | "SRT 구조 보존 + 블록 수 동일성" → **"번호 무결성(순서·개수·재배열 금지)"** 로 통합 | 둘 다 같은 메커니즘의 다른 이름이었다 |

### 4) 프롬프트 A/B 하네스 (커밋 `1384967`)

```
npm run harness -- variants=meaning,cinematic title=... year=...
npm run harness -- file=... limit=2          # 싸게 연기 테스트
THINKING_LEVEL=MEDIUM npm run harness -- ...  # 레벨당 프로세스 1개
```

- `scripts/prompt-ab.mts` — **프로덕션 코드 경로를 그대로 탄다**(재구현 아님).
  로그인·크레딧·dev 서버 전부 불필요(프로바이더 직접 호출). 단 **실제 API 비용 발생**
- `scripts/harness/loader.mjs` — 순수 node에서 앱 서버 모듈을 불러오는 훅
  (`server-only` 스텁 + 확장자 없는 import 보정)
- 측정: 정렬실패율 / 블록수 불일치 / API 실패 / 시간 / 입·출력·thinking·캐시 토큰 / 비용
- **`P_fixed`와 `t_in`을 최소제곱 적합으로 자동 재유도** — 프롬프트를 바꿔도 손으로 역산할
  필요 없음
- 변형 간 **다르게 번역된 줄만 뽑는 diff** 생성
- 결과는 `.harness/<타임스탬프>/` (gitignore됨 — 제3자 자막 번역물 포함)

### 5) 실측 결과 (그레이트 뷰티, 1,480블록, LOW, 신규 구조)

```
12청크 전부 thoughts=0, cached=0
정렬 실패: 1,480블록 중 1개 (0.07%)  ← 기존 기준선 0.5~0.65%보다 낮음
가장 느린 청크 13.6s → 전체 체감 15초 내외
```

⚠️ 이건 **"바뀐 뒤" 숫자만** 있고 구버전과의 직접 비교가 아니다. 정렬 실패율이 낮아진 게
규칙 개선 덕인지 이 영화가 원래 쉬운 파일인지 **아직 구분 못 한다.**

---

## 남은 할 일

### 즉시

1. **⭐ `feat/landing` 머지** (위 절차대로)
2. **`translation_rules_ko_original.txt` 처리** — 규칙 개선 전 원본 백업본이다. git 히스토리에
   이미 원본이 있으므로 중복이다. 커밋하지 말고 **삭제할지 대표에게 확인할 것**

### 검증 (하네스 사용)

3. **프롬프트 A/B 미실행** — 규칙 신/구를 같은 파일로 돌려 비교한 적이 없다. 순서 보존
   문구 추가의 효과가 실측되지 않았다. 실비 약 $0.6~0.7

### 제품

4. **결제 연동** — 국내만이면 토스페이먼츠, 해외까지면 Paddle/Lemon Squeezy(VAT 대행).
   붙이는 날 **전자상거래법 표시사항 + 환불 정책 페이지** 같이 배포
5. **크레딧 상한 1,500블록 재검토** — 실제 대상 영화가 **1,480블록**으로 측정됐다(여유 20).
   초과하면 413으로 **하드 거절**되고 부분 번역·2크레딧 결제 같은 폴백이 없다.
   상한 인상은 B가 아니라 **K로 흡수 가능**(`⌈상한/B⌉ ≤ K`). "1크레딧 = 1편"을 긴 영화에도
   유지할지가 같이 걸린 제품 결정
6. **크레딧 환불 정책** — 번역 실패해도 차감된 크레딧을 안 돌려준다. 부분 실패는 원문 유지로
   완전한 SRT가 나오므로 일단 수용했으나 실패율 오르면 재검토

### 품질·기술 부채

7. **character_voice_registry** — 청크는 서로를 모른 채 병렬 번역된다. 같은 인물의 말투가
   파일 중간에 바뀌는 게 체감 품질의 최대 하자인데 **프롬프트 문구로는 안 고쳐진다.**
   `/api/enrich`가 산문 노트 대신 **인물 → 상대별 반말/존댓말·호칭 표**를 내도록 바꿔 모든
   청크에 동일 주입하면 파일당 1회 비용으로 고정된다. enrich 출력 스키마 변경이라 범위 큼
8. **`indexTranslatedBodies` 순서 역전 시 본문 오염** — 모델이 번호를 역순으로 내보내면
   해당 블록은 원문 유지(지표에 잡힘)되지만 **그 번역문이 직전 블록 본문에 덧붙어 조용히
   오염된다**(`srt.ts`의 단조증가 조건). 프롬프트로 예방은 했으나 코드 방어는 없다.
   실측 발생 사례는 아직 없음
9. **비영어 원어 커버리지** — `t_in`·`t_out`·`P_fixed`가 전부 영어 자막에서 나온 값이다.
   중국어·이탈리아어가 실제 입력으로 들어오면 토큰 밀도가 달라 비용·B 상한이 바뀐다.
   프롬프트에도 원어별 지시가 없다
10. **철학 파일 처리 미결** — `cinematic_translation_philosophy_ko.txt`(60줄)는
    `page.tsx`가 `'meaning'`을 하드코딩해서 **도달 불가**다. `translation_examples_ko.txt`도
    마찬가지(`examplesSection: ''`). 지울지, 켤지, A/B로 판단할지 미정.
    켜려면 규칙 11번과 철학의 `<priority_order>`가 **충돌**하므로 병합 필수

---

## 현재 상태

```
main = 9936527 (feat/landing 미머지)
  9936527 Split translation prompt into system/user API channels
  1384967 Add prompt A/B harness; log follow-up items from tuning session
  5fe6be3 Add dev-only SQL snippets for credit testing
```

**미커밋으로 남긴 것:**
- `prompts/common/translation_rules_ko_original.txt` — 규칙 개선 전 원본 백업.
  git 히스토리에 이미 있어 중복이므로 일부러 커밋하지 않았다

⚠️ **`1384967`은 단독으로 빌드가 깨진다** — 파일명 변경 스테이징을 잘못 나눠 옛 프롬프트
파일 삭제만 들어갔고 새 파일은 다음 커밋에 들어갔다. 현재 HEAD는 정상. `git bisect`나
커밋 단위 되돌리기 시 이 지점은 건너뛸 것.

## 현재 설정값

| 항목 | 값 | 근거 |
|---|---|---|
| B (청크 크기) | **125** | `⌈1500/14⌉=108` 이상이어야 1웨이브. 125는 1500을 12로 정확히 나눔 |
| K (동시성) | **14** | 제약이 아닌 **배분 선택**. Gemini·Vercel 둘 다 동시성을 안 막는다 |
| THINKING_LEVEL | **LOW** | 확정 |
| 크레딧 상한 | 1,500블록 | 재검토 대상 (위 5번) |
| 모델 | `gemini-3.5-flash` | 보조 라우트는 `gemini-3.1-flash-lite` |

**B의 진짜 천장** (K는 사실상 자유):
- 요청당 출력 토큰 상한 65,536 → `t_out=16` 기준 약 4,000블록
- `translate` 라우트 `maxDuration=300s` → 약 4,000블록
- 실질 한계는 **매칭 실패율**(경험적)과 **손실반경**(청크 1개 실패 = B블록 미번역, 재시도 없음)

## 컨벤션

- UI 문구는 `app/i18n/simpleCopy.ts`의 `COPY` 객체로만 (컴포넌트 하드코딩 금지)
- 기능 끌 땐 env 플래그 뒤로 (`THINKING_LEVEL`, `TRANSLATION_STRICT_MODE`)
- 변경 후 `npx tsc --noEmit` / `npx eslint app proxy.ts` / `npx vitest run` (현재 43 통과)
  - ⚠️ 머지 전까지는 `middleware.ts`, 머지 후에는 `proxy.ts`
- dev 서버는 `preview_start(name: "zamak-dev")`. Next 16이 디렉터리당 1개 제한
- **`THINKING_LEVEL`은 모듈 로드 시 1회 상수라 변경 시 dev 서버 재시작 필수**.
  `NEXT_PUBLIC_CHUNK_SIZE` 등은 핫리로드 됨
- `.env.local`은 gitignore. 워크트리 만들면 **수동 복사 필요**
- `samples/subtitles/*.srt`와 `.harness/`도 gitignore. 커밋 전 `git add --dry-run` 확인
- 나(Claude)는 계정 생성·비밀번호 입력이 금지 — 실제 Google 로그인이 필요한 검증은 대표가
  직접. 브라우저 자동화 파일 업로드와 익명 curl 검증은 가능
- 실측값은 `docs/tuning/chunk-size-model.md` §1, 조회값은 `gemini-limits.md`에 분리 기록

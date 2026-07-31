# 번역 진행 화면 개선 설계 — 단계 표시·검증 체크·실측 추정 바

작성 2026-07-31. `ProgressStep`이 사용자에게 거짓말하는 세 지점을 고친다:
안 쓴 단계를 회색으로 남기고, 실제로 한 검증을 한 프레임도 안 보여주고,
진행 바가 계단으로 튄다.

---

## 1. 배경 — 실사용에서 관찰된 세 증상

| # | 증상 | 원인 |
|---|---|---|
| 1 | '인물과 용어를 정리하는 중'이 글로사리 OFF일 때 '건너뜀'으로 남아 있다 | `stageViews()`가 `'skipped'` 상태를 만들어 렌더 |
| 2 | '타임코드를 검증하는 중'이 **체크가 아예 안 켜지고** 완료 화면으로 넘어간다 | `useTranslation.ts:504`의 `stage:'finalizing'`과 `:561`의 `stage:'done'`이 **같은 tick**에 실행 → React가 배치 → `finalizing`이 한 프레임도 페인트되지 않는다 |
| 3 | 진행 바가 계단식으로 튄다 | `overallPercent()`가 청크 착지 이벤트에만 반응. Pro는 전체 런이 1웨이브라 **142초 동안 이벤트가 0건** |

②는 연출 문제가 아니라 **타이밍 버그**다. ③은 Pro에서 특히 나쁘다 —
`PRO_CHUNK_SIZE=250`, `SERVER_CONCURRENCY=16`이므로 1,124블록 파일은 청크 5개가
전부 동시 실행되고, `onCompleted`가 한 번도 불리지 않은 채 25%에서 멈춰 있는다.

## 2. 목표 / 비목표

**목표**
- 건너뛴 단계는 화면에서 사라진다.
- 실제로 수행한 타임코드 검증이 **눈에 보이게** 체크된다 (최소 2초).
- 진행 바가 실측 기반 추정으로 부드럽게 오르고, 완료 시 가속해서 100%에 닿는다.
- 설정 화면이 약속하는 초와 진행 바가 도는 초가 **같은 식**에서 나온다.
- `TRANSLATION_ESTIMATE_MS[PRO]`의 "미측정 자리표시자" 딱지를 뗀다.

**비목표**
- 진행률을 서버에서 스트리밍받는 구조 변경. 클라이언트가 가진 정보로만 한다.
- 랜딩 카피 "12초" 변경. 파일 크기를 명시한 문구라 per-file 추정과 모순되지 않는다.
- 스윕(`recoverySweep`) 자체의 동작 변경. 표시만 다룬다.
- 실패·취소 경로의 UI 변경.

## 3. 핵심 결정 — 천장은 '다음 청크'가 아니라 '밴드 끝'

브레인스토밍 중 한 번 뒤집힌 결정이라 명시해 둔다.

**기각안**: 바를 `[percent(k), percent(k+1))` 안에서만 이징하고 다음 청크 착지를
천장으로 삼는다. → **Pro에서 무너진다.** 1웨이브 런은 체크포인트가 없어서 바가
142초를 멈춘다. 증상 ③ 그대로다.

**채택안**:

```
percent = max( 실제진행(청크 착지분), 시간이징(경과, 추정) )

시간이징: 현재 밴드의 끝을 향한 지수 이징 — 점근할 뿐 도달하지 않는다
실제진행: 청크가 착지할 때마다 올라가는 바닥
done:     빠른 이징(τ≈150ms)으로 100%까지 스냅
```

지수 이징이라 **밴드 끝을 수학적으로 넘을 수 없다.** 이것이 `decisions.md` §2-7이
지키려던 성질을 유지하는 지점이다 — 추정이 짧으면 거짓말이 아니라 **크롤로 열화**되고,
추정이 길면 실제 청크 착지가 바닥을 밀어올려 따라잡는다. 양쪽 다 정직하다.

## 4. 컴포넌트

### 4-1. `app/lib/progressEstimate.ts` (신규, 순수)

`docs/tuning/chunk-size-model.md` §1·§2의 실측 파라미터와 공식을 코드로 옮긴다.
지금까지 이 유도는 문서에만 있었고 코드에는 모델별 상수 하나뿐이었다.

```
D(model, B) = TTFT + B·(t_out + θ) / v          // 청크 하나의 소요
T           = ⌈m/K⌉ · D + OVERHEAD              // 전체 벽시계
```

| 기호 | flash | pro | 출처 |
|---|---|---|---|
| v (tok/s) | 220 | 100 | chunk-size-model §1 실측표 (pro는 보수값) |
| t_out | 16 | 16 | 동 |
| θ (thinking tok/블록) | 0 | 40 | 동. 07-31에 44.0으로 재확인 |
| TTFT | 2s | 2s | 동 (추정치로 표기됨) |
| OVERHEAD | 3s | 3s | 재조립·리딩스피드 보정 등 실측 잔차 |

**공개 API 두 개:**

```ts
// 청크 수를 아직 모를 때 (설정 화면). m = ⌈blocks / chunkSizeForModel(model)⌉
estimateRunMsFromBlocks(blocks: number, model: string): number

// 청크 수가 확정된 뒤 (번역 시작 직후). m을 실제 값으로 받는다
estimateRunMsFromChunks(totalChunks: number, chunkSize: number, model: string): number
```

두 개로 나누는 이유: `chunkSrtBlocksAtGaps()`가 장면 경계에서 자르느라 청크 수가
`⌈N/B⌉`와 다를 수 있다. 번역이 시작되면 `totalChunks`가 **정확한 값**으로 잡히므로
그때는 근사를 쓸 이유가 없다.

**실측 대조 — 단위 테스트로 고정한다 (±25% 이내 assert):**

| 런 | 예측 | 실측 | 출처 |
|---|---|---|---|
| flash 461블록 (B=100) | 12.3s | 12.0s | experiment-log 2026-07-28 |
| flash 1,874블록 (B=100) | 21.5s | 17.8s | 동 |
| pro 1,124블록 (B=250) | 145s | 161.4s | experiment-log 2026-07-31 (스윕 1회 포함) |

2웨이브 케이스(1,874블록)가 21% 과대다 — `⌈m/K⌉`가 3개짜리 마지막 웨이브도
풀 웨이브로 세기 때문이다. 이건 §4-2의 실측 보정이 첫 웨이브 착지 후 잡는다.
스윕이 붙는 pro 런은 반대로 10% 과소인데, 스윕은 조건부라 모델에 넣지 않는다 —
스윕 구간은 verify 밴드가 따로 담당한다(§4-5).

### 4-2. 실측 보정 (`useTranslation.ts`)

`onCompleted`마다 관측 처리율로 재추정하고 모델 예측과 가중 혼합한다:

```
w         = min(1, completed / min(totalChunks, K))      // 한 웨이브 착지 = 완전 신뢰
measured  = 경과 × (totalChunks - completed) / completed
remaining = (1 - w)·모델예측잔여 + w·measured
```

Pro처럼 1웨이브로 끝나는 런은 보정 기회가 없지만, 그 구간에서는 모델 예측이 이미
정확하다(145 vs 161.4). 보정은 웨이브가 여러 개인 flash 대형 파일에서 값을 한다.

`TranslationProgress`의 기존 필드(`estimatedRemainingMs`, `lastUpdateTimestamp`,
`totalEstimateMs`)를 그대로 쓴다 — 배관은 이미 깔려 있고 값의 출처만 바뀐다.

### 4-3. `app/lib/progressStages.ts` (수정)

밴드를 글로사리 사용 여부의 **함수**로 만든다. 상수 `BANDS`는 사라진다.

```
글로사리 ON :  context [0,15]  glossary [15,25]  translate [25,90]  verify [90,100]
글로사리 OFF:  context [0,25]                    translate [25,90]  verify [90,100]
```

`stageViews()`는 **보이는 단계만** 반환한다. `StageView['state']`에서 `'skipped'`를
삭제하고, 글로사리 OFF면 배열에서 아예 뺀다. 행만 숨기고 밴드를 그대로 두면
바가 15%→25%로 순간 점프하므로 둘은 같이 가야 한다.

`COPY.progress.stageSkipped`('건너뜀')를 삭제한다.

### 4-4. `app/hooks/useEasedProgress.ts` (신규)

```ts
useEasedProgress(input: {
  floor: number;        // 실제 진행에서 온 바닥
  bandEnd: number;      // 점근 천장
  expectedMs: number;   // 이 밴드를 지나는 데 걸릴 추정 시간
  snapTo?: number;      // done일 때 100
}): number
```

- `requestAnimationFrame` 루프. `eased = floor + (bandEnd - floor)·(1 - e^(-t/τ))`,
  τ는 `expectedMs`에서 갭의 ~95%에 닿도록 잡는다.
- **단조 증가 보장**: `max(prev, computed)`. 밴드가 바뀌어도 뒤로 가지 않는다.
- `snapTo`가 주어지면 τ≈150ms로 그 값까지 당긴다.
- `prefers-reduced-motion: reduce`면 rAF를 돌리지 않고 실제 값만 반환한다.
- 언마운트/`done` 시 rAF 취소.

`floor`는 기존 `overallPercent()`가 그대로 담당한다 (함수는 유지, 밴드만 §4-3처럼
글로사리 여부를 받게 바뀐다). `bandEnd`/`expectedMs`는 현재 활성 밴드에서 뽑는다:

| 활성 밴드 | bandEnd | expectedMs |
|---|---|---|
| context | 15 (또는 OFF면 25) | 3,000ms 고정 — enrich는 대기 상수가 없다 |
| glossary | 25 | `GLOSSARY_WAIT_MS` (기존 상수) |
| translate | 90 | 보정된 `estimatedRemainingMs` |
| verify | 100 | `MIN_VERIFY_MS` |

### 4-5. verify 단계 — 버그 수정 + 최소 노출 (`useTranslation.ts`)

세 가지를 한다:

1. `setTranslationProgress({ stage: 'finalizing', ... })`를 **실제 검증 작업
   (`adjustSubtitleTiming` → `buildDownloads`) 앞으로** 옮긴다. 지금은 뒤에 있어서
   표시가 이미 끝난 일을 가리킨다. 앞으로 옮기면 표시가 실제가 된다.
2. `finalizing` 진입 시각을 기록하고, `stage:'done'` 세팅과 `onSuccess()` **앞에서**
   `MIN_VERIFY_MS`(2,000ms) 최소 노출을 보장한다:
   `await sleep(max(0, MIN_VERIFY_MS - 경과))`
3. 이 대기는 `controller.signal`을 존중한다 — 취소되면 즉시 빠져나가고
   `done`으로 넘어가지 않는다.

고정 2초가 아니라 **최소 2초**다. 스윕이 더 오래 걸리면 그만큼 더 보여준다.
이 2초 동안 verify 밴드(90→100)가 이징하므로 체크가 켜지는 게 눈에 보인다.

`MIN_VERIFY_MS`는 `app/config/constants.ts`에 둔다 (컨벤션: 상수는 한 곳).

**왜 순수 연출이 아닌가**: 검증 작업 자체는 수십 ms라 어차피 안 보인다. 하지만
①표시 시점을 실제 작업 앞으로 옮겼고 ②스켈레톤 최소 노출과 같은 정당한 패턴이며
③목적이 "안 했다"는 **오해를 없애는 것**이다. 하지 않은 일을 했다고 하는 게 아니라,
한 일을 볼 수 있게 만드는 것이다.

### 4-6. `ProgressStep.tsx` (수정)

- `useEasedProgress`의 값으로 바를 그린다. `transition: width 0.15s linear`는 제거한다
  (rAF가 매 프레임 값을 주므로 CSS 트랜지션과 이중으로 걸린다).
- `'skipped'` 분기와 '건너뜀' 배지 렌더를 삭제한다.
- 남은 초 표시는 §4-2의 보정된 `estimatedRemainingMs`에서 읽는다.

### 4-7. Pro 상수 정리 (`app/config/constants.ts`)

```
TRANSLATION_ESTIMATE_MS[PRO_MODEL]: 180_000 → 165_000    // 실측 161.4s 올림
TRANSLATION_ESTIMATE_MS[FLASH_MODEL]: 20_000             // 유지
```

이 상수의 **역할이 바뀐다**: 이제 블록 수를 모를 때의 폴백 전용이다.
`estimateTranslationMs()`의 주석에 그 사실과 새 근거(experiment-log 2026-07-31,
1,124블록 161.4s)를 적는다. `decisions.md` §2-7의 주의사항
"pro 3분은 미측정 자리표시자다"가 이로써 해소된다.

### 4-8. 설정 화면 ETA 통일 (`app/page.tsx:130`)

`estimateTranslationMs(model)` → `estimateRunMsFromBlocks(totalLines, model)`.
업로드 시점에 `totalLines`가 이미 잡혀 있다(`useWizard.ts:238`).

이건 §2-7의 원래 우려("같은 화면에서 카피와 링이 다른 시간을 말한다")를
**해소하는 방향**이다 — 설정 화면과 진행 바가 같은 식에서 나온 같은 숫자를 말하게 된다.

## 5. 데이터 흐름

```
업로드 → totalLines
   └→ [설정] estimateRunMsFromBlocks(totalLines, model) → "약 N초" 약속

번역 시작 → chunkSrtBlocksAtGaps() → totalChunks 확정
   └→ estimateRunMsFromChunks(totalChunks, chunkSize, model) → totalEstimateMs
        └→ onCompleted마다 실측 보정 → estimatedRemainingMs
             └→ overallPercent() → floor
                  └→ useEasedProgress(floor, bandEnd, expectedMs) → 화면 percent
```

## 6. 실패·경계 케이스

| 케이스 | 동작 |
|---|---|
| `totalChunks === 0` (첫 이벤트 전) | 밴드 바닥에 고정. 기존 NaN 가드 유지 |
| 추정보다 빠름 | 실제 청크 착지가 바닥을 밀어올려 이징을 추월. `max()`가 처리 |
| 추정보다 느림 | 밴드 끝에 점근하며 크롤. 넘지 않는다 |
| 번역 중 취소 | `IDLE_PROGRESS`로 복귀, rAF 취소, verify 대기 즉시 탈출 |
| 스윕 발생 | verify 밴드 안에서 진행. `recoveringDetail` 문구는 그대로 |
| `prefers-reduced-motion` | rAF 없이 실제 값만. 계단이 보이지만 그게 사용자가 요청한 것 |
| 실패로 종료 | `setScreen('settings')` 경로 — 이번 변경과 무관 |

## 7. 테스트

| 파일 | 검증 |
|---|---|
| `app/lib/progressEstimate.test.ts` (신규) | §4-1 실측 대조 3행이 ±25% 이내. 모델 미상 → flash 폴백. blocks=0 방어 |
| `app/lib/progressStages.test.ts` (신규) | 글로사리 ON/OFF 밴드 재분배. OFF일 때 배열 길이 3. 단조성 |
| `app/config/constants.test.ts` (수정) | `:161`의 `180_000` → `165_000` |
| `app/hooks/useEasedProgress.test.ts` (신규) | 단조 증가. 밴드 끝 초과 없음. reduced-motion 시 패스스루 |

`useTranslation`의 최소 노출은 통합 성격이라 단위 테스트하지 않는다 —
`/dev/preview`의 `progress` 화면과 실제 런으로 확인한다.

## 8. 문서 갱신 (같은 커밋)

CLAUDE.md의 '문서 지도' 규칙에 따라 `constants.ts`를 건드리므로 필수다.

- `docs/decisions.md` — §2-7을 되뒤집는 새 항목. 왜 지금은 되살려도 되는가:
  ①화면에 이미 초 단위 숫자가 떠 있어 "카피 하나 vs 파일별 숫자" 대립이 이미 무의미
  ②설정 ETA와 진행 바가 같은 식을 쓰게 되어 오히려 통일됨
  ③지수 이징이 §2-7의 "짧으면 크롤로 열화" 성질을 그대로 유지
  ④pro 3분 자리표시자 해소. 그리고 §4-5의 최소 노출이 왜 페이크가 아닌지.
- `docs/translation-pipeline.md` — `TRANSLATION_ESTIMATE_MS` 값 변경 반영.
- `docs/tuning/chunk-size-model.md` — §1 파라미터가 이제 런타임 코드
  (`progressEstimate.ts`)에서도 쓰인다는 포인터 한 줄. 값을 고치면 UI 추정이 함께
  움직인다는 경고.

## 9. 범위 밖

- 서버 스트리밍 진행률.
- flash 2웨이브 케이스의 `⌈m/K⌉` 과대 추정을 모델 자체에서 고치기 (실측 보정으로 충분).
- pro 스윕 소요를 추정 모델에 편입 (조건부라 밴드로 흡수).
- 랜딩 카피 모델별 분기 (§2-7 주의사항에 남아 있는 별건).

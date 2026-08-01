# 작품 식별 → 번역 맥락: 포스터 위계와 카피 재설계

작성 2026-08-02. 마법사의 작품 정보 화면 두 곳(`WorkPickStep`,
`TranslateSettingsStep`)에서 **포스터의 위계를 낮추고 카피 프레임을 "작품
식별"에서 "번역 맥락 입력"으로 바꾼다.** 더불어 문서에만 있고 코드가 지키지
않던 "작품을 못 찾아도 번역은 진행된다"는 약속을 실제 경로로 만든다.

---

## 1. 배경

ZAMAK은 자막 파일을 받아 자막 파일을 돌려준다. 자막을 호스팅하지도, 배포하지도,
라이브러리를 갖고 있지도 않다. 도구의 법적 위치를 가르는 선은 UI가 얼마나
친절하냐가 아니라 **서비스가 침해를 유도하느냐**이고, 그 방어는 이미 갖춰져
있다 — 닫기 없는 저작권 동의 게이트(`CopyrightModal`), "업로드하는 파일에 대한
권리와 책임은 이용자에게 있습니다"라는 문구, 동의 기록 저장, 비배포 구조.

문제는 법적 책임이 아니라 **화면이 읽히는 방식**이다. 포스터가 달린 세로 후보
리스트는 시각적으로 Plex·Infuse 같은 **미디어 라이브러리 브라우징 문법**이다.
"네 컬렉션을 관리해준다"는 인상은 두 군데서 실제 비용이 된다:

1. **TMDB 상업 라이선스 심사** — 매출이 문턱을 넘으면 용도 심사를 받는다. 가격
   자체는 문제가 아니지만(공식 미공개, 업계 통용 수치 월 $149 수준), "불법 자막
   도구"로 읽히면 그건 비용 리스크가 아니라 승인 리스크다.
2. **결제 가맹점 심사** — `feature/payments`가 심사 대기 중이다(`docs/TODO.md`).

동시에 화면이 실제로 하는 일은 작품 식별이 아니다. 수집한 값은
`MovieInfo`의 AI 버킷(장르·배경/시대·톤앤매너)으로 흘러 번역 프롬프트에
들어간다(`docs/translation-pipeline.md` §2-A). **화면의 목적을 그대로 말하면
유도 인상이 사라지면서 기능 설명도 더 정확해진다.** 이 스펙은 그 정렬 작업이다.

랜딩(`COPY.landing`)은 이미 정렬돼 있다 — 히어로가 "전문 자막가의 규칙을 배운
AI 자막 번역"이고, 데모는 실제 작품이 아니라 익명 대사 4쌍이다. 손대지 않는다.

## 2. 목표 / 비목표

**목표**
- 포스터를 "브라우징 아트워크"에서 "확인용 썸네일"로 강등한다.
- 카피 프레임을 작품 식별 → 번역 맥락으로 바꾼다.
- 작품을 고르지 않고도 번역까지 갈 수 있는 경로를 만든다.

**비목표**
- **TMDB 제거.** `enrichWithGrounding`이 이미 포스터 없는 폴백 경로로 존재하므로
  TMDB는 하루면 뺄 수 있는 의존성이지 락인이 아니다. 게다가 TMDB 경로에서도
  `extractKeywords`가 그라운딩 호출을 1번 하므로 제거해도 Gemini 비용은 줄지
  않고 포스터·장르·cast 앵커만 잃는다. 지금 뺄 이유가 없다.
- enrich 로직, 프롬프트, `/api/enrich`, `tmdb.ts` 변경. 이 작업은 UI 위계와
  문자열, 그리고 마법사 상태 하나에 한정한다.
- 랜딩·약관·저작권 모달 변경.
- 후보 카드의 줄거리 2줄 제거. 리메이크·동명 구분에는 포스터보다 줄거리가 실제로
  더 잘 든다 — 이 화면의 진짜 일꾼이라 유지한다.

## 3. 포스터 위계

### 3-1. 후보 카드 — 유지하되 축소

`app/components/beta/WorkPickStep.tsx`의 `CandidateCard`.

포스터가 실제로 일하는 유일한 순간은 "리메이크 3개 중 어느 거지?"를 가를
때다. 그 일에는 썸네일이면 충분하다.

- 이미지·플레이스홀더 모두 `w-14 h-20`(56×80) → `w-10 h-14`(40×56).
- 이미지의 `rounded-lg` → `rounded-poster`. 지금 플레이스홀더만 토큰을 쓰고
  이미지는 Tailwind 기본값을 쓰는 불일치가 있다.
- 카드의 `gap-[18px]` → `gap-[14px]`. 썸네일이 작아진 만큼 좁힌다.

### 3-2. 확정 카드 — 포스터 제거

`app/components/beta/TranslateSettingsStep.tsx`의 `.card.detected`(현재 135~170행).

확인은 이 화면에 오기 전에 끝났다. 확정 후의 포스터는 순수한 장식이고,
설정 화면 내내 크게 떠 있어서 라이브러리 인상의 주범이다.

- `<div className='poster'>` 블록 삭제. 제목 · 연도 · 감독 + `dbadge`만 남긴다.
- 딸려서 죽는 것 — 확인 결과 이 카드가 유일한 사용처다:
  - `app/globals.css`의 `.poster`, `.poster span`, `.poster img` 규칙.
    (후보 카드는 Tailwind 유틸을 쓰므로 영향 없다. `--r-poster` 토큰은 후보
    카드가 계속 쓰니 유지한다.)
  - `COPY.info.posterAlt`, `COPY.info.posterEmpty`.
    (`COPY.workPick.posterEmpty`는 후보 카드 전용이라 별개 — 유지.)

## 4. 카피 — 식별에서 맥락으로

`app/i18n/simpleCopy.ts`. 화면 문구 하드코딩 금지 규칙(CLAUDE.md)에 따라 전부
`COPY`에서 바꾼다.

| 키 | 현재 | 변경 |
|---|---|---|
| `workPick.title` | 어떤 작품인가요? | 번역에 참고할 작품 맥락 |
| `workPick.subtitle` | 작품을 선택해 주시면 시대 배경과 말투까지 조율하여 번역합니다. | 시대 배경과 장르를 알면 말투를 그에 맞춰 옮깁니다. 건너뛰어도 번역은 진행됩니다. |
| `workPick.confirm` | 이 작품으로 계속 | 이 맥락으로 번역 |
| `workPick.searchOpen` | 찾는 작품이 없습니다 | 직접 검색 |
| `workPick.searchHint` | 제목으로 다시 검색해 드립니다. 작품을 찾지 못해도 번역은 계속 진행할 수 있습니다. | 제목으로 다시 검색합니다. |
| `settings.sectionWork` | 작품 정보 | 번역 맥락 |
| `settings.confirmQuestion` | '{work}'(으)로 인식했습니다. 맞으신가요? | '{work}'의 맥락으로 번역할까요? |
| `settings.changeWork` | 작품 변경 | 맥락 변경 |
| `info.detectedBadge` | AI 자동 검색 완료 | 맥락 자동 입력됨 |
| `info.searching` | 작품 정보를 검색하고 있습니다… | 번역 맥락을 찾고 있습니다… |
| `upload.readingSub` | 타임코드를 분석하고 작품 정보를 찾고 있어요 | 타임코드를 분석하고 번역 맥락을 찾고 있어요 |

**신규**: `workPick.skip` = `작품 정보 없이 번역` (§5).

`searchHint`의 뒷문장("작품을 찾지 못해도…")은 삭제한다. 그 약속은 이제 힌트
텍스트가 아니라 §5의 실제 버튼이 담당한다.

`settings.contextHint`("번역에 그대로 반영됩니다. 비워 두시면 자막 내용만으로
판단합니다.")는 **이미 맥락 프레임이므로 건드리지 않는다.** 이 문장이 목표 톤의
기준점이고, 나머지를 여기에 맞추는 작업이다.

## 5. 작품 정보 없이 번역

현재 `WorkPickStep`의 `canConfirm`은 영화 분기에서 `selectedIndex >= 0`을
요구한다(46행). 그래서 후보를 고르지 않으면 진행이 막히는데,
`searchHint`는 진행할 수 있다고 약속하고 있었다. 코드가 약속을 지키게 만든다.

### 5-1. UI

`MovieBranch` 하단, "직접 검색" 토글 아래에 secondary 버튼 하나. `onSkip`은
`canConfirm`과 무관하게 항상 활성이다.

### 5-2. 상태

`app/hooks/useWizard.ts`에 `skipWorkPick` 콜백을 추가한다. `confirmWorkPick`의
영화 분기와 달리 `runSelectCandidate`를 부르지 않는다:

- `setWorkConfirmed(true)`
- `setAutoMatched(false)` — 설정 화면의 확인 배너는 자동 매치 전용이다.
- `setScreen('settings')`

`movieInfo`는 빈 채로 둔다. 설정 화면의 장르 · 시대 · 톤 입력은 이미 편집
가능하므로 사용자가 직접 채우거나 비워 둘 수 있고, 비면
`settings.contextHint`가 약속한 대로 자막 내용만으로 판단한다.

### 5-3. 확정 카드 렌더 조건

skip 경로에서는 `movieInfo.title`이 빈 문자열이라, 현재 조건
(`contentType === 'movie' && !searching && !needsConfirm`)으로는 제목이 `—`인
빈 카드가 렌더된다. 조건에 제목 존재 여부를 더해 **제목이 없으면 카드를 아예
생략**하고 맥락 입력 카드만 남긴다.

## 6. 영향 파일

```
app/i18n/simpleCopy.ts                        §4 문자열, workPick.skip 추가
app/components/beta/WorkPickStep.tsx          §3-1 썸네일 축소, §5-1 skip 버튼
app/components/beta/TranslateSettingsStep.tsx §3-2 포스터 제거, §5-3 렌더 조건
app/globals.css                               §3-2 .poster 규칙 3개 제거
app/hooks/useWizard.ts                        §5-2 skipWorkPick
app/hooks/useWizard.test.ts                   §5-2 테스트
app/page.tsx                                  onSkip 배선
app/dev/preview/PreviewHarness.tsx            onSkip 배선
docs/decisions.md                             결정 기록 (포지셔닝 근거)
docs/translation-pipeline.md                  §2-A 후보 UI 서술 + skip 경로
```

`app/i18n/simpleCopy.test.ts`는 랜딩 CPS 수치 전용이라 영향받지 않는다.

## 7. 테스트

- **`useWizard.test.ts`** — `skipWorkPick` 후 `screen === 'settings'`,
  `workConfirmed === true`, `autoMatched === false`, `movieInfo.title === ''`.
  그리고 skip이 `runSelectCandidate`(즉 `/api/enrich` 선택 모드)를 부르지 않는지.
- **수동 확인** (Browser 도구, `PreviewHarness`) — 세 상태를 실제로 본다:
  후보 여러 개 / 자동 매치 확정 / skip 직후 설정 화면.
- **전체 검증** — `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`.

포스터 크기와 카피 문자열 자체는 테스트하지 않는다. 시각 위계는 회귀
테스트로 고정할 대상이 아니고, 문자열 스냅샷은 카피 수정을 방해하기만 한다.

## 8. 커밋 분할

기능 단위 커밋(CLAUDE.md):

1. **포스터 위계 + 카피** — `simpleCopy.ts`, `WorkPickStep.tsx`,
   `TranslateSettingsStep.tsx`, `globals.css`
2. **작품 정보 없이 번역 경로** — `useWizard.ts`, `useWizard.test.ts`,
   `WorkPickStep.tsx`, `page.tsx`, `PreviewHarness.tsx`
   (`workPick.skip` 문자열은 버튼과 함께 이 커밋에)
3. **문서** — `decisions.md`, `translation-pipeline.md`

## 9. 열어두는 것

- **TMDB 상업 라이선스 신청 시점.** 매출이 문턱에 닿을 때 재검토한다. 그때
  용도 설명은 이 스펙이 만든 프레임("자막 번역 엔진의 맥락 입력")을 그대로 쓴다.
- **후보 카드의 포스터 자체.** 이번엔 축소만 한다. 심사에서 이미지 사용이
  문제되면 그때 `posterUrl`을 안 그리는 것으로 충분하다 — 데이터는 이미
  optional이라 코드 변경이 작다.

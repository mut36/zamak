// Korean-first conversational copy for the Simple flow.
// Centralized so a second locale can be layered on later.

export const COPY = {
  brand: 'ZAMAK',
  langPill: '한국어',

  // Mono breadcrumb shown above the H1 on every step screen (업로드 →
  // 설정 → 번역). WorkPickStep (작품 인식) and TranslateSettingsStep share
  // the '설정' step — see StepBreadcrumb.
  steps: {
    upload: '업로드',
    settings: '설정',
    translate: '번역',
  },

  nav: {
    credits: (lite: number, pro: number) => `라이트 ${lite} · 프로 ${pro}`,
    // 무제한 계정은 편수가 의미 없다. 만료가 있으면 날짜까지, 없으면(운영자)
    // 그냥 무제한.
    unlimited: (until: string | null) =>
      until
        ? `무제한 · ${new Date(until).toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
          })}까지`
        : '무제한',
    mypage: '마이페이지',
  },

  auth: {
    signIn: 'Google로 계속하기',
    signingIn: '로그인 중…',
    gateNote: '로그인은 번역권 지급과 사용량 확인 목적으로만 사용됩니다.',
    signOut: '로그아웃',
    loading: '불러오는 중…',
    failed: '로그인에 실패했습니다. 다시 시도해 주세요.',
    notConfigured:
      '로그인이 아직 설정되지 않았습니다. 서버 환경 변수를 확인해 주세요.',
    /** Header chip. */
    creditsLeft: (n: number) => `번역권 ${n}장`,
  },

  // 랜딩(비로그인 `/`) — design_handoff_zamak_landing 그대로. 마케팅 카피는
  // 자주 바뀌므로 데모 데이터(히어로 4쌍, 엔진 3개, CPS 3개, 속도 4단계,
  // 규칙 3행)까지 전부 여기에 둔다. 수치는 핸드오프의 "확인 필요 항목" —
  // 실측으로 교체될 수 있다(docs/TODO.md).
  landing: {
    wordmark: 'ZAMAK',
    /** All four CTAs point at the same Google sign-in. */
    cta: '무료로 시작하기',
    notConfigured: '로그인이 아직 설정되지 않았어요.',

    nav: {
      how: '이용 방법',
      compare: '번역 비교',
      speed: '속도',
      cps: '자막 규칙',
      pricing: '가격',
    },

    // 여기 `\n`은 **모든 폭에서 지켜진다**. 예전에는 640px 아래에서 공백으로
    // 풀었는데(`whitespace-normal sm:whitespace-pre-line`), 그러면 손으로 잡은
    // 문장 리듬이 폰에서 통째로 사라졌다. 지금은 `.lp-fit`이 "가용 폭 ÷ 가장
    // 긴 줄의 폭"으로 글자 크기를 줄여 줄바꿈을 버티게 하고, 더 줄이면 못 읽는
    // 하한에 닿아서야 브라우저 줄바꿈에 넘긴다(`docs/decisions.md` §1-21).
    //
    // 그러니 `\n`은 여전히 **의도한 자리에만** 넣을 것 — 넣는 만큼 그 요소의
    // 최소 글자 크기가 작아진다. 한 줄이 길수록 더 작아진다.
    hero: {
      // `titleBrand`·끝 온점은 LandingPage가 Wordmark와 같이 mono·accent로 붙인다.
      title: '자막은 읽는 게 아니라 보는 거니까, \n영상에 감기는',
      titleBrand: 'ZAMAK',
      // 파는 것은 '감수 불필요'가 아니라 '초벌 시간 절감'이다. 이 서브는
      // "따로 감수할 필요가 없습니다"로 시작했는데, 타깃(영상번역
      // 프리랜서)은 자기 이름으로 납품하느라 어차피 검수한다 — 그 사람에게
      // 검수 불필요는 약속이 아니라 '제 일을 모르는 도구'라는 신호다.
      // `COPY.plans.pro.bestFor`가 이미 '후편집 시간을 줄이고 싶을 때'라고
      // 정직하게 적고 있었으므로, 히어로를 안쪽 화면 톤에 맞춘 것이다.
      //
      // '드라마 한 편'은 장식이 아니라 조건 단서다 — 빼면
      // `simpleCopy.test.ts`의 '조건 단서 없이 속도를 파는 자리가 없다'가
      // 실패한다. 크레딧 상한(2,000블록)짜리 파일은 두 웨이브라 15초가
      // 거짓이 되기 때문. 초 단위 수치도 이 문장에 **하나만** 둔다.
      // '표준 규칙' → '자막 규칙': 규격을 참칭하지 않기로 한 §1-26의 연장.
      sub: '드라마 한 편 초벌에 쓰던 몇 시간을 *15초*로 줄입니다.\n*OTT 자막 규칙*까지 적용된 채로 나오니, 손볼 곳만 손보세요.',
      secondaryCta: '번역 품질 비교하기',
      note: '실제 번역 결과 예시. 타임코드는 코드가 관리해 싱크가 밀리지 않습니다.',
      demoLabel: '번역 결과 예시',
      pairs: [
        {
          lang: 'EN',
          tc: '00:38:11,400',
          src: 'Keep insisting.\nDripping hollows the stone.',
          ko: '계속 밀어붙이게\n낙숫물이 바위를 뚫는다고 하잖나',
        },
        {
          lang: 'EN',
          tc: '00:51:02,180',
          src: 'Tell me about it.',
          ko: '내 말이',
        },
        {
          lang: 'EN',
          tc: '00:29:47,300',
          src: "I'm not saying it's your fault.\nI'm just saying somebody has to take responsibility.",
          ko: '네 탓이라는 건 아니지만\n누군가는 책임을 져야지',
        },
        {
          lang: 'EN',
          tc: '00:19:33,000',
          src: 'Like hell you are.',
          ko: '꿈도 꾸지 마.',
        },
      ],
    },

    // "속도"(아래)가 "15초 동안 시스템이 하는 일"을 판다면, 이 섹션은
    // "사용자가 실제로 누르는 화면"을 판다 — 관점이 다르지 겹치는 정보는
    // 아니다. 4단계는 실제 화면 흐름 그대로다: 업로드(`UploadStep`) →
    // 작품 확인(`WorkPickStep` — 영화/드라마는 TMDB 후보 확인, 그 외는
    // 유형·톤 직접 입력) → 품질 선택(`TranslateSettingsStep`) →
    // 다운로드(`DoneStep` — 원본 형식 우선, 항상 SRT 대안). 화면이 바뀌면
    // 이 문구도 같은 커밋에서 고칠 것.
    how: {
      title: '이렇게 사용합니다.',
      sub: '읽지 말고 직접 해보세요. 영상 없이 자막 파일 하나로 끝납니다.',
      steps: [
        {
          num: '1',
          title: '자막 파일을 올리세요',
          desc: 'SRT · VTT · SMI · ASS, 무엇이든 좋습니다.\n영화 · 드라마 / 예능 · 유튜브 / 강연 · 토크쇼 중 유형만 골라 주세요.',
        },
        {
          num: '2',
          title: '작품 정보를 확인하세요',
          desc: '영화 · 드라마는 자동으로 찾은 작품이 맞는지 확인합니다.\n그 외 콘텐츠는 원하는 톤을 자유롭게 적어 주세요.',
        },
        {
          num: '3',
          title: '번역 품질을 고르세요',
          desc: '빠른 라이트, 맥락까지 살리는 프로 중 골라\n번역을 시작합니다.',
        },
        {
          num: '4',
          title: '완성된 자막을 받으세요',
          desc: '올린 형식 그대로(SRT · VTT) 또는 SRT로 다운로드.\n타임코드는 코드가 관리해 싱크가 그대로입니다.',
        },
      ],
    },

    // "이용 방법" 섹션의 조작 가능한 데모(`HowItWorksDemo`). 위 `how.steps`가
    // 설명하는 4단계를 사용자가 직접 통과하게 만든 것이라, **단계 수와 순서는
    // `how.steps`와 1:1이어야 한다**(컴포넌트가 인덱스로 맞물린다).
    //
    // 품질 카드의 이름·시간은 여기 적지 않고 `COPY.plans`에서 읽는다 — 랜딩
    // 비교표·설정 화면과 같은 숫자를 말해야 하므로(§1-4 위 주석).
    //
    // 4단계 결과 대사는 여기 없다 — `HowItWorksDemo`가 `compare.engines`의
    // ZAMAK 항목에서 직접 읽는다. 데모에서만 따로 지어내면 같은 페이지가 두
    // 개의 "우리 번역"을 파는 꼴이 되고 CPS 숫자가 조용히 갈라지므로, 아예
    // 복사본을 두지 않는 쪽을 택했다.
    howDemo: {
      /** 전체 데모의 접근성 레이블 + 모션 최소화 안내. */
      label: '4단계 체험 데모',
      /** 마우스/키보드. 터치 기기에서는 `tapHint`로 바꿔 단다. */
      dragHint: '끌어다 놓아 보세요',
      tapHint: '눌러서 올려보세요',
      file: {
        name: 'Interstellar.2014.EN.srt',
        meta: '1,124줄 · 영어',
      },
      dropLabel: '자막 파일을 여기에',
      dropActive: '놓으면 시작합니다',
      work: {
        question: '이 작품이 맞으신가요?',
        title: '인터스텔라',
        meta: '2014 · SF · 크리스토퍼 놀란',
        yes: '네, 맞습니다',
      },
      quality: {
        question: '번역 품질을 골라 주세요',
      },
      progress: {
        label: '번역하는 중',
        /** 진행 바 아래를 지나가는 단계 문구. 속도 섹션의 4단계와 같은 일. */
        stages: ['언어 감지', '작품 맥락 반영', '자막 규칙 적용', '파일 생성'],
      },
      done: {
        label: '번역 완료',
        tc: '00:14:22,100 → 00:14:24,100',
        download: '자막 내려받기',
        note: '체험용 데모입니다. 실제 파일은 로그인 후 받을 수 있어요.',
        restart: '다시 해보기',
      },
    },

    compare: {
      title: '같은 원문, 완전히 다른 몰입감.',
      sub: '직접 비교해 보세요. 자막은 읽는 글이 아니라 듣는 말입니다.',
      tablistLabel: '번역 엔진 선택',
      sourceLabel: '원문 대사',
      // 연속 2줄. CPS 태그는 각 줄 2.0초 노출 가정 시 **가장 빡센 줄** 기준 —
      // `computeCps`와 같은 글자 수로 계산한다(공백 포함, 화자 대시 `- ` 포함).
      //
      // ⚠️ 대시를 빼고 세면 세 엔진 모두 정확히 1.0씩 낮게 나온다 — 2026-08-03
      // 점검에서 12.0/15.0/8.5로 적혀 있던 게 그 오차였다. 대시는 화면에 실제로
      // 찍히므로 세는 게 맞다. `simpleCopy.test.ts`가 이제 이 값을 대사에서
      // 직접 계산해 대조하므로, 대사를 고치면 태그도 같이 고쳐야 통과한다.
      sourceLine:
        "- Who knows he's alive and free?\n- No one, not even his family.",
      sourceMeta: '연속 대사 2줄 · 각 2.0초 노출',
      resultLabel: (engine: string) => `${engine}의 번역`,
      outro:
        'ZAMAK은 문장을 옮기지 않고 장면을 옮깁니다.\n화면에 떠 있는 시간, 인물 간의 관계와 말투까지 모두 고려해 번역한 자막을 경험해보세요.',
      engines: [
        {
          name: '일반 번역기',
          out: '- 그가 살아있고 자유롭다는 걸 누가 알겠어요?\n- 아무도 몰라요, 가족조차도요.',
          tags: [
            { label: 'CPS 13.0 · 상한 초과', tone: 'red' },
            { label: '어색한 직역', tone: 'red' },
            { label: '과잉 존댓말', tone: 'red' },
          ],
        },
        {
          name: '범용 AI 모델',
          out: '- 그가 살아 있고 자유의 몸이라는 걸 아는 사람이 있나?\n- 아무도. 가족조차 몰라.',
          tags: [
            { label: '문장은 자연스러움', tone: 'neutral' },
            // 16.0은 13.0(일반 번역기)보다 나쁜데 톤이 더 순하면 "왜 더 큰
            // 숫자가 덜 경고인가"가 된다. 상한(12) 위반은 두 엔진 다 red로
            // 통일하고, 이 엔진이 중간 등급이라는 건 나머지 두 태그가 진다.
            { label: 'CPS 16.0 · 상한 초과', tone: 'red' },
            { label: '자막 규칙 미적용', tone: 'orange' },
          ],
        },
        {
          name: 'ZAMAK',
          out: '- 생존과 석방 사실은 누가 알지?\n- 아무도요, 가족조차 모릅니다',
          tags: [
            { label: 'CPS 9.5 충족', tone: 'green' },
            { label: '핵심만 압축', tone: 'green' },
            { label: '화자 말투 구분', tone: 'green' },
          ],
        },
      ],
    },

    // 15초는 실측을 덮는 값이다 (`docs/tuning/experiment-log.md` 2026-08-03,
    // 라이트(flash)·프로덕션 설정 그대로): 461블록 13.4초 · 1,124블록 14.8초.
    //
    // **벽시계는 자막 길이에 비례하지 않는다** — 이게 이 문구를 고르는 근거다.
    // SERVER_CONCURRENCY=16 · SERVER_CHUNK_SIZE=100이라 1,600블록까지는 모든
    // 청크가 한 웨이브에 동시에 나가고, 총시간은 곧 **최장 청크 하나**의 시간이
    // 된다(위 두 런 모두 총시간 == 최장청크로 찍혔다). 블록이 2.4배가 돼도
    // 시간은 10%만 늘어난 이유가 그것이다. 1,600블록을 넘으면 두 웨이브가 되어
    // 17.8초까지 간다(같은 로그 2026-07-28, 1,874블록).
    //
    // 2026-08-21(§6-22) 이후 이 조건이 **번역권 1장과 같아졌다**: 1장이
    // 1,200줄이므로 1장짜리 파일은 12청크 ≤ 16, 예외 없이 한 웨이브다. 전에는
    // 상한이 2,000이라 1,601~2,000줄이 '1장인데 두 웨이브'인 구간이었고, 그게
    // 이 문구에 조건 단서를 달아야 했던 이유였다. 이제 단서가 가리키는 건
    // "1장 분량"이고, 2장짜리(2,400줄) 파일은 사용자도 두 배임을 알고 있다.
    //
    // 그래서 이전 값 12초는 쓰면 안 된다 — 7/28에 한 번 나온 최선값이라
    // 같은 파일이 8/3에 13.4초로 재현되지 않았다. 히어로가 팔던 10초는 어떤
    // 런도 찍은 적이 없다(`docs/decisions.md` §1-15).
    //
    // 단계 라벨을 시각(0:00…)이 아니라 번호로 둔 것도 같은 이유 — 중간
    // 단계별 소요 시간은 실측한 적이 없다.
    speed: {
      titleTop: '완벽한 자막을 얻기까지 걸리는 시간, ',
      titleAccent: '단 15초.',
      body: '무거운 영상 파일은 필요 없습니다.\n텍스트 자막 하나만 올리면\n언어 감지, 자막 규칙 적용, 최종 포맷 생성까지 한 번에',
      note: '라이트 모델 실측 기준 — 461줄 13.4초 · 1,124줄 14.8초. 번역권 1장 분량(1,200줄)까지의 수치입니다.',
      steps: [
        {
          time: '01',
          title: '자막 파일 업로드',
          desc: '.srt .vtt .ass .smi, 무엇이든. 조잡한 자동 자막도 괜찮습니다.',
        },
        {
          time: '02',
          title: '언어 · 작품 자동 인식',
          desc: '원본 언어를 감지하고, 작품을 찾아 장르 · 배경 · 톤을 번역에 반영합니다.',
        },
        {
          time: '03',
          title: '번역 + 규칙 적용',
          desc: '자연스러운 한국어로 옮기며 CPS와 표준 자막 규칙을 동시에 맞춥니다.',
        },
        {
          time: '04',
          title: '완성 파일 다운로드',
          desc: '자막 스타일은 원본 그대로, 싱크는 밀리지 않습니다. 바로 영상에 얹으면 됩니다.',
        },
      ],
    },

    // 이 섹션의 수치는 마케팅 문구가 아니라 **실제 엔진 설정**이다 —
    // `app/config/languages.ts`의 `TARGET_LANGS[ko].shapes`. 프로필 순서·키도
    // 그 표와 같다(movie / variety / doc). `value`=`shapes[key].target`이고,
    // 2줄 상한은 `prompts/common/translation_rules_ko.txt` 규칙 2 +
    // `enforceTextRules`. `measured`는 카드에 적힌 대사·타임코드를
    // `computeCps`(공백 포함, 태그 제외) 방식으로 계산한 값이다.
    //
    // ⚠️ 한 줄 자수는 여기에 없다 — 프로필이 아니라 도착어가 정한다
    // (`lineMaxChars`, 한국어 18자). 프로필이 바꾸는 건 **노출 시간**뿐이므로
    // `action`도 그 얘기만 해야 한다(decisions.md §1-19).
    // 표가 바뀌면 여기도 같은 커밋에서 고칠 것 — 어긋나면
    // `simpleCopy.test.ts`가 잡는다.
    cps: {
      title: '장르가 다르면, 자막의 템포도 달라야 하니까.',
      sub: '대사가 빠른 예능과 진중한 다큐멘터리의 자막은 달라야 합니다.\n영상 종류에 맞는 최적의 초당 글자 수(CPS)를 계산해,\n화면이 넘어가기 전 자막을 모두 읽을 수 있도록 완벽한 템포를 찾아냅니다.',
      tablistLabel: '영상 종류 선택',
      speedLabel: '권장 읽기 속도',
      unit: 'CPS',
      lineCountLabel: '줄 수',
      lineCountValue: '최대 2줄',
      actionLabel: 'ZAMAK이 하는 일',
      // ⚠️ "넷플릭스 규칙을 적용한다"고 단정하지 않는다. Netflix 한국어 가이드의
      // 읽기 속도는 성인 ≤12 CPS 하나뿐인데(`docs/standards/
      // netflix-korean-gap-review.md` I.15), ZAMAK은 프로필별로 그보다 빡세게
      // (영화 hardMax 12 · 예능 11) 또는 느슨하게(강연 15) 잡는다. 그래서
      // "따른다"가 아니라 "기준으로 삼고 종류에 맞게 조정한다"가 참이다.
      note: '읽기 속도 기준은 Netflix 한국어 자막 가이드(성인 최대 12 CPS)를 바탕으로, 영상 종류에 맞게 조정합니다.',
      profiles: [
        {
          key: 'movie',
          name: '영화 · 드라마',
          value: '10',
          action: '너무 빨리 지나가는 대사는\n앞뒤 침묵만큼 노출을 넓힘',
          lines: ['생존과 석방 사실은', '누가 알지?'],
          tc: '00:14:22,100 → 00:14:24,100',
          measured: 'CPS 8.0 ✓',
        },
        {
          key: 'variety',
          name: '예능 · 유튜브',
          value: '8',
          action: '화면에 이미 읽을 게 많으니\n자막은 가장 여유 있게',
          lines: ['야 가족도 모른대'],
          tc: '00:03:12,000 → 00:03:14,000',
          measured: 'CPS 4.5 ✓',
        },
        {
          key: 'talk',
          name: '강연 · 토크쇼',
          value: '12',
          action: '말이 끊이지 않는 영상은\n다음 말을 밀지 않게 촘촘히',
          lines: ['그래서 제가 드리고 싶은', '말씀은 이겁니다'],
          tc: '00:18:40,000 → 00:18:42,000',
          measured: 'CPS 10.5 ✓',
        },
      ],
    },

    features: {
      title: '표준 자막 규칙,\n번거로운 편집 없이 한 번에',
      rules: {
        title: '한글 자막 표준 규칙 적용',
        body: '스물여덟 자가 넘어가는 긴 문장의 자연스러운 분할부터\n마침표 제거 등 까다로운 표기 규칙을 알아서 적용해 드립니다.\n사용 중인 포맷(.srt, .vtt, .ass 등) 그대로 작업하세요.',
        rows: [
          { before: '세 줄로 쏟아진 자막', after: '두 줄로 병합' },
          { before: '오 마이 갓...', after: '세상에…' },
          {
            before: '한 줄에 스물여덟 글자가 넘어가는 긴 자막',
            after: '두 줄로 자연스럽게 분할',
          },
        ],
      },
      formats: {
        title: '자막 포맷 4종 지원',
        body: '원본 파일의 구조는 손대지 않고 대사만 교체합니다.\nSRT·VTT는 올린 형식 그대로, ASS·SMI는 SRT로 내려받습니다.',
        chips: ['.srt', '.vtt', '.ass', '.smi'],
      },
      languages: {
        title: '모든 언어 → 한국어',
        body: '원본 언어는 자동으로 인식합니다.\n어떤 언어든 자연스러운 한국어로 번역하세요.',
        codes: 'EN JA ZH ES FR DE …',
      },
    },

    final: {
      title: '백문이 불여일견\n지금 바로 첫 파일을 번역해 보세요',
      sub: '가입 후 첫 파일 무료',
      badge: '베타 운영 중',
    },
  },

  // 규칙 적용 페이지(/polish). 번역 없이 표기 규칙만 적용하는 경로 —
  // **타임코드는 건드리지 않는다**(specs/2026-08-19-polish-page-design.md §5).
  // 카피에서 그 약속을 명시하는 이유: 남의 자막을 자동으로 고쳐주는 기능이라
  // "뭘 안 건드리는지"가 신뢰의 핵심이다.
  polish: {
    navLink: '규칙 적용',
    title: '자막 규칙 적용',
    sub: '이미 번역된 한국어 자막을 방송 표기 규칙에 맞게 다듬어 드립니다.\n번역은 하지 않고, 타임코드는 아래를 켰을 때만 손댑니다.',
    dropButton: '자막 파일 선택',
    dropFormats: '지원 포맷: .srt, .vtt, .ass, .smi',
    working: '규칙을 적용하는 중…',
    doneTitle: '규칙을 적용했습니다',
    // 요약은 **행동할 수 있는 것에만 숫자를 붙인다.** 마침표를 12개 뗐는지
    // 13개 뗐는지는 아무도 안 궁금하고, 그런 숫자가 섞이면 정작 중요한
    // "몇 개를 나눴나"가 묻힌다. 또 `enforceTextRules`의 report는 항목마다
    // 세는 단위가 다르므로(linesMerged는 줄, linesJoined는 자막) 자막 단위로
    // 셀 수 있는 것만 숫자를 보여주고 나머지는 뭉뚱그린다 — 단위를 섞어
    // 보여주면 읽는 사람이 같은 걸 센다고 오해한다(2026-08-19 사용자 피드백).
    splitLine: (n: number) => `긴 자막 ${n}개를 두 줄로 나눴습니다`,
    joinedLine: (n: number) =>
      `두 줄로 나뉘어 있던 짧은 자막 ${n}개는 한 줄로 합쳤습니다`,
    tidiedLine:
      '그 밖에 문장 끝 마침표, 말줄임표 표기, 세 줄 넘는 자막도 규칙에 맞게 정리했습니다',
    nothingToDo: '고칠 것이 없었습니다. 이미 규칙에 맞는 자막입니다.',
    download: '내려받기',
    downloadAs: (extension: string) => `.${extension}로 내려받기`,
    startOver: '다른 파일 올리기',
    limitReached:
      '오늘 사용할 수 있는 횟수를 모두 썼습니다. 내일 다시 시도해 주세요.',
    tooLarge: '파일이 너무 큽니다. 더 짧은 자막으로 시도해 주세요.',
    failed: '규칙 적용에 실패했습니다. 잠시 후 다시 시도해 주세요.',

    // 읽기 속도(CPS) 조정 — **기본 OFF의 opt-in**. 이 화면의 원래 약속이
    // "타임코드를 안 건드린다"였으므로, 켜지 않은 사람에게는 지금까지와
    // 똑같이 동작해야 한다(`applySubtitleRules`의 `timing` 인자).
    //
    // 화면에서 쓰는 "최소·최대"는 엔진의 `cpsTarget`·`cpsHardMax`다. 최대는
    // **손댈지 말지를 가르는 선**이고 최소는 **손댄 자막이 내려앉는 자리**라,
    // 최소는 하한 보장이 아니다 — 원래 그보다 느린 자막은 그대로 둔다.
    // `bandNote`가 그 동작을 그대로 풀어 쓰는 이유다.
    timing: {
      title: '노출 시간도 읽기 속도에 맞추기',
      desc: '너무 빨리 지나가는 자막을 앞뒤 여백 안에서만 늘립니다',
      presetLabel: '영상 종류',
      presetMovie: '영화 · 드라마',
      presetVariety: '예능 · 유튜브',
      presetTalk: '강연 · 토크쇼',
      presetCustom: '직접 설정',
      minLabel: '최소 CPS',
      maxLabel: '최대 CPS',
      unit: (n: number) => `초당 ${n}자`,
      bandNote: (min: number, max: number) =>
        `초당 ${max}자보다 빨리 지나가는 자막을 초당 ${min}자까지 늦춥니다. 원래 그보다 느린 자막과 대사 순서는 건드리지 않습니다.`,
      invalid: '최소 CPS는 최대 CPS보다 작아야 합니다.',
    },
    timingLine: (n: number) => `자막 ${n}개의 노출 시간을 늘렸습니다`,
  },

  // 차감 규칙을 말하는 자리. 2026-08-21까지 여기 있던 건 '파일 용량이 너무
  // 큽니다' 거부 문구였다 — 상한(2,000줄)을 넘으면 번역 자체가 막혔기
  // 때문. 지금은 긴 파일이 거부되는 대신 장수를 더 쓰므로(§6-22) 같은 사실이
  // 거절이 아니라 **안내**가 된다.
  credits: {
    /** 규칙 한 문장 — 약관·가격 화면이 같이 읽는다. 두 곳에 따로 적으면
     *  갈라지고, 갈라진 차감 규칙은 분쟁에서 이용자에게 유리하게 읽힌다. */
    rule: (perCredit: number) =>
      `번역권 1장으로 자막 ${perCredit.toLocaleString()}줄까지 번역합니다. 더 긴 파일은 ${perCredit.toLocaleString()}줄마다 1장씩 더 사용합니다.`,
    /** 업로드 직후·번역 시작 전에 뜨는 줄. 이 변경의 UX 계약이라 사후 통보가
     *  되면 안 된다 — 사용자가 2장이 나가는 걸 누르기 전에 알아야 한다. */
    cost: (n: number, perCredit: number) =>
      `번역권 ${n}장을 사용합니다 — 1장당 ${perCredit.toLocaleString()}줄`,
    /**
     * 견적 한 줄 — "1,340줄 · 약 112분 · 번역권 2장" (§6-23).
     *
     * 번역가는 영상 **분** 단위로 견적을 내는데 우리는 **줄** 단위로 과금한다.
     * 그 간극을 화면이 메우지 않으면 사용자가 우리 숫자를 자기 숫자로 옮기지
     * 못한다. 러닝타임은 공짜 정보다 — 마지막 자막의 종료 타임코드가 곧
     * 영상 길이다(`subtitleRuntimeMs`).
     *
     * ⚠️ **'약'을 떼지 말 것.** 자막 밀도가 작품마다 분당 8.2~12.5줄로
     * 벌어진다(드라마 461줄/56분 · 장편 1,126줄/90분, `srt.test.ts`가
     * 단언). 분은 타임코드에서 나온 실측이지만 그걸 줄 수와 나란히 놓는
     * 순간 "이 정도 길이면 이 정도 줄"로 읽히므로, 어림값임을 문장이 말해야
     * 한다.
     *
     * ⚠️ **금액(원)은 여기 적지 않는다.** `/pricing`이 가격의 유일한 표시
     * 지점이고(§6-21), 결제 전이라 지금 차감되는 건 무료 지급분이다 —
     * 금액을 띄우면 청구되지 않는 돈을 청구되는 것처럼 보여준다.
     */
    quote: (lines: number, minutes: number, credits: number) =>
      `${lines.toLocaleString()}줄 · 약 ${minutes.toLocaleString()}분 · 번역권 ${credits}장`,
    lines: (n: number) => `${n.toLocaleString()}줄`,
    /** 잔액 부족 — 필요 장수와 보유 장수를 둘 다 말한다. 둘 다 있어야
     *  "몇 장을 더 사야 하는가"가 사용자 머릿속에서 계산된다. */
    shortfall: (need: number, have: number) =>
      `이 파일에는 번역권 ${need}장이 필요한데 ${have}장 남아 있습니다.`,
    startOver: '다른 파일 올리기',
  },

  // 번역권 소진 화면 (insufficient_credits). 베타에는 결제창이 없으니 막다른
  // 골목 대신 결제 오픈 대기자 등록을 둔다.
  exhausted: {
    title: (kind: string) => `${kind} 번역권을 모두 사용하셨습니다`,
    /** 잔액이 0은 아닌데 이 파일에는 모자란 경우 — 줄 수 차감이 생기면서
     *  새로 가능해진 상태다. '모두 사용하셨습니다'를 그대로 띄우면 잔액
     *  1장을 눈으로 보고 있는 사람에게 거짓말이 된다. */
    shortTitle: (kind: string) => `${kind} 번역권이 이 파일에는 모자랍니다`,
    kindLite: '라이트',
    kindPro: '프로',
    body: '현재 결제 기능을 준비 중입니다.\n기능이 오픈되면 가장 먼저 알려드릴게요. 업로드하신 파일은 안전하게 보관됩니다.',
    waitlistLabel: '결제 오픈 대기자 등록',
    emailPlaceholder: '이메일 주소',
    join: '등록',
    joined:
      '대기자로 등록되었습니다. 결제 기능이 오픈되면 메일로 알려드릴게요.',
    joinFailed: '등록에 실패했습니다. 이메일 주소를 다시 확인해 주세요.',
    goHistory: '지난 번역 다시 받기',
    back: '설정으로 돌아가기',
  },

  upload: {
    title: '파일 업로드',
    subtitle: '타임코드는 그대로, 대사만 자연스러운 한국어로 옮겨 드립니다.',
    // 세 유형은 정보 수집 분기(영화만 TMDB enrich)와 자막 프로필(읽기 속도·
    // 한 줄 자수, `config/languages.ts`의 `shapes`)을 동시에 고른다. 부제에
    // 적는 수치는 그 표에서 가져올 것 — 랜딩 CPS 섹션과 같은 값이어야 한다.
    kindLabel: '콘텐츠 유형',
    kindHint: '하나를 눌러 선택하세요',
    kindMovie: '영화 · 드라마',
    kindVariety: '예능 · 유튜브',
    kindTalk: '강연 · 토크쇼',
    dropTitle: '자막 파일을 여기에 놓으세요',
    dropFormats: '지원 포맷: .srt, .vtt, .ass, .smi (원본 언어 자동 인식)',
    dropButton: '파일 선택',
    fileReady: '업로드 완료',
    changeFile: '다른 파일 선택',
    next: '다음',
    readingTitle: (name: string) => `${name} 읽는 중…`,
    readingSub: '타임코드를 분석하고 작품 정보를 찾고 있어요',
    noVideoNeeded:
      '영상 파일은 필요하지 않아요. 엉성한 자동 생성 자막도 문제없습니다.',
    invalidFile: 'SRT, VTT, SMI, ASS 파일만 올릴 수 있어요.',
    unreadableFile:
      '자막을 읽지 못했어요. 파일이 손상되지 않았는지 확인하고 다시 올려주세요.',
    // 확장자는 .srt인데 본문이 자막이 아닌 경우(예: 유튜브 자막을 .srt로
    // 저장한 VTT 등). 파서는 예외 없이 0블록 문서를 돌려주므로 상한 검사
    // (tooLarge)로는 못 잡는다 — 별도 메시지가 필요한 이유(2026-08-03).
    noBlocks:
      '이 파일에서 자막을 찾지 못했어요. 확장자와 실제 내용이 맞는지 확인해 주세요.',
    // 두 언어가 한 파일에 든 SMI는 큐마다 어느 쪽을 번역할지 정할 수 없어,
    // 섞인 결과를 내놓느니 여기서 돌려보낸다. 트랙 선택 UI는 docs/TODO.md.
    bilingualSmi:
      '두 가지 언어가 섞인 SMI 파일은 아직 지원하지 않아요. 단일 언어 파일로 올려주세요.',
  },

  info: {
    // movie branch
    movieTitle: '이 작품이 맞으신가요?',
    movieSubtitle:
      'AI가 파일을 분석했습니다. 정보가 다르다면 알맞게 수정해 주세요.',
    analyzing: '파일을 분석하고 있습니다…',
    searching: '작품 정보를 검색하고 있습니다…',
    detectedBadge: 'AI 자동 검색 완료',
    notFoundBadge: '자동 검색 실패',
    posterAlt: (title: string) => `${title} 포스터`,
    posterEmpty: '포스터 없음',
    // Shown when TMDB has several equally-plausible matches (common title,
    // remake) and there's no reason to auto-pick one.
    ambiguousHint:
      '검색 결과가 여러 개 있습니다. 찾으시는 작품을 선택해 주세요.',
    mediaTypeMovie: '영화',
    mediaTypeTv: '드라마',
    labelTitle: '제목',
    labelYear: '개봉 연도',
    labelDirector: '감독',
    edit: '수정',
    research: '다시 검색',
    cancel: '취소',
    notFoundHint: '제목과 개봉 연도를 입력하시면 다시 검색해 드립니다.',
    // Shown when the search failed outright, rather than simply finding
    // nothing. The raw server message follows so the cause is visible instead
    // of hiding behind "자동으로 못 찾았어요".
    enrichFailed: '작품 정보 검색에 실패했습니다.',
    // AI-derived keyword fields fed into the translation prompt. Editable so
    // a wrong AI guess can be corrected before translating.
    aiInfoHint:
      'AI가 자동으로 분석한 정보입니다. 번역 톤앤매너에 반영되니, 잘못된 부분이 있다면 수정해 주세요.',
    genreLabel: '장르',
    eraLabel: '배경/시대',
    toneLabel: '톤앤매너',
    notesLabel: '참고할 내용',
    notesHint: '번역에 참고할 내용을 자유롭게 적어주세요.',
    // other branch
    otherTitle: '어떤 영상인가요?',
    otherSubtitle:
      '영상 앞부분을 읽고 내용을 요약했습니다. 번역의 맥락을 파악하는 데 사용됩니다.',
    summarizing: '내용을 요약하고 있습니다…',
    summaryBadge: 'AI 내용 요약 완료',
    otherNotesLabel: '참고할 내용 · 선택',
    otherNotesHint:
      '말투(존댓말/반말), 전문 용어 표기 등 참고할 내용을 적어주세요.',
    // shared
    back: '이전',
    translatePro: '고급번역',
    translateFlash: '빠른번역',
    startOver: '처음부터',

    // Cast-sheet toggle card — opt-in glossary + speech-relation prepass.
    // Independent of the translation model toggle above (see decisions.md).
    castSheet: {
      title: '등장인물·용어 일관성',
      /** 소요 시간은 여기서 말하지 않는다 — 하단 바의 `c.eta`가 이미 합산해
       *  말하고, 두 곳이 각자 시간을 말하면 어긋난다. */
      hint: '프로 번역에 포함됩니다. 이름·지명 표기와 말투를 자막 전체에서 통일합니다.',
      extracting: '분석하고 있습니다…',
      count: (n: number) => `${n}개`,
      tabTerms: '표기',
      tabRelations: '말투',
      termSourceLabel: '원문',
      kindLabel: '유형',
      /** 키는 `GlossaryTerm['kind']`와 정확히 같아야 한다. 프롬프트용 KIND_LABEL
       *  (`app/lib/prompts/glossaryContent.ts`)과는 일부러 합치지 않는다 —
       *  프롬프트 문구가 화면 문구를 따라 흔들리면 안 된다. */
      kinds: {
        person: '인물',
        place: '장소',
        org: '조직',
        term: '용어',
      },
      notePlaceholder: '메모 (예: 주인공의 형)',
      /** Doubles as the placeholder, so it names the actual target language. */
      termTargetLabel: (language: string) => `${language} 표기`,
      addTerm: '+ 새 항목',
      removeRow: '삭제',
      emptyTerms: '표기 항목이 없습니다. 직접 추가하실 수 있습니다.',
      emptyRelations: '아직 파악된 말투 관계가 없습니다.',
      /** Shown when the target language has no formality axis (영어·중국어). */
      noFormality: (language: string) =>
        `${language}에는 존댓말/반말 구분이 없어 표기만 통일합니다.`,
      relationRange: (from: number, to: number) => `${from}~${to}번 구간`,
      refetch: '다시 추출',
      refetchConfirm: '직접 고치신 내용이 사라집니다. 다시 추출할까요?',
      addRelation: '+ 말투 관계 추가',
      /** 구간 입력 두 칸의 접근성 라벨. 화면에는 안 보인다. */
      rangeFrom: '시작 자막 번호',
      rangeTo: '끝 자막 번호',
      /** 인물 항목이 둘 미만이면 관계를 만들 수 없다 — 화자·청자가 모두 인물이어야 한다. */
      needTwoPeople: '인물 항목이 둘 이상이어야 말투 관계를 만들 수 있습니다.',
      /** 번역 AI가 이 표를 그대로 따른다는 사실을 사람에게 알린다(스펙 §3-0). */
      relationsNotice: '번역은 이 표를 그대로 따릅니다. 틀린 곳은 고쳐 주세요.',
      /** 내레이션 문체 — 키는 `NarrationStyle`과 정확히 같아야 한다. */
      narrationLabel: '내레이션 문체',
      narrations: {
        none: '내레이션 없음',
        formal: '들려주는 낭독 (~습니다)',
        literary: '혼자 하는 서술 (~다)',
        mixed: '둘 다 나옴',
      },
    },
  },

  // 랜딩의 라이트·프로 비교 섹션과 설정 화면의 "?" 팝오버가 같이 읽는
  // 단일 소스. 여기서 갈라지면 랜딩이 약속한 것과 설정 화면이 보여주는
  // 것이 서로 다른 숫자를 말하게 된다 — `simpleCopy.test.ts`가 두 소비처
  // 모두 이 객체를 참조하는지 확인한다.
  //
  // 시간 수치는 `docs/tuning/experiment-log.md`의 실측이다(둘 다
  // "프로덕션 설정 그대로"): 라이트는 랜딩 속도 섹션과 같은 근거
  // (461블록 13.4초 · 1,124블록 14.8초), 프로는 2026-07-31 장편
  // 타임아웃 실측(1,124블록, PRO_THINKING_LEVEL=HIGH·PRO_CHUNK_SIZE=250,
  // 총 161.4초). 크레딧 표기는 `docs/decisions.md` §6-22 — 요청이
  // 아니라 **줄 수** 단위 차감이다(1,200줄당 1장, 올림). 청크 수와 무관한
  // 것은 여전하다. §1-4의 '파일 1편 = 1장'을 뒤집은 자리라 '1편'으로
  // 되돌리지 말 것.
  plans: {
    title: '라이트 vs 프로',
    sub: '적용하는 규칙은 같습니다. 다른 건 속도와 맥락 분석입니다.',
    /** 비교표 아래 → `/pricing`. 금액은 여기 적지 않는다 — `/pricing`이 가격의
     *  유일한 표시 지점이다(`docs/decisions.md` §6-21). */
    priceLink: '번역권 가격 보기',
    lite: {
      name: '라이트',
      time: '약 15초',
      timeNote:
        '드라마 한 편(461블록) 기준 실측 13.4초 · 1,124블록 기준 14.8초.',
      quality: '빠르고 정확한 기본 번역',
      context: '작품 맥락 분석 없음',
      bestFor: '일반 자막, 빠른 초벌',
      credit: '자막 1,200줄당 라이트 1장',
    },
    pro: {
      name: '프로',
      time: '약 2분 41초',
      timeNote: '장편(1,124블록) 기준 실측 161.4초.',
      quality: '작품 맥락 분석 + 인물명 일관성',
      context: '장르 · 시대 · 톤을 더 깊이 반영',
      bestFor: '인물 관계가 복잡한 작품, 후편집 시간을 줄이고 싶을 때',
      credit: '자막 1,200줄당 프로 1장',
    },
    rows: [
      { key: 'time', label: '예상 소요' },
      { key: 'quality', label: '번역 품질' },
      { key: 'context', label: '맥락 반영' },
      { key: 'bestFor', label: '이럴 때' },
      { key: 'credit', label: '차감' },
    ],
  },

  settings: {
    title: '번역 설정',
    subtitleAuto: '원본 언어 자동 인식 → 한국어',
    confirmBadge: '확인 필요',
    confirmQuestion: (work: string) =>
      `'${work}'(으)로 인식했습니다. 맞으신가요?`,
    confirmHint: '다른 작품이라면 다시 선택해 주세요',
    confirmYes: '네, 맞습니다',
    confirmNo: '아닙니다',
    changeWork: '작품 변경',
    genreLabel: '장르',
    genrePlaceholder: '예: 느와르, 미스터리',
    eraLabel: '시대 · 배경',
    eraPlaceholder: '예: 1920년대 아일랜드 해안, 고립된 등대',
    toneLabel: '톤앤매너',
    tonePlaceholder: '예: 고전적이고 절제된 어투, 심리극',
    contextEditable: '(수정 가능)',
    contextHint:
      '번역에 그대로 반영됩니다. 비워 두시면 자막 내용만으로 판단합니다.',
    // Section labels above each group of settings (design_handoff_zamak_brand).
    sectionWork: '작품 정보',
    sectionQuality: '번역 품질',
    // "?" 팝오버 — `COPY.plans`(랜딩 비교 섹션과 공유)를 표로 보여준다.
    plansInfoToggle: '자세히 비교',
    sectionAdvanced: '세부 조정 (선택)',
    liteName: '라이트',
    // 랜딩 히어로·`COPY.landing.speed`와 같은 숫자를 써야 한다 — 첫 화면에서
    // 약속한 시간을 설정 화면이 뒤집으면 그 자리에서 들킨다. 조건 단서
    // ("드라마 한 편")도 같이 온다: 그게 없으면 2장짜리(2,400줄) 파일에도
    // 같은 약속을 하는 문구가 된다. 1장짜리(≤1,200줄)는 이제 예외 없이 한
    // 웨이브라 15초가 참이지만, 2장짜리는 두 배 분량이다.
    liteDesc: '빠르고 정확한 기본 번역.\n드라마 한 편 기준 15초면 완료됩니다.',
    proName: '프로',
    proDesc: '작품 맥락 분석과 인물명 일관성.\n후편집 시간을 줄이는 초벌 번역.',
    // "무료" is load-bearing for the beta: the credits are a gift, not a
    // purchase. Revisit this wording when paid credits ship.
    creditsLeft: (n: number) => `무료 ${n}장 남음`,
    eta: (sec: number) => `예상 소요 약 ${sec}초`,
    start: '번역 시작',
  },

  workPick: {
    sourceLangBadge: '원본 언어: 자동 인식',
    title: '어떤 작품인가요?',
    subtitle: '작품을 선택해 주시면 시대 배경과 말투까지 조율하여 번역합니다.',
    posterEmpty: 'poster',
    kindMovie: '영화',
    kindTv: '드라마',
    searchOpen: '찾는 작품이 없습니다',
    searchClose: '검색 닫기',
    searchPlaceholder: '작품 제목을 검색하세요',
    // enrich()는 제목+연도만 받는다. 감독으로 찾아준다고 쓰면 못 지키는 약속이 된다.
    searchHint:
      '제목으로 다시 검색해 드립니다. 작품을 찾지 못해도 번역은 계속 진행할 수 있습니다.',
    confirm: '이 작품으로 계속',
    otherTypeLabel: '콘텐츠 유형',
    otherTypes: ['유튜브', '강연·인터뷰', '브이로그', '기타'],
    toneLabel: '원하는 톤앤매너',
    tonePlaceholder: '예: 친근한 반말, 유튜브 예능 자막처럼 리듬감 있게',
  },

  progress: {
    label: '번역 중',
    analyzing: '파일을 분석하고 있습니다',
    translating: '자막을 번역하고 있습니다',
    recovering: '누락된 줄을 다시 번역하고 있습니다',
    finalizing: '마지막으로 다듬고 있습니다',
    recentLabel: '방금 번역한 대사',
    remaining: (lines: number, total: number, sec: number) =>
      `${lines.toLocaleString()} / ${total.toLocaleString()}줄 · 약 ${sec}초 남음`,
    // Sweep readout. The ring is already pinned at its ceiling by the time the
    // sweep runs, so this line is the only thing that can show it progressing.
    recoveringDetail: (recovered: number, remaining: number) =>
      `${recovered.toLocaleString()}줄 복구 · ${remaining.toLocaleString()}줄 남음`,
    reassure: '번역이 완료될 때까지 이 창을 열어두세요.',
    cancel: '취소',
    // 취소는 사용자의 선택이라 번역권이 그대로 소진된다(잡을 열 때 이미
    // 차감됐고, 되돌리는 경로가 아직 없다 — docs/TODO.md "크레딧 환불 정책").
    // 누른 뒤에 알게 되면 그건 사고라서, 확인창에서 미리 말한다.
    cancelConfirm:
      (credits: number) =>
        `번역을 취소하시겠습니까?\n\n이미 시작된 번역이라 번역권 ${credits}장은 사용된 것으로 처리됩니다.`,
    stages: {
      context: '자막 맥락을 분석하는 중',
      glossary: '인물과 용어를 정리하는 중',
      translate: '자막을 번역하는 중',
      verify: '타임코드를 검증하는 중',
    },
    pct: (pct: number, sec: number) =>
      `${String(Math.floor(pct)).padStart(2, '0')}% · 약 ${sec}초 남음`,
    keepOpen: '창을 닫아도 번역은 백그라운드에서 계속 진행됩니다',
  },

  // Failure strings for the translation run. useTranslation takes these as a
  // parameter rather than importing COPY, so the hook stays locale-agnostic —
  // but this is the only place they are actually written.
  translateErrors: {
    serverError: (status: number) =>
      `서버에 문제가 발생했습니다. (오류 ${status})`,
    noResponse: '번역 결과를 받지 못했습니다. 다시 시도해 주세요.',
    emptyFile:
      '자막 블록을 찾지 못했습니다. 올바른 자막 파일인지 확인해 주세요.',
    generalError: '번역 중 문제가 발생했습니다. 다시 시도해 주세요.',
  },

  done: {
    title: '번역이 완료되었습니다',
    subtitle: (lines: number, time: string) =>
      `${lines.toLocaleString()}줄을 ${time} 만에 번역했습니다.`,
    download: '번역 자막 다운로드',
    // 올린 형식 그대로 받을 수 있을 때만 두 버튼이 뜬다. 첫 버튼이 원본 형식,
    // 두 번째가 어떤 파일이든 항상 가능한 SRT.
    downloadAs: (extension: string) => `.${extension}로 다운로드`,
    downloadAsHint: (extension: string) =>
      `업로드하신 형식 그대로 다운로드합니다. 자막 스타일과 설정은 원본을 유지하며 대사만 교체됩니다. (.${extension})`,
    startOver: '새 파일 번역하기',
    goHistory: '내 번역 보기',
    // 실제로 무엇을 했는지 적는 리포트 카드. buildReport()가 실측한 항목만
    // 골라내고, 여기 함수들이 그 값을 문장으로 만든다 — 계측하지 않은
    // "CPS 조정 23곳" 같은 줄은 buildReport 쪽에서부터 아예 나오지 않는다.
    reportTitle: '이 번역에 실제로 적용된 것',
    report: {
      timecode: (lines: number, fallback: number) =>
        fallback === 0
          ? `타임코드 ${lines.toLocaleString()}개를 검증했습니다. 원문 그대로 남은 구간은 없습니다.`
          : `타임코드 ${lines.toLocaleString()}개를 검증했습니다. 원문 그대로 남은 구간은 ${fallback}줄입니다.`,
      context: (context: string) =>
        `작품 맥락(${context})에 맞춰 어휘와 문체를 적용했습니다`,
      glossary: (terms: number) =>
        `용어집 ${terms}개 표기를 자막 전체에 일관되게 적용했습니다`,
      relations: (pairs: number) =>
        `설정하신 존대·반말 관계 ${pairs}쌍을 대화 전체에 반영했습니다`,
    },
    feedbackTitle: '이번 번역은 어떠셨나요?',
    feedbackPlaceholder: '자유롭게 남겨주세요 (선택)',
    feedbackSend: '보내기',
    feedbackThanks:
      '의견을 남겨주셔서 감사합니다. 서비스 개선에 큰 도움이 됩니다.',
    feedbackFailed: '의견 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    // Lines still holding their original text in the downloaded file, after
    // the recovery sweep has already retried them. Counted per line, not per
    // chunk: the sweep works block by block, so "구간 2개 실패" would describe
    // a mid-translation state the user never receives.
    partialWarning: (remainingLines: number) =>
      `자막 ${remainingLines.toLocaleString()}줄은 재시도 후에도 번역되지 않아 원문 그대로 남아 있습니다. 해당 줄은 직접 확인해 주세요.`,
    stopReason: {
      quota:
        'API 사용 한도를 초과하여 번역이 중단되었습니다. 번역된 부분까지만 저장되었으며, 나머지는 원문 그대로 유지됩니다.',
      auth: '인증 문제로 번역이 중단되었습니다. 번역된 부분까지만 저장되었으며, 나머지는 원문 그대로 유지됩니다. 다시 로그인한 뒤 시도해 주세요.',
    },
  },

  // 재방문 후속 모달 — "실제로 쓰셨나요"는 완료 화면에서 답할 수 없는
  // 질문이라(그 시점엔 파일을 열어보지도 않았다) 나중 방문에 따로 묻는다.
  // 대상·시점은 서버(pending_feedback_job)가 정한다.
  feedbackFollowup: {
    title: '지난 번역은 어떠셨나요?',
    subtitle: (filename: string) =>
      `${filename} 파일을 실제로 사용해 보셨나요?`,
    usability: {
      'as-is': '그대로 사용했어요',
      'minor-edits': '조금 수정해서 사용했어요',
      'major-edits': '많이 수정해서 사용했어요',
      unusable: '사용하지 못했어요',
    },
    issuesTitle: '어떤 부분이 문제였나요? (복수 선택 가능)',
    issues: {
      mistranslation: '오역',
      'speech-level': '존댓말·반말',
      naming: '이름·용어 표기',
      'too-long': '자막이 너무 길어요',
      unnatural: '어색한 문장',
      timing: '타이밍',
    },
    linesTitle: '문제가 된 줄이 있다면 골라주세요 (선택)',
    linesHint: (max: number) => `최대 ${max}줄까지 고를 수 있어요.`,
    linesSearchPlaceholder: '대사로 검색',
    linesEmpty: '검색 결과가 없습니다.',
    linesLoadFailed: '결과물을 불러오지 못해 이 단계는 건너뜁니다.',
    commentTitle: '한 줄로 남겨주신다면',
    commentPlaceholder: '자유롭게 남겨주세요 (선택)',
    next: '다음',
    submit: '보내기',
    later: '나중에',
    thanks: '의견을 남겨주셔서 감사합니다. 서비스 개선에 큰 도움이 됩니다.',
    close: '닫기',
    failed: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    eventNote: (hasKakao: boolean) =>
      hasKakao
        ? '라이트 번역권 1장을 더 드렸어요. 더 자세한 의견은 오픈카톡이나 이메일로 남겨주시면 프로 번역권으로 보답할게요. (가입할 때 쓴 이메일을 꼭 남겨주세요)'
        : '라이트 번역권 1장을 더 드렸어요. 더 자세한 의견은 이메일로 남겨주시면 프로 번역권으로 보답할게요. (가입할 때 쓴 이메일을 꼭 남겨주세요)',
    kakaoLink: '오픈카톡으로 의견 남기기',
  },

  // 내 번역(/mypage) — 번역권 잔여 + 지난 번역 기록.
  mypage: {
    title: '내 번역',
    creditsTitle: '남은 번역권',
    liteCredits: '라이트 번역권',
    proCredits: '프로 번역권',
    unit: '회',
    // 무제한 계정은 잔액이 숫자로 의미가 없다 — UNLIMITED_CREDIT_DISPLAY(999)를
    // 그대로 보여주면 "999회 남음"이라는 거짓말이 된다. 칩(`COPY.nav.unlimited`)과
    // 같은 말을 쓴다.
    unlimitedTitle: '번역권',
    unlimited: '무제한',
    unlimitedUntil: (until: string) =>
      `${new Date(until).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}까지`,
    historyTitle: '번역 기록',
    retention: (days: number) => `완성된 자막은 ${days}일간 보관됩니다.`,
    download: '다시 받기',
    expired: '보관 기간 지남',
    empty: '아직 번역한 파일이 없습니다.',
    again: '새 파일 번역하기',
    signOut: '로그아웃',
    // 용어집은 적용됐을 때만 붙는다 — 켰지만 추출이 실패한 런에는 붙지 않는다.
    meta: (date: string, model: string, glossary: boolean) =>
      `${date} · ${model}${glossary ? ' · 용어집' : ''}`,
  },

  /**
   * 가격 안내(`/pricing`). 결제는 아직 `feature/payments`에 있으므로 이 화면은
   * **파는 화면이 아니라 알리는 화면**이다 — 버튼이 없고 `preparing` 한 줄이
   * 그 자리를 대신한다. 결제를 열 때 이 문구를 구매 CTA로 바꾼다.
   *
   * 티어 이름·설명은 `COPY.plans`를 그대로 쓴다. 여기 다시 적으면 랜딩·설정
   * 화면과 갈라진다.
   */
  pricing: {
    title: '가격',
    sub: '번역권을 미리 사고, 자막 1,200줄당 1장씩 씁니다. 유효기간은 없습니다.',
    creditUnit: (n: number) => `${n}장`,
    perCredit: (won: string) => `장당 ${won}원`,
    won: (won: string) => `${won}원`,
    preparing: '결제 준비 중입니다',
    preparingNote:
      '결제 오픈 전까지는 가입 시 드리는 무료 번역권으로 사용해보실 수 있습니다.',
    // 환불 규정은 약관 §번역권 구매와 취소·환불 하나만 둔다 — 여기 요약을
    // 따로 적으면 둘이 갈라지고, 갈라진 환불 규정은 분쟁에서 이용자에게
    // 유리한 쪽으로 읽힌다.
    refundLink: '취소·환불 규정 보기',
    vatNote: '모든 금액은 부가세 포함입니다.',
    /**
     * 인상 예고가 아니라 **인상해도 되는 자리를 미리 만드는 문구**다
     * (§6-23). 정식 오픈 전에 한 번 더 조정할 수 있다는 걸 지금 적어두는
     * 비용이 나중에 적는 비용보다 싸다 — 고객이 0명인 지금은 놀랄 사람이
     * 없다.
     *
     * ⚠️ **가짜 정가(취소선 원가 + 할인가)를 만들지 말 것.** 그 가격으로
     * 실제 판매한 이력이 없으면 표시광고법상 부당한 가격표시가 된다.
     * 현재 가격 하나만 적고 이 고지를 단다.
     */
    betaNote: '베타 기간 가격입니다. 정식 오픈 시 조정될 수 있습니다.',
    /**
     * 장당 가격 아래 병기하는 분당 환산 (§6-23). 번역권을 파는 단위(줄)와
     * 번역 견적의 관습 단위(분)를 잇는 자리다.
     *
     * 기준: 1장 = 1,200줄이고 자막 밀도가 분당 8.2~12.5줄이므로 1장은
     * 영상 96~146분을 덮는다. 병기하는 숫자는 **중앙값 약 120분** 하나만
     * 쓴다 — 범위를 본문에 넣으면 분당 단가도 범위가 돼 읽히지 않는다.
     * 범위는 `perMinuteBasis` 각주로 내린다.
     */
    perMinute: (won: number) => `영상 1분당 약 ${won.toLocaleString()}원`,
    perMinuteBasis:
      '번역권 1장(자막 1,200줄)이 영상 약 120분을 덮는 것으로 환산했습니다. 자막 밀도가 작품마다 달라 1장이 덮는 길이는 96~146분 사이에서 움직입니다.',
    /**
     * 앵커. **경쟁사 실명 비교표는 넣지 않는다** — 비교광고는 출처·기준시점
     * 표기 의무가 붙고 분쟁 소지가 있다(§6-23). 사람 번역 단가도 단정하지
     * 않고 범위로 적는다(§1-26에서 넷플릭스 규칙을 단정하지 않은 것과 같은
     * 방식이다): 공표된 고정 요율이 있는 시장이 아니라 건별 협상이다.
     */
    humanAnchor:
      '사람에게 직접 번역을 맡기면 통상 영상 1분당 수천 원대의 비용이 듭니다.',
    humanAnchorNote:
      '공표된 고정 요율이 있는 시장이 아니라 작업 조건에 따라 건별로 정해지므로, 실제 금액은 이와 다를 수 있습니다.',
  },

  // 지인용 비밀코드. 판정은 전부 서버에 있고 여기서는 세 가지 결말을 사람
  // 말로 바꾸기만 한다 — 실패 사유를 더 캐묻지 않는 것도 의도다(코드 존재
  // 여부를 알려주면 그게 열거 힌트가 된다).
  coupon: {
    title: '쿠폰 코드',
    placeholder: '받으신 코드를 입력하세요',
    submit: '등록',
    submitting: '확인 중…',
    ok: (until: string | null) =>
      until
        ? `등록됐습니다. ${new Date(until).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}까지 번역권 차감 없이 쓰실 수 있어요.`
        : '등록됐습니다.',
    alreadyRedeemed: '이미 사용하신 코드예요.',
    invalid: '사용할 수 없는 코드예요. 다시 확인해 주세요.',
    failed: '잠시 후 다시 시도해 주세요.',
  },

  footer: {
    feedback: '피드백 보내기',
    feedbackEmail: 'hello@mut36.com',
    /** 브랜드명(ZAMAK)과 상호(뭍36)를 잇는 문장 — PG 심사가 정확히 이 연결고리를
     *  못 찾아 한 번 반려됐다. 상호는 `COPY.seller.name`에서 받는다. */
    operatedBy: (name: string) => `ZAMAK은 ${name}이 운영하는 서비스입니다.`,
    tagline: '타임코드가 밀리지 않는 자막 번역기.',
    serviceGroup: '서비스',
    policyGroup: '정책',
    home: '홈',
    pricing: '가격',
    mypage: '마이페이지',
    // 브랜드명이 아니라 상호를 적는다 — 푸터에서 유일하게 ZAMAK만 보이던 줄이라
    // 상호와 어긋나 보였다(`SellerInfo` 주석 참고).
    copyright: (name: string) => `© 2026 ${name}. All rights reserved.`,
    eventBadge: (hasKakao: boolean) =>
      hasKakao
        ? '피드백 이벤트: 오픈카톡·이메일로 의견 주시면 번역권을 더 드려요.'
        : '피드백 이벤트: 이메일로 의견 주시면 번역권을 더 드려요.',
    kakaoLink: '오픈카톡 문의',
  },

  /**
   * 전자상거래법 제10조가 요구하는 판매자 표시. 푸터(모든 페이지)와 `/legal`의
   * 사업자 정보 표가 **같은 이 객체**를 읽는다 — 두 곳에 따로 적으면 한쪽만
   * 고쳐져 갈라진다. 홈페이지는 `SITE.url`, 고객문의는 `footer.feedbackEmail`을
   * 그대로 쓰므로 여기 중복해 두지 않는다.
   */
  seller: {
    name: '뭍36 (MUT36)',
    ceo: '이지안',
    bizNo: '224-23-65160',
    address: '서울특별시 여의대방로22길 24',
    tel: '010-5021-9836',
    // 면제는 조건부다 — 직전 연도 거래가 50회를 넘으면 신고 후 이 두 문구를
    // 실제 신고번호로 바꿔야 한다(`docs/TODO.md` 결제 오픈 항목).
    mailOrder: '신고 면제 (직전 연도 통신판매 거래 횟수 50회 미만)',
    mailOrderShort: '통신판매업 신고 면제',
    hosting: 'Vercel Inc.',
  },

  // 첫 번역 전에 한 번 받는 저작권 동의 모달. 닫기 없이 동의만 가능한
  // 필수 게이트라 취소 문구가 없다.
  /**
   * 첫 번역 앞에 서는 필수 게이트(`CopyrightModal`).
   *
   * **약관·개인정보처리방침 동의도 여기서 함께 받는다.** 원래 §1-11이 고른
   * 상시 고지 세 지점(드롭존 아래 / 가입 CTA 아래 / 푸터) 중 앞의 둘은
   * 2026-08-02 리디자인에서 화면을 정리하며 뺐다. 남은 푸터 링크만으로는
   * browsewrap이라 효력이 약한데, 이 모달은 (a) 체크 없이는 못 지나가는
   * clickwrap이고 (b) 동의 시점과 버전이 `copyright_consents`에 남는다 —
   * 뺀 두 지점보다 오히려 강한 증거다. 처리방침의 "공개" 의무 자체는 푸터
   * 링크가 계속 충족한다.
   *
   * 그래서 이 문구를 고치면 `COPYRIGHT_NOTICE_VERSION`(config/constants.ts)도
   * 같이 올려야 한다 — 옛 문구에 한 동의는 새 문구에 대한 동의가 아니고,
   * 버전이 존재하는 이유가 정확히 그것이다.
   */
  copyright: {
    title: '시작하기 전에',
    body:
      'ZAMAK은 이용자가 적법하게 보유한 자막 파일의 번역만 지원합니다. ' +
      '업로드하는 파일에 대한 권리와 책임은 이용자에게 있습니다.',
    /** 링크 문구는 `COPY.legal.terms`·`legal.privacy`를 그대로 쓴다 — 두 번
     *  적으면 한쪽만 고쳐져 갈라진다(푸터·`/legal`이 같은 규칙). */
    linksLabel: '전문 보기',
    checkbox: '이용약관·개인정보처리방침 및 위 저작권 안내에 동의합니다',
    agree: '동의하고 시작하기',
    failed: '동의 내역 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  },

  // 약관·처리방침 링크와 그 주변 마이크로카피. 본문 장문은 app/legal/*에
  // 인라인으로 둔다 — 조문은 재사용되지 않고, 한 곳에서 통으로 읽혀야 한다.
  legal: {
    terms: '이용약관',
    privacy: '개인정보처리방침',
    termsHref: '/legal',
    privacyHref: '/legal/privacy',
    backHome: '돌아가기',
    detail: '자세히',
    // 여기 있던 signup-wrap 문구(`consentPrefix`/`consentAnd`/`consentSuffix`)는
    // 2026-08-02에 지웠다. 랜딩의 가입 CTA 아래 노출 지점이 리디자인에서
    // 빠지면서 읽는 곳이 없어졌고, 그 동의는 `COPY.copyright`의 모달이
    // clickwrap으로 대신 받는다 — 그쪽 주석 참고.
  },

  notFound: {
    title: '페이지를 찾을 수 없습니다',
    body: '주소가 변경되었거나 존재하지 않는 페이지입니다.',
    home: '홈으로 가기',
  },

  error: {
    title: '문제가 발생했습니다',
    body: '일시적인 오류일 수 있습니다. 다시 시도해 주세요.',
    retry: '다시 시도',
    /**
     * 번역이 시작된 뒤 실패했을 때만 붙는다 — 그때는 잡이 이미 열려서
     * 번역권이 나갔는데 사용자는 파일을 못 받았다. 약관이 이미 번역권 복구를
     * 약속하고 있으므로(`app/legal/page.tsx`), 화면이 그걸 말하지 않는 쪽이
     * 오히려 앞뒤가 안 맞는다. 자동 환불은 베타 범위 밖이라 지금은 사람이
     * `supabase/comp-credit.sql`로 처리한다.
     */
    creditNote: '번역권은 복구해 드립니다. 아래 주소로 알려주세요 —',
    /**
     * 429 응답 본문에 담기는 문구(`app/lib/server/rateLimit.ts`). 서버 문자열이지만
     * 화면이 그대로 받아 보여주므로 하드코딩하지 않고 여기 둔다.
     *
     * 번역권과 무관하다는 걸 굳이 말하는 이유: 사용자가 이 문구를 볼 만한
     * 유일한 경로는 업로드 직후 메타데이터 단계이고, 그 단계는 크레딧을 쓰지
     * 않는다(`/api/analyze`·`/api/enrich`·`/api/summarize`). 안 그러면
     * "거절당했는데 번역권이 나갔나?"를 문의로 받게 된다.
     */
    rateLimited: (seconds: number) =>
      `요청이 너무 잦습니다. ${seconds}초 뒤에 다시 시도해 주세요. 번역권은 사용되지 않았습니다.`,
  },
} as const;

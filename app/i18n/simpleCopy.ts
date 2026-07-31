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
    history: '내 번역',
    credits: (lite: number, pro: number) => `라이트 ${lite} · 프로 ${pro}`,
    signOut: '로그아웃',
  },

  auth: {
    signIn: 'Google로 계속하기',
    signingIn: '로그인 중…',
    gateNote: '로그인은 번역권을 지급하고 사용량을 확인하는 데만 쓰여요.',
    signOut: '로그아웃',
    loading: '불러오는 중…',
    failed: '로그인에 실패했어요. 다시 시도해주세요.',
    notConfigured:
      '로그인이 아직 설정되지 않았어요. 서버 환경 변수를 확인해주세요.',
    /** Header chip. */
    creditsLeft: (n: number) => `번역권 ${n}편`,
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
      compare: '번역 비교',
      speed: '속도',
      cps: '자막 규칙',
    },

    hero: {
      title: '번역기 티가 안 나는\n한국어 자막',
      sub: '자막 파일을 올리면 한글 자막 표준 규칙에 맞춘 자연스러운 번역이 10초 안에 내려옵니다.',
      secondaryCta: '번역 품질 비교하기',
      note: '실제 번역 결과 예시. 타임코드는 원본 그대로 유지됩니다.',
      demoLabel: '번역 결과 예시',
      pairs: [
        {
          lang: 'EN',
          tc: '00:41:07,220',
          src: '"You’re telling me she just walked out? In the middle of the ceremony?"',
          ko: '식 도중에 그냥 나가 버렸다고?',
        },
        {
          lang: 'JA',
          tc: '00:12:44,050',
          src: '「そんなつもりじゃなかったんだ。信じてくれ。」',
          ko: '그럴 생각은 없었어. 믿어 줘',
        },
        {
          lang: 'EN',
          tc: '01:03:18,900',
          src: '"Don’t you dare walk away from me right now."',
          ko: '지금 나한테서 등 돌릴 생각 하지 마',
        },
        {
          lang: 'FR',
          tc: '00:27:55,410',
          src: '« On ne voit bien qu’avec le cœur. »',
          ko: '마음으로 봐야 제대로 보이는 법이야',
        },
      ],
    },

    compare: {
      title: '같은 대사, 다른 번역.',
      sub: '직접 비교해 보세요. 자막은 읽는 글이 아니라 듣는 말입니다.',
      tablistLabel: '번역 엔진 선택',
      sourceLabel: '원문 대사',
      sourceLine:
        '"You’re telling me she just walked out? In the middle of the ceremony?"',
      sourceMeta: '00:41:07,220 → 00:41:09,850 · 2.6초 노출',
      resultLabel: (engine: string) => `${engine}의 번역`,
      outro:
        'ZAMAK은 문장을 옮기지 않고 장면을 옮깁니다. 화면에 떠 있는 시간 안에 읽히도록, 말투와 관계까지 그대로.',
      engines: [
        {
          name: '일반 번역기',
          out: '"당신은 그녀가 그냥 걸어 나갔다고 나에게 말하고 있는 건가요? 의식 한가운데에서?"',
          tags: [
            { label: 'CPS 17.3 초과', tone: 'red' },
            { label: '어색한 직역', tone: 'red' },
            { label: '말투 불일치', tone: 'red' },
          ],
        },
        {
          name: '범용 AI 모델',
          out: '"그녀가 식 중간에 그냥 나가버렸다고 말하는 거야?"',
          tags: [
            { label: '문장은 자연스러움', tone: 'neutral' },
            { label: 'CPS 9.6 아슬아슬', tone: 'orange' },
            { label: '자막 규칙 미적용', tone: 'orange' },
          ],
        },
        {
          name: 'ZAMAK',
          out: '"식 도중에 그냥 나가 버렸다고?"',
          tags: [
            { label: 'CPS 6.2 충족', tone: 'green' },
            { label: '표준 규칙 적용', tone: 'green' },
            { label: '반문 뉘앙스 유지', tone: 'green' },
          ],
        },
      ],
    },

    speed: {
      titleTop: '업로드에서 다운로드까지,',
      titleAccent: '최고 속도 10초.',
      body: '영상 파일은 필요 없습니다. 자막 파일 하나만 올리면 언어 인식부터 규칙 적용, 최종 파일 생성까지 한 번에 끝납니다.',
      steps: [
        {
          time: '0:00',
          title: '자막 파일 업로드',
          desc: '.srt .vtt .ass .smi, 무엇이든. 조잡한 자동 자막도 괜찮습니다.',
        },
        {
          time: '0:01',
          title: '언어 · 작품 자동 인식',
          desc: '원본 언어를 감지하고 영상 종류에 맞는 번역 프로필을 고릅니다.',
        },
        {
          time: '0:03',
          title: '번역 + 규칙 적용',
          desc: '자연스러운 한국어로 옮기며 CPS와 표준 자막 규칙을 동시에 맞춥니다.',
        },
        {
          time: '0:10',
          title: '완성 파일 다운로드',
          desc: '타임코드와 스타일은 원본 그대로. 바로 영상에 얹으면 됩니다.',
        },
      ],
    },

    cps: {
      title: '영상마다 읽는 속도가 다릅니다.',
      sub: 'ZAMAK은 CPS(초당 글자 수)를 계산해 영상 종류에 맞는 자막 길이를 자동으로 맞춥니다. 화면에 뜬 시간 안에 다 읽히도록.',
      tablistLabel: '영상 종류 선택',
      speedLabel: '권장 읽기 속도',
      unit: 'CPS',
      lineLenLabel: '한 줄 최대',
      lineCountLabel: '줄 수',
      lineCountValue: '최대 2줄',
      actionLabel: 'ZAMAK이 하는 일',
      profiles: [
        {
          name: '영화 · 드라마',
          value: '12',
          lineLen: '18자',
          action: '긴 대사는 두 줄로 분할, 조사 단위로 줄바꿈',
          lines: ['식 도중에 그냥', '나가 버렸다고?'],
          tc: '00:41:07 → 00:41:09',
          measured: 'CPS 6.2 ✓',
        },
        {
          name: '예능 · 유튜브',
          value: '14',
          lineLen: '20자',
          action: '빠른 티키타카에 맞춰 짧고 리듬감 있게 압축',
          lines: ['아니 진짜 중간에 나갔다고?'],
          tc: '00:03:12 → 00:03:13',
          measured: 'CPS 13.0 ✓',
        },
        {
          name: '다큐 · 강연',
          value: '10',
          lineLen: '16자',
          action: '정보 밀도가 높은 문장은 노출 시간에 맞춰 요약',
          lines: ['그녀는 예식 도중', '자리를 떠났습니다'],
          tc: '00:18:40 → 00:18:44',
          measured: 'CPS 4.3 ✓',
        },
      ],
    },

    features: {
      title: '전문 자막가의 규칙을\n그대로 배웠습니다.',
      rules: {
        title: '한글 자막 표준 규칙 적용',
        body: '방송·OTT에서 쓰는 표기 규칙을 그대로 따릅니다. 문장부호, 숫자 표기, 말줄임, 두 줄 분할까지 감수 없이 바로 쓸 수 있는 상태로.',
        rows: [
          { before: '3천만 달러라구요?!', after: '3,000만 달러라고요?' },
          { before: '오 마이 갓...!!', after: '세상에…' },
          {
            before: '한 줄에 스물여덟 글자가 넘어가는 긴 자막',
            after: '두 줄로 자연스럽게 분할',
          },
        ],
      },
      formats: {
        title: '모든 자막 포맷 지원',
        body: '스타일과 타임코드는 손대지 않고 대사만 바꿉니다. 올린 포맷 그대로 내려받으세요.',
        chips: ['.srt', '.vtt', '.ass', '.smi'],
      },
      languages: {
        title: '모든 언어 → 한국어',
        body: '원본 언어는 자동으로 인식합니다. 영어, 일본어, 중국어부터 스페인어, 프랑스어까지, 어떤 언어든 한국어로.',
        codes: 'EN JA ZH ES FR DE + 90개 언어',
      },
    },

    final: {
      title: '자막 하나 올려 보면\n바로 알게 됩니다.',
      sub: '가입 후 첫 파일은 무료입니다. 신용카드도 필요 없어요.',
      badge: '비공개 베타 운영 중',
    },
  },

  credits: {
    tooLargeTitle: '파일이 너무 커요',
    tooLargeBody: (max: number, actual: number) =>
      `번역권 1편은 자막 ${max.toLocaleString()}줄까지 커버해요. 이 파일은 ${actual.toLocaleString()}줄이에요.`,
    startOver: '다른 파일 올리기',
  },

  // 번역권 소진 화면 (insufficient_credits). 베타에는 결제창이 없으니 막다른
  // 골목 대신 결제 오픈 대기자 등록을 둔다.
  exhausted: {
    title: (kind: string) => `${kind} 번역권을 모두 썼어요`,
    kindLite: '라이트',
    kindPro: '프로',
    body: '결제 기능을 준비하고 있어요.\n준비되면 가장 먼저 알려드릴게요. 파일은 안전하게 보관됩니다.',
    waitlistLabel: '결제 오픈 대기자 등록',
    emailPlaceholder: '이메일 주소',
    join: '등록',
    joined: '대기자로 등록됐어요. 오픈하면 바로 메일을 드릴게요.',
    joinFailed: '등록하지 못했어요. 이메일을 확인해 주세요.',
    goHistory: '지난 번역 다시 받기',
    back: '설정으로 돌아가기',
  },

  // Prepaid credit packs. The anchor is deliberately the human-translator price
  // (~150,000원/편), not our cost — see docs/decisions.md.
  purchase: {
    title: '번역권 충전',
    subtitle: '사람에게 맡기면 편당 15만 원. 번역권은 유효기간이 없어요.',
    creditsUnit: (n: number) => `번역권 ${n}편`,
    price: (won: number) => `${won.toLocaleString()}원`,
    perCredit: (won: number) => `편당 ${won.toLocaleString()}원`,
    coverage: (max: number) => `1편 = 자막 ${max.toLocaleString()}줄까지`,
    cta: '결제하기',
    opening: '결제창을 여는 중…',
    close: '돌아가기',
    balance: (n: number) => `현재 번역권 ${n}편`,
    notice: [
      '카드·간편결제로 결제돼요. 결제는 토스페이먼츠가 처리해요.',
      '번역권은 유효기간이 없고, 사용하지 않은 번역권은 환불할 수 있어요.',
    ],
    terms: '환불 · 이용 안내',
    done: (n: number) => `번역권 ${n}편이 충전됐어요!`,
    // Toss error codes are opaque to buyers; only the cause that they can act
    // on is worth naming, and everything else gets one honest sentence.
    failed: '결제가 완료되지 않았어요. 다시 시도해주세요.',
    canceled: '결제를 취소했어요.',
    failedCode: (code: string) => `오류 코드: ${code}`,
    // Payments are dark until the Toss merchant review clears (weeks away,
    // not a retry-in-a-bit situation), so this points at the manual top-up
    // path instead of implying the button will just work again soon.
    notConfigured:
      '결제가 아직 준비 중이에요. hello@mut36.com으로 알려주시면 번역권을 넣어드릴게요.',
  },

  upload: {
    title: '파일 업로드',
    subtitle: '타임코드는 그대로, 대사만 자연스러운 한국어로 옮겨 드립니다.',
    kindLabel: '콘텐츠 유형',
    kindMovie: '영화 · 드라마',
    kindMovieSub: '작품을 찾아 시대·말투까지 맞춰요',
    kindOther: '유튜브 · 일반 영상',
    kindOtherSub: '원하는 톤앤매너를 직접 지정해요',
    dropTitle: '자막 파일을 여기에 놓으세요',
    dropFormats: '.srt .vtt .ass .smi - 원본 언어 자동 인식',
    dropButton: '파일 선택',
    dropLocked: '먼저 콘텐츠 유형을 선택하세요',
    readingTitle: (name: string) => `${name} 읽는 중…`,
    readingSub: '타임코드를 확인하고 작품을 찾고 있어요',
    noVideoNeeded:
      '영상 파일은 필요하지 않아요. 조잡한 자동 자막도 괜찮습니다.',
    // LanguageSelect.tsx는 이 화면에서 더 이상 호출되지 않지만 컴포넌트 자체는
    // 확장 대비로 남아 있고, 그 컴포넌트가 이 두 키를 여전히 읽는다.
    langLabel: '어떤 언어로 바꿔드릴까요?',
    comingSoon: '곧 지원',
    invalidFile: 'SRT, VTT, SMI, ASS 파일만 올릴 수 있어요.',
    unreadableFile:
      '자막을 읽지 못했어요. 파일이 손상되지 않았는지 확인하고 다시 올려주세요.',
    // 두 언어가 한 파일에 든 SMI는 큐마다 어느 쪽을 번역할지 정할 수 없어,
    // 섞인 결과를 내놓느니 여기서 돌려보낸다. 트랙 선택 UI는 docs/TODO.md.
    bilingualSmi:
      '두 개 언어가 함께 담긴 SMI 파일이에요. 아직 지원하지 않아요 — 한 언어만 담긴 파일로 올려주세요.',
    // 업로드가 저작권 리스크가 실제로 발생하는 시점이라 여기에 상시 노출한다
    // (decisions.md §1-11의 세 지점 중 첫 번째). 첫 번역 앞의 동의 모달(§5-7)은
    // 이 문구를 대체하지 않고 위에 얹힌다.
    rightsNotice: '권리가 있는 자막만 올려주세요.',
    // 반드시 '원본'으로 한정할 것 — 완성된 결과물은 30일간 보관한다
    // (mypage.retention). 여기서 "파일"이라고 뭉뚱그리면 그 안내와 충돌한다.
    storageNotice: '올리신 원본은 서버에 저장하지 않아요.',
  },

  info: {
    // movie branch
    movieTitle: '이 작품이 맞나요?',
    movieSubtitle: 'AI가 파일을 분석했어요. 맞으면 그대로, 틀리면 고쳐주세요.',
    analyzing: '파일을 분석하고 있어요…',
    searching: '작품 정보를 검색하고 있어요…',
    detectedBadge: 'AI가 자동으로 찾았어요',
    notFoundBadge: '자동으로 못 찾았어요',
    posterAlt: (title: string) => `${title} 포스터`,
    posterEmpty: '포스터 없음',
    // Shown when TMDB has several equally-plausible matches (common title,
    // remake) and there's no reason to auto-pick one.
    ambiguousHint: '검색 결과가 여러 개예요. 찾으시는 작품을 골라주세요.',
    mediaTypeMovie: '영화',
    mediaTypeTv: '드라마',
    labelTitle: '제목',
    labelYear: '개봉 연도',
    labelDirector: '감독',
    edit: '수정',
    research: '다시 검색',
    cancel: '취소',
    notFoundHint: '제목과 연도를 입력하면 다시 검색해볼게요.',
    // Shown when the search failed outright, rather than simply finding
    // nothing. The raw server message follows so the cause is visible instead
    // of hiding behind "자동으로 못 찾았어요".
    enrichFailed: '작품 정보 검색에 실패했어요.',
    // AI-derived keyword fields fed into the translation prompt. Editable so
    // a wrong AI guess can be corrected before translating.
    aiInfoHint:
      'AI가 자동으로 채운 정보예요. 번역 톤을 잡는 데 쓰이니, 틀리면 고쳐주세요.',
    genreLabel: '장르',
    eraLabel: '배경/시대',
    toneLabel: '톤앤매너',
    notesLabel: '참고할 내용',
    notesHint: '번역에 참고할 내용을 자유롭게 적어주세요.',
    // other branch
    otherTitle: '어떤 영상인가요?',
    otherSubtitle: '앞부분을 읽고 내용을 요약했어요. 번역 맥락으로 쓰여요.',
    summarizing: '내용을 요약하고 있어요…',
    summaryBadge: 'AI가 앞부분을 읽고 정리했어요',
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
      badge: '고급',
      hint: '이름·지명 표기와 말투를 파일 전체에서 통일해요. 준비에 20~40초 걸려요.',
      extracting: '분석하고 있어요…',
      count: (n: number) => `${n}개`,
      tabTerms: '표기',
      tabRelations: '말투',
      termSourceLabel: '원문',
      /** Doubles as the placeholder, so it names the actual target language. */
      termTargetLabel: (language: string) => `${language} 표기`,
      addTerm: '+ 새 항목',
      removeRow: '삭제',
      emptyTerms: '표기 항목이 없어요. 직접 추가할 수 있어요.',
      emptyRelations: '아직 파악된 말투 관계가 없어요.',
      /** Shown when the target language has no formality axis (영어·중국어). */
      noFormality: (language: string) =>
        `${language}에는 존댓말/반말 같은 말투 구분이 없어서, 표기만 통일해요.`,
      relationRange: (from: number, to: number) => `${from}~${to}번 구간`,
      refetch: '다시 추출',
    },
  },

  settings: {
    title: '번역 설정',
    subtitleAuto: '원본 언어 자동 인식 → 한국어',
    confirmBadge: '확인 필요',
    confirmQuestion: (work: string) => `'${work}'(으)로 인식했어요. 맞나요?`,
    confirmHint: '아니라면 다시 골라 주세요',
    confirmYes: '맞아요',
    confirmNo: '아니에요',
    changeWork: '작품 변경',
    eraLabel: '시대 · 배경',
    eraPlaceholder: '예: 1920년대 아일랜드 해안, 고립된 등대',
    toneLabel: '톤앤매너',
    tonePlaceholder: '예: 고전적이고 절제된 어투, 심리극',
    contextEditable: '(수정 가능)',
    contextHint: '번역에 그대로 반영돼요. 비워 두면 자막만 보고 판단해요.',
    // Section labels above each group of settings (design_handoff_zamak_brand).
    sectionWork: '작품 정보',
    sectionQuality: '번역 품질',
    sectionAdvanced: '세부 조정 (선택)',
    liteName: '라이트',
    liteDesc: '빠르고 정확한 기본 번역.',
    // Second line of the lite card — the speed promise the handoff leads with.
    liteDescSpeed: '10초면 다운로드까지 끝나요.',
    proName: '프로',
    proDesc: '작품 맥락 분석과 인물명 일관성. 후편집 시간을 줄이는 초벌 번역.',
    // "무료" is load-bearing for the beta: the credits are a gift, not a
    // purchase. Revisit this wording when paid credits ship.
    creditsLeft: (n: number) => `무료 ${n}회 남음`,
    glossaryTitle: '용어집 · 말투 설정',
    glossaryBadge: '고급',
    glossaryDesc:
      '인물명 표기를 고정하고 인물 간 존대·반말을 지정해요. 약 20초 더 걸려요.',
    eta: (sec: number) => `예상 소요 약 ${sec}초`,
    start: '번역 시작',
  },

  workPick: {
    sourceLangBadge: '원본 언어: 자동 인식',
    title: '어떤 작품인가요?',
    subtitle: '작품을 골라 주시면 시대배경과 말투까지 조율해 번역해요.',
    posterEmpty: 'poster',
    kindMovie: '영화',
    kindTv: '드라마',
    searchOpen: '찾는 작품이 없어요',
    searchClose: '검색 닫기',
    searchPlaceholder: '작품 제목을 검색하세요',
    // enrich()는 제목+연도만 받는다. 감독으로 찾아준다고 쓰면 못 지키는 약속이 된다.
    searchHint: '제목으로 다시 찾아 드려요. 못 찾아도 번역은 계속할 수 있어요.',
    confirm: '이 작품으로 계속',
    otherTypeLabel: '콘텐츠 유형',
    otherTypes: ['유튜브', '강연·인터뷰', '브이로그', '기타'],
    toneLabel: '원하는 톤앤매너',
    tonePlaceholder: '예: 친근한 반말, 유튜브 예능 자막처럼 리듬감 있게',
  },

  progress: {
    label: '번역 중',
    analyzing: '파일을 분석하고 있어요',
    translating: '열심히 번역하고 있어요',
    recovering: '빠진 줄을 다시 번역하고 있어요',
    finalizing: '마지막으로 다듬는 중이에요',
    recentLabel: '방금 번역한 대사',
    remaining: (lines: number, total: number, sec: number) =>
      `${lines.toLocaleString()} / ${total.toLocaleString()}줄 · 약 ${sec}초 남음`,
    // Sweep readout. The ring is already pinned at its ceiling by the time the
    // sweep runs, so this line is the only thing that can show it progressing.
    recoveringDetail: (recovered: number, remaining: number) =>
      `${recovered.toLocaleString()}줄 복구 · ${remaining.toLocaleString()}줄 남음`,
    reassure: '번역이 끝날 때까지 이 창을 열어두세요.',
    cancel: '취소',
    cancelConfirm: '번역을 취소할까요?',
    stages: {
      context: '자막 맥락을 분석하는 중',
      glossary: '인물과 용어를 정리하는 중',
      translate: '자막을 번역하는 중',
      verify: '타임코드를 검증하는 중',
    },
    stageSkipped: '건너뜀',
    pct: (pct: number, sec: number) =>
      `${String(Math.floor(pct)).padStart(2, '0')}% · 약 ${sec}초 남음`,
    keepOpen: '창을 닫아도 번역은 계속돼요',
  },

  // Failure strings for the translation run. useTranslation takes these as a
  // parameter rather than importing COPY, so the hook stays locale-agnostic —
  // but this is the only place they are actually written.
  translateErrors: {
    serverError: (status: number) => `서버에 문제가 생겼어요. (오류 ${status})`,
    noResponse: '번역 결과를 받지 못했어요. 다시 시도해주세요.',
    emptyFile: '자막 블록을 찾지 못했어요. 올바른 자막 파일인지 확인해주세요.',
    generalError: '번역 중 문제가 생겼어요. 다시 시도해주세요.',
  },

  done: {
    title: '번역이 완료됐어요!',
    subtitle: (lines: number, time: string) =>
      `${lines.toLocaleString()}줄을 ${time} 만에 번역했어요. 자막 번호에 맞춰 다시 결합했어요.`,
    download: '번역 자막 다운로드',
    // 올린 형식 그대로 받을 수 있을 때만 두 버튼이 뜬다. 첫 버튼이 원본 형식,
    // 두 번째가 어떤 파일이든 항상 가능한 SRT.
    downloadAs: (extension: string) => `.${extension}로 다운로드`,
    downloadAsHint: (extension: string) =>
      `올린 형식 그대로 받아요. 자막 스타일·설정은 원본을 유지하고 대사만 바뀌어요. (.${extension})`,
    startOver: '새 파일 번역하기',
    goHistory: '내 번역 보기',
    // 실제로 무엇을 했는지 적는 리포트 카드. buildReport()가 실측한 항목만
    // 골라내고, 여기 함수들이 그 값을 문장으로 만든다 — 계측하지 않은
    // "CPS 조정 23곳" 같은 줄은 buildReport 쪽에서부터 아예 나오지 않는다.
    reportTitle: '이 번역에 실제로 적용된 것',
    report: {
      timecode: (lines: number, fallback: number) =>
        fallback === 0
          ? `타임코드 ${lines.toLocaleString()}개를 검증했어요. 원문 그대로 남은 구간은 0줄입니다`
          : `타임코드 ${lines.toLocaleString()}개를 검증했어요. 원문 그대로 남은 구간은 ${fallback}줄입니다`,
      context: (context: string) =>
        `작품 맥락(${context})에 맞춰 어휘와 문체를 골랐어요`,
      glossary: (terms: number) =>
        `용어집 ${terms}개 표기를 자막 전체에 일관되게 적용했어요`,
      relations: (pairs: number) =>
        `설정한 존대·반말 관계 ${pairs}쌍을 대화 전체에 반영했어요`,
    },
    feedbackTitle: '이번 번역, 어땠나요?',
    feedbackPlaceholder: '자유롭게 남겨주세요 (선택)',
    feedbackSend: '보내기',
    feedbackThanks: '의견 감사해요. 베타를 다듬는 데 큰 힘이 됩니다.',
    feedbackFailed: '의견을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    // Lines still holding their original text in the downloaded file, after
    // the recovery sweep has already retried them. Counted per line, not per
    // chunk: the sweep works block by block, so "구간 2개 실패" would describe
    // a mid-translation state the user never receives.
    partialWarning: (remainingLines: number) =>
      `자막 ${remainingLines.toLocaleString()}줄은 다시 시도해도 번역되지 않아 원문 그대로 남아 있어요. 해당 줄만 직접 손봐주세요.`,
    stopReason: {
      quota:
        'API 사용 한도를 초과해 번역을 도중에 멈췄어요. 여기까지는 저장됐고, 나머지는 원문 그대로예요.',
      auth: '인증에 문제가 생겨 번역을 도중에 멈췄어요. 여기까지는 저장됐고, 나머지는 원문 그대로예요. 다시 로그인한 뒤 새로 시도해주세요.',
    },
  },

  // 내 번역(/mypage) — 번역권 잔여 + 지난 번역 기록.
  mypage: {
    title: '내 번역',
    creditsTitle: '남은 번역권',
    liteCredits: '라이트 번역권',
    proCredits: '프로 번역권',
    unit: '회',
    historyTitle: '번역 기록',
    retention: (days: number) => `완성된 자막은 ${days}일간 보관해요.`,
    download: '다시 받기',
    expired: '보관 기간 지남',
    empty: '아직 번역한 파일이 없어요.',
    again: '새 파일 번역하기',
    // 용어집은 적용됐을 때만 붙는다 — 켰지만 추출이 실패한 런에는 붙지 않는다.
    meta: (date: string, model: string, glossary: boolean) =>
      `${date} · ${model}${glossary ? ' · 용어집' : ''}`,
  },

  footer: {
    feedback: '피드백 보내기',
    feedbackEmail: 'hello@mut36.com',
    tagline: '타임코드가 밀리지 않는 자막 번역기.',
    serviceGroup: '서비스',
    policyGroup: '정책',
    home: '홈',
    mypage: '마이페이지',
    copyright: '© 2026 ZAMAK. All rights reserved.',
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
    tel: '010-7927-9836',
    // 면제는 조건부다 — 직전 연도 거래가 50회를 넘으면 신고 후 이 두 문구를
    // 실제 신고번호로 바꿔야 한다(`docs/TODO.md` 결제 오픈 항목).
    mailOrder: '신고 면제 (직전 연도 통신판매 거래 횟수 50회 미만)',
    mailOrderShort: '통신판매업 신고 면제',
    hosting: 'Vercel Inc.',
    pg: '토스페이먼츠(주)',
  },

  // 첫 번역 전에 한 번 받는 저작권 동의 모달. 닫기 없이 동의만 가능한
  // 필수 게이트라 취소 문구가 없다.
  copyright: {
    title: '시작하기 전에',
    body:
      'ZAMAK은 이용자가 적법하게 보유한 자막 파일의 번역만 지원해요. ' +
      '업로드하는 파일에 대한 권리와 책임은 이용자에게 있습니다.',
    checkbox: '저작권 안내를 확인했고, 이에 동의합니다',
    agree: '동의하고 시작하기',
    failed: '동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
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
    // signup-wrap. 별도 체크박스보다 마찰이 적으면서, 가입이라는 능동적
    // 행위에 결합되어 있어 단순 푸터 링크(browsewrap)보다 효력이 안정적이다.
    consentPrefix: '계속하면 ',
    consentAnd: ' 및 ',
    consentSuffix: '에 동의하는 것으로 봅니다.',
  },

  notFound: {
    title: '페이지를 찾을 수 없어요',
    body: '주소가 바뀌었거나 존재하지 않는 페이지예요.',
    home: '홈으로 가기',
  },

  error: {
    title: '문제가 생겼어요',
    body: '일시적인 오류일 수 있어요. 다시 시도해주세요.',
    retry: '다시 시도',
  },
} as const;

// Korean-first conversational copy for the Simple flow.
// Centralized so a second locale can be layered on later.

export const COPY = {
  brand: 'ZAMAK',
  langPill: '한국어',

  steps: ['파일', '정보', '번역', '완료'],

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

  landing: {
    /** Typed out one character at a time on mount. */
    wordmark: 'ZAMAK',
    tagline: '자막 파일 하나로, 자연스러운 한국어 자막을.',
    taglineSub: '타임코드는 그대로 지켜 드립니다.',
    signIn: 'Google로 계속하기',
    badge: '비공개 베타',
    notConfigured: '로그인이 아직 설정되지 않았어요.',
  },

  credits: {
    emptyTitle: '번역권을 모두 사용했어요',
    // 베타 한시적: 3편. 정식 오픈 시 1편으로 되돌릴 것 (docs/decisions.md 2026-07-27).
    emptyBody:
      '무료로 드린 3편을 다 쓰셨어요. 번역권을 충전하면 이어서 번역할 수 있어요.',
    emptyCta: '번역권 충전하기',
    tooLargeTitle: '파일이 너무 커요',
    tooLargeBody: (max: number, actual: number) =>
      `번역권 1편은 자막 ${max.toLocaleString()}줄까지 커버해요. 이 파일은 ${actual.toLocaleString()}줄이에요.`,
    startOver: '다른 파일 올리기',
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
    kindOther: '유튜브 · 일반 영상',
    dropTitle: '자막 파일을 여기에 놓으세요',
    dropFormats: '.srt .vtt .ass .smi · 원본 언어 자동 인식',
    dropButton: '파일 선택',
    dropLocked: '먼저 콘텐츠 유형을 선택하세요',
    readingTitle: (name: string) => `${name} 읽는 중…`,
    readingSub: '타임코드를 확인하고 작품을 찾고 있어요',
    noVideoNeeded: '영상 파일은 필요하지 않아요. 조잡한 자동 자막도 괜찮습니다.',
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
    // 업로드가 저작권 리스크가 실제로 발생하는 시점이라, 동의 모달 대신 여기에
    // 상시 노출한다. 모달은 "30초면 번역돼요"라는 제품 약속과 정면으로 충돌한다.
    rightsNotice: '권리가 있는 자막만 올려주세요.',
    storageNotice: '파일은 서버에 저장하지 않아요.',
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
    aiInfoHint: 'AI가 자동으로 채운 정보예요. 번역 톤을 잡는 데 쓰이니, 틀리면 고쳐주세요.',
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
    otherNotesHint: '말투(존댓말/반말), 전문 용어 표기 등 참고할 내용을 적어주세요.',
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
    summaryLines: '번역된 줄',
    summaryTime: '걸린 시간',
    summaryTimecodeValue: '번호 매칭',
    summaryTimecode: '타임코드 처리',
    previewTitle: '번역 미리보기',
    startOver: '새 파일 번역하기',
    // Lines still holding their original text in the downloaded file, after
    // the recovery sweep has already retried them. Counted per line, not per
    // chunk: the sweep works block by block, so "구간 2개 실패" would describe
    // a mid-translation state the user never receives.
    partialWarning: (remainingLines: number) =>
      `자막 ${remainingLines.toLocaleString()}줄은 다시 시도해도 번역되지 않아 원문 그대로 남아 있어요. 해당 줄만 직접 손봐주세요.`,
    stopReason: {
      quota:
        'API 사용 한도를 초과해 번역을 도중에 멈췄어요. 여기까지는 저장됐고, 나머지는 원문 그대로예요.',
      auth:
        '인증에 문제가 생겨 번역을 도중에 멈췄어요. 여기까지는 저장됐고, 나머지는 원문 그대로예요. 다시 로그인한 뒤 새로 시도해주세요.',
    },
  },

  footer: {
    feedback: '피드백 보내기',
    feedbackEmail: 'hello@mut36.com',
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

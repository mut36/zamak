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

  // Anonymous landing. Static content only — proving product value in front
  // of the sign-in wall costs zero API calls. Two claims carry the page:
  // timecode integrity and work-context-aware tone.
  landing: {
    hero: {
      title: 'SRT 자막, 2분이면 번역돼요',
      subtitle:
        '타임코드는 100% 그대로. 작품의 톤과 인물의 말투까지 반영해요.',
      cta: 'Google로 무료 시작하기',
      ctaHint: '가입 즉시 번역권 1편 무료 · 카드 등록 없음',
    },
    sample: {
      title: '결과물로 보여드릴게요',
      subtitle:
        '자체 제작 예문이에요. 형사물에서 선배와 신입이 나누는 대화로, 타임코드와 말투를 눈으로 확인하세요.',
      srcLabel: '원본 SRT',
      dstLabel: 'ZAMAK 번역',
      blocks: [
        {
          no: '24',
          tc: '00:12:07,332 --> 00:12:09,150',
          src: 'You called it in yet?',
          dst: '보고는 올렸어?',
        },
        {
          no: '25',
          tc: '00:12:09,433 --> 00:12:11,900',
          src: 'Not yet. I thought you should see it first.',
          dst: '아직입니다. 선배가 먼저 보셔야 할 것 같아서요.',
        },
        {
          no: '26',
          tc: '00:12:12,410 --> 00:12:15,224',
          src: 'Good call. This stays between us for now.',
          dst: '잘 판단했어. 당분간 우리끼리만 알고 있자.',
        },
      ],
      points: [
        {
          title: '타임코드가 한 글자도 안 달라져요',
          body: '타임코드는 AI가 아니라 코드가 관리해요. AI가 줄을 합치거나 빠뜨려도 이후 자막이 밀리는 일은 구조적으로 일어나지 않아요.',
        },
        {
          title: '누가 누구에게 말하는지 알아요',
          body: '작품 정보를 검색해 인물 관계와 말투 지침을 만들어요. 선배는 반말, 신입은 존댓말 — 문장마다 흔들리지 않아요.',
        },
      ],
    },
    how: {
      title: '쓰는 법은 세 단계예요',
      steps: [
        { title: '업로드', body: '.srt 파일을 끌어다 놓아요.' },
        { title: '확인', body: 'AI가 찾은 작품 정보를 확인하고 시작을 눌러요.' },
        { title: '다운로드', body: '평균 2분 뒤, 번역된 .srt를 받아요.' },
      ],
    },
    closing: {
      title: '첫 한 편은 무료예요',
      body: '로그인하면 번역권 1편을 바로 드려요 — 영화 한 편이 통째로 들어가는 분량이에요. 사람에게 맡기면 편당 15만 원. 먼저 결과물로 판단하세요.',
    },
    footerNote: '자막 번역 도구',
  },

  credits: {
    emptyTitle: '번역권을 모두 사용했어요',
    emptyBody:
      '무료로 드린 1편을 다 쓰셨어요. 번역권을 충전하면 이어서 번역할 수 있어요.',
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
    title: '자막을 올려주세요',
    subtitle: '한 번의 업로드로 끝. 평균 2분이면 자연스러운 번역 자막을 받아요.',
    dropTitle: '파일을 여기에 끌어다 놓으세요',
    dropOr: '또는',
    browse: '파일 선택',
    formats: 'SRT 파일 · 최대 5MB',
    langLabel: '어떤 언어로 바꿔드릴까요?',
    langDetect: '언어 감지',
    comingSoon: '곧 지원',
    typeLabel: '무엇을 번역하나요?',
    typeMovie: '영화 · 드라마',
    typeOther: '기타 영상',
    typeOtherHint: '유튜브 · 인터뷰 · 강연 등',
    reassure: ['평균 2분 소요', '타임코드 100% 보존', '설치 없이 바로'],
    invalidFile: 'SRT 파일만 올릴 수 있어요.',
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
    notesLabel: '참고할 내용',
    notesHint: '번역에 반영할 톤·인물 말투 지침이에요. 자유롭게 다듬어도 좋아요.',
    // other branch
    otherTitle: '어떤 영상인가요?',
    otherSubtitle: '앞부분을 읽고 내용을 요약했어요. 번역 맥락으로 쓰여요.',
    summarizing: '내용을 요약하고 있어요…',
    summaryBadge: 'AI가 앞부분을 읽고 정리했어요',
    otherNotesLabel: '참고할 내용 · 선택',
    otherNotesHint: '말투(존댓말/반말), 전문 용어 표기 등 참고할 내용을 적어주세요.',
    // shared
    back: '이전',
    translate: '번역 시작',
    startOver: '처음부터',
  },

  progress: {
    label: '번역 중',
    analyzing: '파일을 분석하고 있어요',
    translating: '열심히 번역하고 있어요',
    finalizing: '마지막으로 다듬는 중이에요',
    recentLabel: '방금 번역한 대사',
    remaining: (lines: number, total: number, sec: number) =>
      `${lines.toLocaleString()} / ${total.toLocaleString()}줄 · 약 ${sec}초 남음`,
    reassure: '창을 닫아도 번역은 계속 진행돼요.',
    cancel: '취소',
    cancelConfirm: '번역을 취소할까요?',
  },

  done: {
    title: '번역이 완료됐어요!',
    subtitle: (lines: number, time: string) =>
      `${lines.toLocaleString()}줄을 ${time} 만에 번역했어요. 타임코드는 그대로예요.`,
    download: '번역 자막 다운로드',
    summaryLines: '번역된 줄',
    summaryTime: '걸린 시간',
    summaryTimecode: '타임코드 보존',
    previewTitle: '번역 미리보기',
    startOver: '새 파일 번역하기',
    partialWarning: (failed: number) =>
      `일부 구간(${failed.toLocaleString()}개)은 번역에 실패해 원문 그대로 남아 있어요. 해당 부분만 다시 번역하거나 직접 손봐주세요.`,
  },

  footer: {
    feedback: '피드백 보내기',
    feedbackEmail: 'hello@mut36.com',
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

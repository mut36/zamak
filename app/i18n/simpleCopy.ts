// Korean-first conversational copy for the Simple flow.
// Centralized so a second locale can be layered on later.

export const COPY = {
  brand: 'ZAMAK',
  langPill: '한국어',

  steps: ['파일', '정보', '번역', '완료'],

  auth: {
    // Sign-in wall. The pitch has to carry the whole page, so it leads with
    // what the product does rather than with the login itself.
    gateTitle: '자막 한 편, 무료로 번역해보세요',
    gateSubtitle:
      '로그인하면 번역권 1편을 바로 드려요. 타임코드는 100% 그대로 유지돼요.',
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

  credits: {
    emptyTitle: '번역권을 모두 사용했어요',
    emptyBody:
      '무료로 드린 1편을 다 쓰셨어요. 추가 번역권은 준비 중이에요 — 곧 찾아뵐게요.',
    emptyCta: '준비 중',
    tooLargeTitle: '파일이 너무 커요',
    tooLargeBody: (max: number, actual: number) =>
      `번역권 1편은 자막 ${max.toLocaleString()}줄까지 커버해요. 이 파일은 ${actual.toLocaleString()}줄이에요.`,
    startOver: '다른 파일 올리기',
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
} as const;

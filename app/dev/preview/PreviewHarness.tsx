'use client';

import { useState } from 'react';
import { AppNav } from '../../components/beta/AppNav';
import { CopyrightModal } from '../../components/beta/CopyrightModal';
import { ExhaustedStep } from '../../components/beta/ExhaustedStep';
import { TranslateSettingsStep } from '../../components/beta/TranslateSettingsStep';
import { WorkPickStep } from '../../components/beta/WorkPickStep';
import { DoneStep } from '../../components/simple/DoneStep';
import { LandingPage } from '../../components/simple/LandingPage';
import { ProgressStep } from '../../components/simple/ProgressStep';
import { UploadStep } from '../../components/simple/UploadStep';
import { DEFAULT_MODEL, PRO_MODEL } from '../../config/constants';
import type { EnrichCandidate } from '../../hooks/useEnrich';
import type { CastSheet } from '../../types/glossary';
import type {
  ContentType,
  MovieInfo,
  TranslationResult,
} from '../../types/translation';

/* ------------------------------------------------------------------ mocks -- */

const CREDITS = { lite: 3, pro: 1 };

const MOVIE_INFO: MovieInfo = {
  title: '이터널 선샤인',
  year: '2004',
  director: '미셸 공드리',
  notes: '',
  posterUrl: '',
};

const CANDIDATES: EnrichCandidate[] = [
  {
    mediaType: 'movie',
    tmdbId: 38,
    title: '이터널 선샤인',
    year: '2004',
    overview: '기억을 지우는 시술을 받은 연인이 서로를 다시 만나는 이야기.',
    posterUrl: null,
  },
  {
    mediaType: 'movie',
    tmdbId: 77,
    title: '메멘토',
    year: '2000',
    overview: '10분마다 기억을 잃는 남자가 아내의 죽음을 추적한다.',
    posterUrl: null,
  },
  {
    mediaType: 'tv',
    tmdbId: 1396,
    title: '브레이킹 배드',
    year: '2008',
    overview: '시한부 선고를 받은 화학 교사가 마약 제조에 뛰어든다.',
    posterUrl: null,
  },
];

/**
 * 실측(익스테리어 나잇, 2026-08-21)에서 나온 시트를 줄인 것. 두 성질을 일부러
 * 남겼다 — 이 화면이 검토돼야 하는 이유가 그 둘이기 때문이다:
 *
 * 1. **같은 target을 가진 항목이 여럿이다**(`알도 모로` ×2, `붉은 여단` ×2).
 *    자막에 축약형과 전체형이 다 나오면 둘 다 같은 표기로 고정돼야 하므로
 *    이건 정상 데이터다. 화자 셀렉트가 이걸 감당하는지 여기서 보인다.
 * 2. **말투 판정이 틀려 있다** — 모로 ↔ 레오나르디(경호대장)를 양방향 존댓말로
 *    잡았는데 자막에서는 한쪽만 존댓말이다. 번역 AI는 이 표를 그대로 따르므로
 *    (`prompts/common/glossary_directive.txt`) 사람이 여기서 고쳐야 한다.
 */
const MOCK_CAST_SHEET: CastSheet = {
  terms: [
    { source: 'Aldo Moro', target: '알도 모로', kind: 'person', note: '기독교민주당 당수' },
    { source: 'Moro', target: '알도 모로', kind: 'person' },
    { source: 'Leonardi', target: '레오나르디', kind: 'person', note: '모로의 경호대장' },
    { source: 'Cossiga', target: '프란체스코 코시가', kind: 'person', note: '내무장관' },
    { source: 'Red Brigades', target: '붉은 여단', kind: 'org' },
    { source: 'RedBrigades', target: '붉은 여단', kind: 'org' },
    { source: 'Rome', target: '로마', kind: 'place' },
  ],
  relations: [
    { from: '알도 모로', to: '레오나르디', speech: 'formal', basis: '공적 관계', fromBlock: 1, toBlock: 461 },
    { from: '레오나르디', to: '알도 모로', speech: 'formal', basis: '상사–부하', fromBlock: 1, toBlock: 461 },
    { from: '알도 모로', to: '프란체스코 코시가', speech: 'informal', basis: '오랜 동료', fromBlock: 1, toBlock: 461 },
  ],
  narration: 'formal',
};

const SRT = '1\n00:00:01,000 --> 00:00:03,000\n안녕하세요.\n';

const RESULT: TranslationResult = {
  content: SRT,
  filename: 'eternal_sunshine.ko.srt',
  downloads: [
    {
      extension: 'srt',
      filename: 'eternal_sunshine.ko.srt',
      content: SRT,
      mime: 'text/plain',
    },
  ],
  lineCount: 1284,
  durationMs: 42_000,
  fallbackBlocks: 0,
  recoveredBlocks: 3,
  totalChunks: 13,
};

const noop = () => {};

/* ----------------------------------------------------------------- screens -- */

const SCREENS = [
  'landing',
  'upload',
  'upload:uploading',
  'workPick',
  'workPick:searching',
  'workPick:other',
  'settings',
  'settings:confirm',
  'settings:searching',
  'progress',
  'progress:recovering',
  'done',
  'exhausted',
  'copyright',
] as const;

type Screen = (typeof SCREENS)[number];

export function PreviewHarness() {
  const [screen, setScreen] = useState<Screen>('upload');
  // Live state for the controls that would otherwise be inert — a static
  // screen cannot show a selected card, a flipped toggle or a filled star.
  const [contentType, setContentType] = useState<ContentType | null>('movie');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [castSheetOn, setCastSheetOn] = useState(true);
  const [castSheet, setCastSheet] = useState<CastSheet>(MOCK_CAST_SHEET);
  const [movieInfo, setMovieInfo] = useState<MovieInfo>(MOVIE_INFO);
  const [otherType, setOtherType] = useState('다큐멘터리');
  const [toneText, setToneText] = useState('');
  const [checked, setChecked] = useState(false);

  const showNav = screen !== 'landing';

  return (
    <div className='min-h-screen'>
      {showNav && (
        <AppNav
          credits={CREDITS}
          onHome={() => setScreen('upload')}
        />
      )}

      <main
        className={
          screen === 'landing'
            ? 'w-full'
            : 'w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-20'
        }
      >
        {/* Props gone: the landing owns its own sign-in and error banner
            now (LandingPage.tsx), so the harness just mounts it. */}
        {screen === 'landing' && <LandingPage />}

        {(screen === 'upload' || screen === 'upload:uploading') && (
          <UploadStep
            contentType={contentType}
            onContentType={setContentType}
            uploading={screen === 'upload:uploading'}
            uploadingFileName='eternal.sunshine.2004.1080p.srt'
            fileName={screen === 'upload' ? 'eternal.sunshine.2004.1080p.srt' : undefined}
            lineCount={screen === 'upload' ? 1874 : 0}
            credits={screen === 'upload' ? 2 : 0}
            error=''
            onFile={noop}
            onNext={() => setScreen('settings')}
          />
        )}

        {screen.startsWith('workPick') && (
          <WorkPickStep
            contentType={screen === 'workPick:other' ? 'variety' : 'movie'}
            fileName='eternal.sunshine.2004.1080p.srt'
            candidates={CANDIDATES}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onSearch={noop}
            searching={screen === 'workPick:searching'}
            otherType={otherType}
            onOtherType={setOtherType}
            toneText={toneText}
            onToneText={setToneText}
            onConfirm={noop}
          />
        )}

        {screen.startsWith('settings') && (
          <TranslateSettingsStep
            contentType='movie'
            movieInfo={movieInfo}
            onMovieInfo={(patch) => setMovieInfo((p) => ({ ...p, ...patch }))}
            needsConfirm={screen === 'settings:confirm'}
            searching={screen === 'settings:searching'}
            onConfirmWork={() => setScreen('settings')}
            onChangeWork={() => setScreen('workPick')}
            model={model as typeof DEFAULT_MODEL}
            onModel={setModel}
            credits={CREDITS}
            castSheetEnabled={castSheetOn}
            onCastSheetToggle={setCastSheetOn}
            castSheetStatus='ready'
            castSheet={castSheet}
            onCastSheetChange={setCastSheet}
            onCastSheetRefetch={noop}
            targetLang='ko'
            blockCount={461}
            etaSeconds={model === PRO_MODEL ? 40 : 10}
            creditCost={2}
            onStart={() => setScreen('progress')}
          />
        )}

        {screen.startsWith('progress') && (
          <ProgressStep
            progress={{
              stage: screen === 'progress:recovering' ? 'recovering' : 'translating',
              currentChunk: 7,
              totalChunks: 13,
              estimatedRemainingMs: 24_000,
              lastUpdateTimestamp: 0,
              totalEstimateMs: 60_000,
              sweepRecovered: 4,
              sweepRemaining: 2,
            }}
            totalLines={1284}
            onCancel={noop}
            enrichDone
            glossaryEnabled={castSheetOn}
            glossaryDone
            model={DEFAULT_MODEL}
          />
        )}

        {screen === 'done' && (
          <DoneStep
            result={RESULT}
            movieInfo={MOVIE_INFO}
            jobId={null}
            onStartOver={() => setScreen('upload')}
          />
        )}

        {screen === 'exhausted' && (
          <ExhaustedStep
            kind='lite'
            defaultEmail='preview@zamak.test'
            onGoHistory={noop}
            onBack={() => setScreen('upload')}
          />
        )}

        {screen === 'copyright' && (
          <CopyrightModal
            onAgree={() => setChecked((v) => !v)}
            pending={false}
            error=''
          />
        )}
      </main>

      <ScreenPicker screen={screen} onPick={setScreen} />
      <span className='sr-only'>{String(checked)}</span>
    </div>
  );
}

/** Fixed bottom-right jump list, mirroring the prototype's own picker. */
function ScreenPicker({
  screen,
  onPick,
}: {
  screen: Screen;
  onPick: (s: Screen) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className='fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2'>
      {open && (
        <div className='card p-2 max-h-[70vh] overflow-y-auto flex flex-col gap-0.5'>
          {SCREENS.map((s) => (
            <button
              key={s}
              type='button'
              onClick={() => onPick(s)}
              className={`mono text-mono-step text-left px-3 py-2 rounded-btn transition ${
                s === screen
                  ? 'bg-ink-strong text-on-ink'
                  : 'text-secondary hover:bg-fill-hover'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='mono text-mono-step bg-ink-strong text-on-ink px-4 py-3 rounded-btn shadow-hover'
      >
        화면
      </button>
    </div>
  );
}

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
import { EMPTY_CAST_SHEET } from '../../types/glossary';
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
  const [castSheetOn, setCastSheetOn] = useState(false);
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
        {screen === 'landing' && (
          <LandingPage onSignIn={noop} error='' configured />
        )}

        {(screen === 'upload' || screen === 'upload:uploading') && (
          <UploadStep
            contentType={contentType}
            onContentType={setContentType}
            uploading={screen === 'upload:uploading'}
            uploadingFileName='eternal.sunshine.2004.1080p.srt'
            fileName={screen === 'upload' ? 'eternal.sunshine.2004.1080p.srt' : undefined}
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
            castSheetStatus='idle'
            castSheet={EMPTY_CAST_SHEET}
            onCastSheetChange={noop}
            onCastSheetRefetch={noop}
            targetLang='ko'
            etaSeconds={model === PRO_MODEL ? 40 : 10}
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

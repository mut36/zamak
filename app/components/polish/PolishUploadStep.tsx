'use client';

import { useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';
import { CPS_USER_RANGE } from '../../config/constants';
import {
  resolveTargetLang,
  type ContentProfileKey,
} from '../../config/languages';
import type { PolishTimingOptions } from '../../lib/polish';

interface PolishUploadStepProps {
  working: boolean;
  error: string;
  onFile: (file: File, timing: PolishTimingOptions | null) => void;
}

/** 이 화면은 한국어 자막만 다듬는다(`usePolish`의 TARGET_LANG). */
const SHAPES = resolveTargetLang('ko').shapes;

type BandChoice = ContentProfileKey | 'custom';

const PRESETS: { key: BandChoice; label: string }[] = [
  { key: 'movie', label: COPY.polish.timing.presetMovie },
  { key: 'variety', label: COPY.polish.timing.presetVariety },
  { key: 'talk', label: COPY.polish.timing.presetTalk },
  { key: 'custom', label: COPY.polish.timing.presetCustom },
];

const CPS_CHOICES = Array.from(
  { length: CPS_USER_RANGE.max - CPS_USER_RANGE.min + 1 },
  (_, i) => CPS_USER_RANGE.min + i,
);

/**
 * 파일 드롭 + 읽기 속도 밴드(opt-in).
 *
 * 밴드는 **기본이 프리셋**이다. 영화·예능·강연 세 값은 번역 경로가 콘텐츠
 * 유형으로 고르는 것과 **같은 표**(`languages.ts`의 `shapes`)에서 그대로
 * 가져온다 — 여기서 숫자를 새로 적으면 같은 제품이 화면마다 다른 읽기 속도를
 * 파는 꼴이 된다. 직접 고르고 싶은 사람을 위해 `custom`이 있고, 그때만 숫자
 * 두 개가 열린다.
 *
 * 토글이 꺼져 있으면 `onFile`에 `null`이 가고, 파이프라인은 타임코드를 읽지도
 * 쓰지도 않는다 — 이 화면이 원래 하던 약속 그대로다.
 */
export function PolishUploadStep({
  working,
  error,
  onFile,
}: PolishUploadStepProps) {
  const c = COPY.polish;
  const [timingEnabled, setTimingEnabled] = useState(false);
  const [choice, setChoice] = useState<BandChoice>('movie');
  const [customTarget, setCustomTarget] = useState(SHAPES.movie.target);
  const [customHardMax, setCustomHardMax] = useState(SHAPES.movie.hardMax);

  const band =
    choice === 'custom'
      ? { target: customTarget, hardMax: customHardMax }
      : SHAPES[choice];

  // 최소 >= 최대는 "상한을 넘은 것을 상한 위로 늦춘다"는 모순이라 업로드를 막는다.
  const bandValid = band.target < band.hardMax;
  const blocked = working || (timingEnabled && !bandValid);

  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{c.title}</h1>
        <p className='whitespace-pre-line'>{c.sub}</p>
      </div>

      <div className='card p-[22px] mb-4'>
        <button
          type='button'
          className='w-full flex items-center justify-between gap-3 text-left'
          aria-pressed={timingEnabled}
          onClick={() => setTimingEnabled((on) => !on)}
        >
          <span className='flex-1 min-w-0'>
            <span className='block text-title-sm font-semibold tracking-[-0.01em]'>
              {c.timing.title}
            </span>
            <span className='block text-caption-sm text-tertiary mt-0.5'>
              {c.timing.desc}
            </span>
          </span>
          <span className={`ztoggle${timingEnabled ? ' on' : ''}`} aria-hidden>
            <span className='ztoggle-knob' />
          </span>
        </button>

        {timingEnabled && (
          <div className='animate-zslide mt-[18px]'>
            <p className='text-label text-secondary mb-[10px]'>
              {c.timing.presetLabel}
            </p>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-[10px]'>
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type='button'
                  onClick={() => setChoice(preset.key)}
                  className='bg-surface rounded-card p-[12px_14px] text-center text-caption border-[1.5px] transition active:scale-[0.985]'
                  style={{
                    borderColor:
                      choice === preset.key
                        ? 'var(--ink-strong)'
                        : 'var(--border-card)',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {choice === 'custom' && (
              <div className='flex flex-wrap gap-4 mt-[14px]'>
                <label className='flex items-center gap-2 text-caption text-secondary'>
                  {c.timing.minLabel}
                  <select
                    className='bg-surface rounded-[var(--r-btn)] border-[1.5px] px-2 py-1 text-ink'
                    style={{ borderColor: 'var(--border-card)' }}
                    value={customTarget}
                    onChange={(e) => setCustomTarget(Number(e.target.value))}
                  >
                    {CPS_CHOICES.map((n) => (
                      <option key={n} value={n}>
                        {c.timing.unit(n)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex items-center gap-2 text-caption text-secondary'>
                  {c.timing.maxLabel}
                  <select
                    className='bg-surface rounded-[var(--r-btn)] border-[1.5px] px-2 py-1 text-ink'
                    style={{ borderColor: 'var(--border-card)' }}
                    value={customHardMax}
                    onChange={(e) => setCustomHardMax(Number(e.target.value))}
                  >
                    {CPS_CHOICES.map((n) => (
                      <option key={n} value={n}>
                        {c.timing.unit(n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <p className='text-fineprint text-tertiary mt-[14px]'>
              {bandValid
                ? c.timing.bandNote(band.target, band.hardMax)
                : c.timing.invalid}
            </p>
          </div>
        )}
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {error && (
          <p
            className='text-sm text-center'
            style={{ color: 'oklch(0.55 0.2 25)' }}
          >
            {error}
          </p>
        )}

        <label
          className={`btn btn-primary w-full text-center ${
            blocked ? 'opacity-60' : 'cursor-pointer'
          }`}
        >
          {working ? c.working : c.dropButton}
          <input
            type='file'
            accept='.srt,.vtt,.ass,.smi'
            className='hidden'
            disabled={blocked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFile(
                  file,
                  timingEnabled
                    ? { cpsTarget: band.target, cpsHardMax: band.hardMax }
                    : null,
                );
              }
              // 같은 파일을 다시 골라도 change가 뜨도록 비운다.
              event.target.value = '';
            }}
          />
        </label>

        <p className='text-fineprint text-secondary'>{c.dropFormats}</p>
      </div>
    </div>
  );
}

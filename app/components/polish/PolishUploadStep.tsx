'use client';

import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '../icons';
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
  onFile: (
    file: File,
    timing: PolishTimingOptions | null,
    mergeDialogue: boolean,
  ) => void;
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
 * 파일 드롭 + 읽기 속도 밴드(opt-in) + 짧은 대화 합치기(opt-in).
 *
 * 밴드는 **기본이 프리셋**이다. 영화·예능·강연 세 값은 번역 경로가 콘텐츠
 * 유형으로 고르는 것과 **같은 표**(`languages.ts`의 `shapes`)에서 그대로
 * 가져온다 — 여기서 숫자를 새로 적으면 같은 제품이 화면마다 다른 읽기 속도를
 * 파는 꼴이 된다. 직접 고르고 싶은 사람을 위해 `custom`이 있고, 그때만 숫자
 * 두 개가 열린다.
 *
 * 토글이 꺼져 있으면 `onFile`에 `null`이 가고, 파이프라인은 타임코드를 읽지도
 * 쓰지도 않는다 — 이 화면이 원래 하던 약속 그대로다.
 *
 * 두 번째 토글(합치기)도 같은 모양이지만 파는 것이 다르다. 켜면 **블록 수가
 * 바뀌고**, 그 대가로 원본 포맷 다운로드를 잃는다. 그래서 켰을 때 설명이 아니라
 * **대가**를 먼저 보여준다(`c.merge.note`).
 */
export function PolishUploadStep({
  working,
  error,
  onFile,
}: PolishUploadStepProps) {
  const c = COPY.polish;
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [timingEnabled, setTimingEnabled] = useState(false);
  const [mergeEnabled, setMergeEnabled] = useState(false);
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

  // 드롭도 클릭도 같은 한 곳으로 모은다 — 토글 두 개의 현재 값이 여기서만
  // 읽히므로, 경로가 갈리면 한쪽만 토글을 빠뜨리는 버그가 생긴다.
  const submit = (file: File) => {
    if (blocked) return;
    onFile(
      file,
      timingEnabled
        ? { cpsTarget: band.target, cpsHardMax: band.hardMax }
        : null,
      mergeEnabled,
    );
  };

  const openPicker = () => {
    if (blocked) return;
    inputRef.current?.click();
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) submit(file);
  };

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

      <div className='card p-[22px] mb-4'>
        <button
          type='button'
          className='w-full flex items-center justify-between gap-3 text-left'
          aria-pressed={mergeEnabled}
          onClick={() => setMergeEnabled((on) => !on)}
        >
          <span className='flex-1 min-w-0'>
            <span className='block text-title-sm font-semibold tracking-[-0.01em]'>
              {c.merge.title}
            </span>
            <span className='block text-caption-sm text-tertiary mt-0.5'>
              {c.merge.desc}
            </span>
          </span>
          <span className={`ztoggle${mergeEnabled ? ' on' : ''}`} aria-hidden>
            <span className='ztoggle-knob' />
          </span>
        </button>

        {mergeEnabled && (
          <p className='animate-zslide text-fineprint text-tertiary mt-[14px]'>
            {c.merge.note}
          </p>
        )}
      </div>

      {error && (
        <div
          className='card p-4 mb-4 text-sm text-center'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {error}
        </div>
      )}

      <div
        className={`rounded-drop bg-surface shadow-drop p-[48px_28px] text-center transition ${
          blocked
            ? 'opacity-60'
            : `cursor-pointer hover:shadow-drop-hover${over ? ' bg-accent-wash' : ''}`
        }`}
        onDragOver={(event) => {
          // preventDefault가 없으면 브라우저가 파일을 그냥 열어 버린다.
          event.preventDefault();
          if (!blocked) setOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setOver(false);
        }}
        onDrop={handleDrop}
        onClick={openPicker}
        role='button'
        tabIndex={blocked ? -1 : 0}
        onKeyDown={(event) => {
          if (blocked) return;
          if (event.key === 'Enter' || event.key === ' ') openPicker();
        }}
      >
        <div
          className={`drop-ico${working ? ' animate-zbreathe' : ''}`}
          style={{ color: 'var(--ink)' }}
        >
          <UploadIcon strokeWidth={1.25} />
        </div>

        <h3 className='text-lead font-semibold text-ink mb-2'>
          {working ? c.working : c.dropTitle}
        </h3>
        <p className='text-caption text-tertiary mb-[22px]'>{c.dropFormats}</p>

        <button
          type='button'
          className='btn btn-primary btn-lg mt-3'
          disabled={blocked}
          onClick={(event) => {
            // 드롭존 전체가 피커를 여는 버튼이라, 안쪽 버튼의 클릭이 위로
            // 올라가면 피커가 두 번 열린다.
            event.stopPropagation();
            openPicker();
          }}
        >
          {c.dropButton}
        </button>

        {/* ⚠️ `accept`를 다시 붙이지 말 것 — 폰에서 자막을 아예 못 고르게 된다.
            iOS는 확장자를 UTI로 바꿔 거는데 `.srt`·`.smi`·`.ass`는 등록된 UTI가
            없어서 파일 앱이 모든 파일을 회색으로 만든다. 거르는 일은 업로드
            뒤 `loadSubtitleFile`이 하고, 잘못 고른 파일은 위에 이유가 뜬다.
            `decisions.md` §1-22 — 번역 쪽 드롭존(`UploadStep`)과 같은 이유다. */}
        <input
          ref={inputRef}
          type='file'
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 같은 파일을 다시 골라도 change가 뜨도록 비운다.
            event.target.value = '';
            if (file) submit(file);
          }}
        />
      </div>
    </div>
  );
}

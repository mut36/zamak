'use client';

import { useState } from 'react';
import {
  dismissFollowup,
  sendFollowup,
  type PendingFeedbackItem,
} from '../../lib/client/feedback';
import { parseSrtBlocks, readBlockIndex } from '../../lib/srt';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.feedbackFollowup;

type Usability = 'as-is' | 'minor-edits' | 'major-edits' | 'unusable';
type IssueKind =
  | 'mistranslation'
  | 'speech-level'
  | 'naming'
  | 'too-long'
  | 'unnatural'
  | 'timing';

const USABILITY_OPTIONS: Usability[] = [
  'as-is',
  'minor-edits',
  'major-edits',
  'unusable',
];
const ISSUE_OPTIONS: IssueKind[] = [
  'mistranslation',
  'speech-level',
  'naming',
  'too-long',
  'unnatural',
  'timing',
];

/** Mirrors the server's cap (app/api/feedback/route.ts) — past this it's an
 *  export, not a report. */
const MAX_REPORTED_BLOCKS = 30;

type Step = 'usability' | 'issues' | 'lines' | 'comment';
type LinesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ReportedLine {
  index: number;
  text: string;
}

/** Splits a raw SRT block into its sequence number and dialogue text. The
 *  first two lines are the index and timing (see readBlockIndex); everything
 *  after is the body a viewer would recognize. */
function toReportedLine(raw: string): ReportedLine | null {
  const index = readBlockIndex(raw);
  if (index === null) return null;
  const text = raw.split('\n').slice(2).join(' ').trim();
  return { index, text };
}

interface FeedbackFollowupProps {
  item: PendingFeedbackItem;
  /** Called once the follow-up is answered or dismissed — clears it from
   *  wizard state so it doesn't reappear later this session. */
  onDone: () => void;
}

/**
 * Asks, on a later visit, the question the completion screen can't answer:
 * did they actually use the file, and what was wrong with it. Shown only
 * over the upload screen (see page.tsx) so it never interrupts a translation
 * in progress.
 */
export function FeedbackFollowup({ item, onDone }: FeedbackFollowupProps) {
  const [step, setStep] = useState<Step>('usability');
  const [usability, setUsability] = useState<Usability | null>(null);
  const [issueKinds, setIssueKinds] = useState<IssueKind[]>([]);
  const [reportedBlocks, setReportedBlocks] = useState<number[]>([]);
  const [comment, setComment] = useState('');

  const [linesStatus, setLinesStatus] = useState<LinesStatus>('idle');
  const [lines, setLines] = useState<ReportedLine[]>([]);
  const [lineQuery, setLineQuery] = useState('');

  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'sending' | 'sent' | 'failed'
  >('idle');
  const [dismissing, setDismissing] = useState(false);

  const handleLater = async () => {
    setDismissing(true);
    await dismissFollowup(item.jobId);
    onDone();
  };

  const chooseUsability = (value: Usability) => {
    setUsability(value);
    setStep(value === 'as-is' ? 'comment' : 'issues');
  };

  const toggleIssue = (kind: IssueKind) => {
    setIssueKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  };

  const goToLines = async () => {
    if (!item.resultUrl) {
      setStep('comment');
      return;
    }
    setStep('lines');
    if (linesStatus !== 'idle') return;
    setLinesStatus('loading');
    try {
      const res = await fetch(item.resultUrl);
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      const parsed = parseSrtBlocks(text)
        .map(toReportedLine)
        .filter((line): line is ReportedLine => line !== null);
      setLines(parsed);
      setLinesStatus('ready');
    } catch {
      setLinesStatus('error');
    }
  };

  const toggleBlock = (index: number) => {
    setReportedBlocks((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= MAX_REPORTED_BLOCKS) return prev;
      return [...prev, index];
    });
  };

  const handleSubmit = async () => {
    if (!usability) return;
    setSubmitStatus('sending');
    const ok = await sendFollowup(
      item.jobId,
      usability,
      issueKinds,
      reportedBlocks,
      comment,
    );
    setSubmitStatus(ok ? 'sent' : 'failed');
  };

  const filteredLines = lineQuery
    ? lines.filter((line) =>
        line.text.toLowerCase().includes(lineQuery.toLowerCase()),
      )
    : lines;

  return (
    <div className='animate-zscrim fixed inset-0 z-50 bg-scrim flex items-center justify-center px-6'>
      <div className='glass-modal w-full max-w-[520px] rounded-modal p-8 shadow-modal animate-zpop max-h-[85vh] overflow-y-auto'>
        {submitStatus === 'sent' ? (
          <div className='text-center py-4'>
            <p className='text-body text-nav'>{c.thanks}</p>
            <button
              type='button'
              className='btn btn-ghost btn-block mt-5'
              onClick={onDone}
            >
              {c.close}
            </button>
          </div>
        ) : (
          <>
            {step === 'usability' && (
              <>
                <h2 className='text-h2 text-ink-strong'>{c.title}</h2>
                <p className='mt-[10px] text-body text-secondary'>
                  {c.subtitle(item.filename)}
                </p>
                <div className='flex flex-col gap-2 mt-5'>
                  {USABILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type='button'
                      className='rounded-[var(--r-btn)] px-4 py-3 text-caption font-medium border-[1.5px] text-left transition'
                      style={{
                        background:
                          usability === opt ? 'var(--accent-wash)' : 'var(--surface)',
                        borderColor:
                          usability === opt ? 'var(--ink-strong)' : 'var(--border-step)',
                      }}
                      onClick={() => chooseUsability(opt)}
                    >
                      {c.usability[opt]}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 'issues' && (
              <>
                <h2 className='text-h2 text-ink-strong'>{c.issuesTitle}</h2>
                <div className='flex flex-wrap gap-2 mt-5'>
                  {ISSUE_OPTIONS.map((kind) => {
                    const selected = issueKinds.includes(kind);
                    return (
                      <button
                        key={kind}
                        type='button'
                        className='rounded-[var(--r-btn)] px-4 py-2 text-caption font-medium border-[1.5px] transition'
                        style={{
                          background: selected ? 'var(--accent-wash)' : 'var(--surface)',
                          borderColor: selected ? 'var(--ink-strong)' : 'var(--border-step)',
                        }}
                        onClick={() => toggleIssue(kind)}
                      >
                        {c.issues[kind]}
                      </button>
                    );
                  })}
                </div>
                <button
                  type='button'
                  className='btn btn-primary btn-block mt-6'
                  onClick={goToLines}
                >
                  {c.next}
                </button>
              </>
            )}

            {step === 'lines' && (
              <>
                <h2 className='text-h2 text-ink-strong'>{c.linesTitle}</h2>
                {linesStatus === 'loading' && (
                  <p className='mt-4 text-caption text-secondary'>…</p>
                )}
                {linesStatus === 'error' && (
                  <>
                    <p className='mt-4 text-caption text-secondary'>
                      {c.linesLoadFailed}
                    </p>
                    <button
                      type='button'
                      className='btn btn-primary btn-block mt-6'
                      onClick={() => setStep('comment')}
                    >
                      {c.next}
                    </button>
                  </>
                )}
                {linesStatus === 'ready' && (
                  <>
                    <p className='mt-1 text-fineprint text-secondary'>
                      {c.linesHint(MAX_REPORTED_BLOCKS)}
                    </p>
                    <input
                      type='text'
                      className='input mt-3'
                      placeholder={c.linesSearchPlaceholder}
                      value={lineQuery}
                      onChange={(e) => setLineQuery(e.target.value)}
                    />
                    <div className='mt-3 max-h-[280px] overflow-y-auto flex flex-col gap-1.5'>
                      {filteredLines.length === 0 ? (
                        <p className='text-caption text-tertiary py-4 text-center'>
                          {c.linesEmpty}
                        </p>
                      ) : (
                        filteredLines.map((line) => {
                          const checked = reportedBlocks.includes(line.index);
                          const disabled =
                            !checked && reportedBlocks.length >= MAX_REPORTED_BLOCKS;
                          return (
                            <button
                              key={line.index}
                              type='button'
                              disabled={disabled}
                              onClick={() => toggleBlock(line.index)}
                              className='w-full flex items-start gap-2.5 p-[10px_12px] rounded-drop text-left border border-border-chip bg-fill-hover/60 transition hover:bg-fill-hover disabled:opacity-40'
                            >
                              <span
                                className={`zcheck w-[18px] h-[18px] rounded-[5px] text-micro font-bold shrink-0 mt-0.5${checked ? ' on' : ''}`}
                              >
                                {checked && '✓'}
                              </span>
                              <span className='text-caption text-nav'>
                                <span className='mono text-tertiary mr-1.5'>
                                  {line.index}
                                </span>
                                {line.text}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type='button'
                      className='btn btn-primary btn-block mt-4'
                      onClick={() => setStep('comment')}
                    >
                      {c.next}
                    </button>
                  </>
                )}
              </>
            )}

            {step === 'comment' && (
              <>
                <h2 className='text-h2 text-ink-strong'>{c.commentTitle}</h2>
                <input
                  type='text'
                  className='input mt-4'
                  placeholder={c.commentPlaceholder}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                {submitStatus === 'failed' && (
                  <p className='mt-2 text-fineprint text-danger'>{c.failed}</p>
                )}
                <button
                  type='button'
                  className='btn btn-primary btn-block mt-5'
                  disabled={submitStatus === 'sending'}
                  onClick={handleSubmit}
                >
                  {c.submit}
                </button>
              </>
            )}

            <button
              type='button'
              className='btn btn-ghost btn-block mt-2'
              disabled={dismissing}
              onClick={handleLater}
            >
              {c.later}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

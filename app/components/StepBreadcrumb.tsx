import { COPY } from '../i18n/simpleCopy';

type Step = 'upload' | 'settings' | 'translate';

const ORDER: Step[] = ['upload', 'settings', 'translate'];

interface StepBreadcrumbProps {
  current: Step;
  className?: string;
}

/**
 * Mono step tracker ("1 업로드 — 2 설정 — 3 번역") shown above the H1 on
 * every step screen (design_handoff_zamak_brand). WorkPickStep (작품 인식)
 * and TranslateSettingsStep both render with current='settings' — the
 * brand handoff treats them as the same step.
 */
export function StepBreadcrumb({ current, className }: StepBreadcrumbProps) {
  const currentIndex = ORDER.indexOf(current);

  return (
    <div className={`zsteps${className ? ` ${className}` : ''}`}>
      {ORDER.map((step, i) => (
        <div key={step} className='flex items-center gap-[10px]'>
          {i > 0 && <span className='zstep-sep' />}
          {i < currentIndex ? (
            <span className='zstep-done'>
              <b>✓</b> {COPY.steps[step]}
            </span>
          ) : i === currentIndex ? (
            <span className='zchip py-1 px-[10px] text-mono-step'>
              {i + 1} {COPY.steps[step]}
            </span>
          ) : (
            <span className='zstep-future'>
              {i + 1} {COPY.steps[step]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * ZAMAK brand mark — two overlapping rounded diamonds ("alloy" motif)
 * drawn purely in CSS (see `.mark` in globals.css) plus the wordmark.
 */
interface BrandMarkProps {
  /** Mark size in px (default 30, matching the Simple prototype top bar). */
  size?: number;
  /** Wordmark font-size in px (default 19). Set to 0 to hide the wordmark. */
  wordmarkSize?: number;
  className?: string;
  /** When set, the mark becomes a home/reset control. */
  onClick?: () => void;
}

export function BrandMark({
  size = 30,
  wordmarkSize = 19,
  className,
  onClick,
}: BrandMarkProps) {
  const classes = `flex items-center gap-2.5 select-none bg-transparent border-0 p-0${
    onClick ? ' cursor-pointer' : ''
  }${className ? ` ${className}` : ''}`;

  if (onClick) {
    return (
      <button
        type='button'
        onClick={onClick}
        aria-label='ZAMAK home'
        className={classes}
      >
        <span className='mark' style={{ width: size, height: size }} aria-hidden>
          <i />
          <i />
        </span>
        {wordmarkSize > 0 && (
          <span className='wordmark' style={{ fontSize: wordmarkSize }}>
            ZAMAK
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={classes}>
      <span className='mark' style={{ width: size, height: size }} aria-hidden>
        <i />
        <i />
      </span>
      {wordmarkSize > 0 && (
        <span className='wordmark' style={{ fontSize: wordmarkSize }}>
          ZAMAK
        </span>
      )}
    </div>
  );
}

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
}

export function BrandMark({
  size = 30,
  wordmarkSize = 19,
  className,
}: BrandMarkProps) {
  return (
    <div
      className={`flex items-center gap-2.5 select-none${className ? ` ${className}` : ''}`}
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
    </div>
  );
}

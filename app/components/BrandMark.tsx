/**
 * ZAMAK brand mark — logo image (black chip wordmark + yellow point).
 * Footer uses `Wordmark` (text-only); do not swap that for this image.
 */

const LOGO_SRC = '/brand/zamak-logo.png';
/** Intrinsic pixel size of `public/brand/zamak-logo.png`. */
const LOGO_W = 1024;
const LOGO_H = 377;

interface BrandMarkProps {
  /** Logo height in px (default 28). Width follows the asset aspect ratio. */
  size?: number;
  className?: string;
  /** When set, the mark becomes a home/reset control. */
  onClick?: () => void;
}

export function BrandMark({ size = 28, className, onClick }: BrandMarkProps) {
  const height = size;
  const width = Math.round((size * LOGO_W) / LOGO_H);

  const mark = (
    // eslint-disable-next-line @next/next/no-img-element -- static public brand asset; no optimization needed
    <img
      src={LOGO_SRC}
      alt='ZAMAK'
      width={width}
      height={height}
      draggable={false}
      className='block'
    />
  );

  if (onClick) {
    return (
      <button
        type='button'
        onClick={onClick}
        aria-label='ZAMAK home'
        className={`bg-transparent border-0 p-0 cursor-pointer select-none${
          className ? ` ${className}` : ''
        }`}
      >
        {mark}
      </button>
    );
  }

  return (
    <div className={`select-none${className ? ` ${className}` : ''}`}>{mark}</div>
  );
}

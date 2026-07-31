/**
 * ZAMAK brand mark — black square chip wordmark + trailing yellow point
 * (design_handoff_zamak_brand: "검은 사각 칩 로고 + 노란 점").
 */
interface BrandMarkProps {
  /** Chip font-size in px (default 19, matching the Simple prototype top bar). */
  size?: number;
  className?: string;
  /** When set, the mark becomes a home/reset control. */
  onClick?: () => void;
}

export function BrandMark({ size = 19, className, onClick }: BrandMarkProps) {
  const chip = (
    <span
      className='zchip'
      style={{ fontSize: size, padding: `${size * 0.42}px ${size * 0.74}px` }}
    >
      ZAMAK
      <span
        className='zchip-dot'
        style={{ width: size * 0.18, height: size * 0.18, marginLeft: size * 0.12 }}
        aria-hidden
      />
    </span>
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
        {chip}
      </button>
    );
  }

  return (
    <div className={`select-none${className ? ` ${className}` : ''}`}>{chip}</div>
  );
}

import { ImageResponse } from 'next/og';
import { BRAND, SITE } from './lib/brand';

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadPretendard(weight: 'Bold' | 'SemiBold' | 'Medium') {
  const url =
    `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff/Pretendard-${weight}.woff`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load Pretendard-${weight}`);
  return res.arrayBuffer();
}

/**
 * The bracket mark, as an app-icon chip — the same geometry as `app/icon.svg`
 * so the share card, the browser tab and the home-screen icon read as one
 * system. (Until 2026-08-03 this was an unrelated rotated-diamond shape that
 * matched nothing shipping.)
 *
 * Rebuilt out of positioned divs rather than reusing the SVG: Satori (the
 * next/og renderer) draws a subset of CSS and does not take our `<rect>`s.
 * Coordinates below are the favicon's own 32×32 viewBox, scaled by `px()` —
 * keeping the source numbers means the two files can be diffed by eye when
 * the mark changes.
 */
const MARK_SIZE = 88;
const px = (unit: number) => (unit * MARK_SIZE) / 32;

/** Bracket bars in favicon viewBox units: two stems + four arms. */
const BRACKET_BARS = [
  { x: 5.6, y: 8, w: 2.8, h: 16 }, // left stem
  { x: 5.6, y: 8, w: 6.4, h: 2.8 }, // left top arm
  { x: 5.6, y: 21.2, w: 6.4, h: 2.8 }, // left bottom arm
  { x: 23.6, y: 8, w: 2.8, h: 16 }, // right stem
  { x: 20, y: 8, w: 6.4, h: 2.8 }, // right top arm
  { x: 20, y: 21.2, w: 6.4, h: 2.8 }, // right bottom arm
];

/** Chip face, matching `icon.svg`'s background rect (not a globals.css token). */
const CHIP_FACE = '#FAF9F5';

/**
 * The card's warm midpoint — `--accent-wash` (8% yellow) already blended over
 * `--bg`, as an opaque hex.
 *
 * It has to be pre-blended: Satori discards alpha on gradient color stops and
 * paints them solid, so passing the rgba token here produced a near-neat
 * #ffd400 slab (measured rgb(255,211,14)). Yellow is this brand's point color,
 * not a field color — the mark, the wordmark period and the rule carry it.
 */
const WASH = '#F6F0D4';

/** Open Graph card — brand-first: mark + wordmark, one line, short support. */
export default async function OpenGraphImage() {
  const [bold, medium] = await Promise.all([
    loadPretendard('Bold'),
    loadPretendard('Medium'),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px 88px',
          // See WASH: an opaque pre-blend, because Satori ignores alpha here.
          background: `linear-gradient(145deg, ${BRAND.bg} 0%, ${WASH} 55%, ${BRAND.bg} 100%)`,
          fontFamily: 'Pretendard',
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: MARK_SIZE,
              height: MARK_SIZE,
              display: 'flex',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: px(4.5),
                background: CHIP_FACE,
                border: `${px(1.2)}px solid rgba(22, 22, 20, 0.14)`,
              }}
            />
            {BRACKET_BARS.map((bar) => (
              <div
                key={`${bar.x}-${bar.y}-${bar.w}`}
                style={{
                  position: 'absolute',
                  left: px(bar.x),
                  top: px(bar.y),
                  width: px(bar.w),
                  height: px(bar.h),
                  background: BRAND.ink,
                }}
              />
            ))}
            <div
              style={{
                position: 'absolute',
                left: px(13),
                top: px(13),
                width: px(6),
                height: px(6),
                borderRadius: px(1),
                background: BRAND.accent,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              // 700 is what `fonts` below actually registers — asking for 800
              // just made Satori synthesize from the nearest face.
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: BRAND.ink,
              lineHeight: 1,
            }}
          >
            {SITE.name}
            {/* The wordmark's yellow period (public/brand/zamak-logo.png). */}
            <span style={{ color: BRAND.accent }}>.</span>
          </div>
        </div>

        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: BRAND.ink,
            marginBottom: 18,
            lineHeight: 1.25,
          }}
        >
          AI 자막 번역기
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: BRAND.ink2,
            lineHeight: 1.45,
            maxWidth: 820,
          }}
        >
          {SITE.description}
        </div>

        <div
          style={{
            marginTop: 48,
            width: 96,
            height: 6,
            borderRadius: 999,
            background: BRAND.accent,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
        { name: 'Pretendard', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}

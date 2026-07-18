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
          background: `linear-gradient(145deg, ${BRAND.bg} 0%, ${BRAND.accentSoft} 55%, ${BRAND.bg} 100%)`,
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
              width: 72,
              height: 72,
              display: 'flex',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 12,
                background: BRAND.accent,
                transform: 'rotate(45deg) scale(0.64)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 12,
                background: BRAND.ink,
                opacity: 0.88,
                transform: 'rotate(45deg) scale(0.64) translate(8px, 8px)',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: BRAND.ink,
              lineHeight: 1,
            }}
          >
            {SITE.name}
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

import { ImageResponse } from 'next/og';
import { BRAND } from './lib/brand';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** iOS home-screen icon — alloy mark on warm brand background. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.bg,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 96,
            height: 96,
            display: 'flex',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              background: BRAND.accent,
              transform: 'rotate(45deg) scale(0.64)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              background: BRAND.ink,
              opacity: 0.88,
              transform: 'rotate(45deg) scale(0.64) translate(10px, 10px)',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

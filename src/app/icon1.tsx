import { ImageResponse } from 'next/og'

// PWA icon (Android/Chrome) — 192×192 PNG. Manifest references this via
// /icon1. Mirrors the design in public/icons/icon.svg.
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <div
          style={{
            width: 102,
            height: 120,
            border: '8px solid #f8fafc',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            padding: 10,
            gap: 6,
          }}
        >
          {/* Two rows of windows */}
          {[0, 1].map((row) => (
            <div key={row} style={{ display: 'flex', gap: 4 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  background: '#f8fafc',
                  borderRadius: 3,
                }}
              />
              <div
                style={{
                  width: 22,
                  height: 22,
                  background: '#f8fafc',
                  borderRadius: 3,
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 22,
                  background: '#f8fafc',
                  borderRadius: 3,
                }}
              />
            </div>
          ))}
          {/* Door */}
          <div
            style={{
              alignSelf: 'center',
              marginTop: 4,
              width: 26,
              height: 32,
              background: '#f8fafc',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  )
}

import { ImageResponse } from 'next/og'

// PWA icon (Android/Chrome large) — 512×512 PNG. Manifest references this
// via /icon2. Mirrors the design in public/icons/icon.svg at higher detail.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon512() {
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
          borderRadius: 96,
        }}
      >
        <div
          style={{
            width: 272,
            height: 320,
            border: '20px solid #f8fafc',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            padding: 26,
            gap: 16,
          }}
        >
          {/* Two rows of windows */}
          {[0, 1].map((row) => (
            <div key={row} style={{ display: 'flex', gap: 12 }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  background: '#f8fafc',
                  borderRadius: 6,
                }}
              />
              <div
                style={{
                  width: 60,
                  height: 60,
                  background: '#f8fafc',
                  borderRadius: 6,
                }}
              />
              <div
                style={{
                  width: 32,
                  height: 60,
                  background: '#f8fafc',
                  borderRadius: 6,
                }}
              />
            </div>
          ))}
          {/* Door */}
          <div
            style={{
              alignSelf: 'center',
              marginTop: 12,
              width: 72,
              height: 90,
              background: '#f8fafc',
              borderRadius: 6,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  )
}

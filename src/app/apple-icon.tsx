import { ImageResponse } from 'next/og'

// Apple touch icon for iOS Safari home-screen install (glyph-free, larger)
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[0, 1, 2].map((row) => (
            <div key={row} style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((col) => (
                <div
                  key={col}
                  style={{
                    width: 32,
                    height: 32,
                    background: '#f8fafc',
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}

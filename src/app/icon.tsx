import { ImageResponse } from 'next/og'

// Static favicon for browser tabs. ImageResponse default font is Latin-only,
// so we draw a building silhouette with primitives instead of using glyphs.
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map((row) => (
            <div key={row} style={{ display: 'flex', gap: 1 }}>
              {[0, 1, 2].map((col) => (
                <div
                  key={col}
                  style={{
                    width: 6,
                    height: 6,
                    background: '#f8fafc',
                    borderRadius: 1,
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

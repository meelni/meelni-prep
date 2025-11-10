import { ImageResponse } from 'next/og'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const alt = 'Meelni - AI Interview Agent'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'linear-gradient(135deg, oklch(0.70 0.22 285) 0%, oklch(0.60 0.20 285) 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
        }}
      >
        <div style={{ fontSize: 180, marginBottom: 20 }}>M</div>
        <div style={{ fontSize: 48 }}>Meelni</div>
        <div style={{ fontSize: 32, opacity: 0.9 }}>AI Interview Agent</div>
      </div>
    ),
    {
      ...size,
    }
  )
}

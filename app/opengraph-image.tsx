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
      // ImageResponse JSX element
      <div
        style={{
          background: 'linear-gradient(135deg, oklch(0.70 0.22 285) 0%, oklch(0.65 0.25 260) 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          Meelni
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 400,
            opacity: 0.9,
          }}
        >
          AI Interview Agent
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            marginTop: 40,
            opacity: 0.7,
          }}
        >
          Practice PM Interviews • Get Real-Time Feedback
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  )
}

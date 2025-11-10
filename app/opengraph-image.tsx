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
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '80px',
        }}
      >
        {/* Logo placeholder - will be replaced by actual logo */}
        <div
          style={{
            fontSize: 200,
            fontWeight: 700,
            marginBottom: 40,
            color: '#000',
            letterSpacing: '-0.05em',
          }}
        >
          M
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#000',
            marginBottom: 20,
          }}
        >
          Meelni
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 400,
            color: '#666',
          }}
        >
          AI Interview Agent
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            marginTop: 60,
            color: '#999',
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

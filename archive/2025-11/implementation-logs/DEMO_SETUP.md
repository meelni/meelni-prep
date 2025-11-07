# Demo Modal Setup & Testing Guide

## Overview
The demo modal provides a quick 60-second product demo for landing page visitors. It uses a **separate demo agent** with a dedicated prompt optimized for fast, impressive demos.

---

## Architecture

### Components Created

1. **Demo Agent** (`/agent/demo_agent.py`)
   - Separate Python worker for demo-only sessions
   - Fixed prompt optimized for 60-second demos
   - Only joins rooms starting with `demo-*`

2. **Demo Token API** (`/app/api/livekit/demo-token/route.ts`)
   - Generates unique demo room names: `demo-{timestamp}-{random}`
   - 2-minute token TTL (demo duration)
   - Auto-cleanup: rooms expire 2 minutes after last participant leaves

3. **Demo Modal Component** (`/components/demo-modal.tsx`)
   - Full-screen modal with backdrop blur
   - LiveKit audio visualizer (BarVisualizer)
   - Mic toggle, connection status, agent state indicator
   - CTA to full interview setup

4. **Hero Integration** (`/components/sections/hero.tsx`)
   - "Talk to Meelni" button opens modal (changed from navigation)
   - Modal state management with useState
   - Framer Motion animations

---

## Running the Demo

### Step 1: Start Demo Agent

In one terminal:

```bash
cd agent
source venv/bin/activate  # or venv\Scripts\activate on Windows
python demo_agent.py dev
```

You should see:
```
Starting demo agent worker...
Waiting for jobs...
```

### Step 2: Start Main Agent (Optional)

If you want both agents running (for full interviews + demos):

In another terminal:

```bash
cd agent
source venv/bin/activate
python agent.py dev
```

### Step 3: Start Next.js Dev Server

In a third terminal:

```bash
npm run dev
```

Open http://localhost:3000

### Step 4: Test the Demo Flow

1. **Click "Talk to Meelni"** on the landing page
2. Modal should open with "Preparing your demo..." state
3. Within 2-3 seconds, you should see:
   - Connection status: "Connected" with green dot
   - Audio visualizer (30 bars)
   - Meelni avatar (M in circle)
   - Mic toggle button

4. **Agent should auto-introduce** (~5 seconds):
   > "Hey! I'm Meelni, your AI interview coach. Let's do a quick demo—I'll ask you one interview question and give you a taste of what practicing with me is like. Sound good?"

5. **Respond** with brief acknowledgment (e.g., "Sure!" or "Sounds good")

6. **Agent asks one question** (~3 seconds):
   > "How would you improve Spotify's Discover feature?"

7. **Give your answer** (15-25 seconds)
   - Test interruption handling: try talking over the agent
   - Watch the visualizer respond to your voice

8. **Agent gives feedback** (~10-15 seconds):
   - 2-3 quick observations
   - Encouraging tone

9. **Agent closes with CTA** (~5 seconds):
   > "Ready for a full mock interview? Just click 'Start Full Interview' to customize your session!"

10. **Click "Start Full Interview"** or **Close modal**

---

## Troubleshooting

### Issue: Modal opens but shows "Failed to start demo"

**Cause**: Demo token API failed

**Check**:
```bash
# Verify environment variables
echo $LIVEKIT_API_KEY
echo $LIVEKIT_API_SECRET
echo $NEXT_PUBLIC_LIVEKIT_URL
```

**Fix**: Ensure all LiveKit credentials are set in `.env.local`

---

### Issue: Connected but agent doesn't join

**Cause**: Demo agent not running or not filtering correctly

**Check agent logs**:
```bash
# In demo_agent.py terminal, you should see:
Starting demo agent for room: demo-1234567890-abc123
```

**Fix**:
- Restart demo agent: `python demo_agent.py dev`
- Verify room name filter in `demo_agent.py:62`:
  ```python
  if not ctx.room.name.startswith("demo-"):
  ```

---

### Issue: Agent joins but doesn't speak

**Cause**: API keys missing or incorrect model configuration

**Check agent logs** for:
```
Demo Configuration - STT: deepgram/nova-3, LLM: openai/gpt-4.1-mini, TTS: cartesia/sonic-3:6ccbfb76...
```

**Fix**:
- Verify `OPENAI_API_KEY` in `agent/.env`
- Verify `DEEPGRAM_API_KEY` in `agent/.env`
- Note: `CARTESIA_API_KEY` not needed (LiveKit Inference handles it)

---

### Issue: Visualizer not animating

**Cause**: Audio track not connected or BarVisualizer props incorrect

**Check browser console** for LiveKit errors

**Fix**:
- Verify `trackRef={audioTrack}` in DemoModal:183
- Check `useVoiceAssistant()` hook is working
- Try refreshing the page

---

### Issue: Mic toggle doesn't work

**Cause**: Audio permissions not granted

**Fix**:
- Check browser permissions (click lock icon in URL bar)
- Grant microphone access
- Refresh page and try again

---

## Demo Flow Diagram

```
Landing Page
    ↓
[Talk to Meelni] button clicked
    ↓
DemoModal opens (useState)
    ↓
Fetch /api/livekit/demo-token
    ↓
Receive: { token, url, roomName: "demo-12345..." }
    ↓
LiveKitRoom connects
    ↓
Demo Agent joins room (demo_agent.py)
    ↓
Agent speaks introduction
    ↓
User responds via microphone
    ↓
Agent asks question
    ↓
User answers
    ↓
Agent gives feedback
    ↓
Agent closes with CTA
    ↓
User clicks "Start Full Interview" → /setup
    OR
User clicks "Close" → Modal closes
```

---

## Key Differences: Demo Agent vs Main Agent

| Feature | Demo Agent | Main Agent |
|---------|-----------|------------|
| **File** | `demo_agent.py` | `agent.py` |
| **Room Filter** | `demo-*` only | `interview-*` only |
| **Prompt** | Fixed 60-second demo script | Dynamic based on config |
| **Duration** | 60 seconds | 20-45 minutes |
| **Configuration** | Hardcoded (Tessa voice, GPT-4.1-mini) | User-configurable via query params |
| **Purpose** | Landing page conversion | Full interview practice |
| **Cleanup** | Auto-expire after 2 minutes | Persistent (future: save to DB) |

---

## Production Deployment

### Option 1: Same Worker (Dev/Staging)
Run both agents on the same worker using room name filtering:
```bash
# Start both in same process (future enhancement)
python agent.py dev &
python demo_agent.py dev &
```

### Option 2: Separate Workers (Production)
Deploy to separate services for better isolation and scaling:

**Railway/Render/Fly.io**:
- Service 1: Main agent (`agent.py`)
- Service 2: Demo agent (`demo_agent.py`)

Both services use same LiveKit credentials but filter rooms differently.

---

## Analytics & Tracking (Future)

Track demo usage for conversion optimization:

```typescript
// In DemoModal.tsx, add tracking
useEffect(() => {
  if (isOpen) {
    // Track demo opened
    analytics.track('Demo Opened');
  }
}, [isOpen]);

// Track if user clicks "Start Full Interview"
onClick={() => {
  analytics.track('Demo CTA Clicked');
  router.push('/setup');
}}
```

---

## Performance Goals

- ✅ **Time to Connection**: < 2 seconds
- ✅ **Agent Join Latency**: < 3 seconds
- ✅ **Total Demo Duration**: 45-75 seconds
- ✅ **Modal Load Time**: < 500ms

---

## Next Steps

1. ✅ Test basic demo flow
2. ✅ Verify agent prompt quality (does it sound natural?)
3. ✅ Test interruption handling (barge-in)
4. ✅ Test mobile responsiveness
5. 🔲 Add error tracking (Sentry)
6. 🔲 Add conversion tracking (PostHog/Vercel Analytics)
7. 🔲 A/B test demo script variations
8. 🔲 Add demo replay/transcript view

---

**Questions or Issues?**
Check CLAUDE.md for architecture decisions and contact info.

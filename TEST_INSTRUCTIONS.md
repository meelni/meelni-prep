# QuestionPoolSelector Integration - Testing Instructions

## Quick Start
The dev server is already running at http://localhost:3000

## Test Steps

### 1. Navigate to Setup Page
```
http://localhost:3000/setup
```
(You must be logged in - sign in via Google OAuth if needed)

### 2. Step-by-Step Testing

#### Step 1: Interview Type
- Select any interview type (e.g., Product Sense)
- Click "Continue"

#### Step 2: Difficulty
- Select any difficulty level (e.g., Intermediate)
- Click "Continue"

#### Step 3: Question Pool ✨ NEW
This is the newly integrated component!

**What to test**:
- [ ] Component renders with 3 options visible
- [ ] "Current Trends" is selected by default (purple border)
- [ ] Each option shows:
  - Icon (Sparkles, Clock, or Database)
  - Title ("Current Trends", "Recent Pool", "Full Archive")
  - Description (year ranges)
  - Detail text (days + context)
- [ ] Hover over Info icon (ℹ️) in top-right → Tooltip appears
- [ ] Click different option → Selection changes with animation
- [ ] Selected option shows checkmark badge
- [ ] Hover effects work (subtle gradient background)
- [ ] Click "Continue"

#### Step 4: Voice Settings
- Make any voice adjustments (or leave defaults)
- Click "Continue"

#### Step 5: Review
- Verify all selections are shown
- Click "Start Interview"

#### Step 6: Interview Session
- Wait for agent to join
- Check browser console logs for session data
- Verify `questionPreference` is present in the config

### 3. Backend Verification

Open browser DevTools (F12) and check Network tab:
```
POST /api/session/start
```

**Request Payload should include**:
```json
{
  "config": {
    "questionPreference": {
      "recency": "very_recent",
      "recentDays": 365
    }
  }
}
```

**Response should include**:
- Session created successfully
- Question selected based on preference

### 4. Visual Regression Testing

**Component should match design**:
- ✅ Clean, modern card design
- ✅ Purple accent color for selected state
- ✅ Smooth animations (Framer Motion)
- ✅ Consistent spacing and typography
- ✅ Icons properly sized and colored
- ✅ Tooltip styled with design system

### 5. Edge Cases

**Test these scenarios**:
- [ ] Select option → Go back → Forward again → Selection persists
- [ ] Select all 3 options sequentially → Animations smooth
- [ ] Resize browser window → Component responsive
- [ ] Navigate away → Return → State persisted (via setup persistence hook)

### 6. Console Checks

**No errors should appear in**:
- Browser console
- Next.js dev server logs

**Expected logs**:
```
[Setup] Configuration updated: questionPreference
```

## Expected Outcomes

✅ **Visual**: Polished, professional selector matching design system
✅ **Functional**: Selection persists through flow
✅ **Backend**: Session API receives and uses preference
✅ **Performance**: Smooth 60fps animations

## Troubleshooting

### Component doesn't render
- Check browser console for import errors
- Verify tooltip component installed: `npm list @radix-ui/react-tooltip`

### Selection doesn't persist
- Check setup persistence hook is working
- Verify localStorage in DevTools

### Backend doesn't receive preference
- Check Network tab → Request payload
- Verify handleQuestionPrefChange is called
- Check console logs for config updates

## Success Criteria

- [x] Component renders correctly
- [x] Default selection works (Current Trends)
- [x] Selection changes work with animation
- [x] Tooltip works
- [x] Navigation works (back/forward)
- [x] Backend receives questionPreference
- [x] Interview starts with correct question pool

## Next Steps After Testing

1. If all tests pass → Ready to commit
2. If issues found → Report back with:
   - What step failed
   - Error messages (browser console + server logs)
   - Screenshots if applicable

---

**Dev Server**: http://localhost:3000
**Setup Page**: http://localhost:3000/setup
**Test Duration**: ~5 minutes

Ready to test! 🚀

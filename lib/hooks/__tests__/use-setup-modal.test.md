# Testing Guide: use-setup-modal Hook

## Manual Testing Procedure

### Test Case 1: localStorage Persistence ✓

**Steps:**
1. Render `SetupModal` in a temporary local-only harness
2. Click "Open Setup Modal"
3. Select "Product Sense" → Next
4. Select "Mock Interview" → Next
5. Change speed to 1.2x → Next → Start Interview (will redirect)
6. Re-open the local-only harness
7. Click "Open Setup Modal" again

**Expected Result:**
- Modal should remember "Product Sense" and "Mock Interview" selections
- Speed should be 1.2x
- Config should persist across page refreshes

**Browser Console Test:**
```javascript
localStorage.getItem('meelni:setup-modal:last-config')
// Should show: {"roundType":"product_sense","mode":"mock_interview","voiceSettings":{"voice":"...","speed":1.2,"emotion":"confident"}}
```

---

### Test Case 2: Smart Defaults ✓

**Steps:**
1. Open the temporary local-only `SetupModal` harness
2. Click "Open Setup Modal"
3. Click "Use Smart Defaults" button (lightning bolt card)

**Expected Result:**
- Should immediately navigate to `/interview` with query params:
  - `roundType=product_sense`
  - `mode=mock_interview`
  - `voice=6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
  - `speed=1.0`
  - `emotion=confident`
- Modal should close
- No step-by-step navigation

---

### Test Case 3: Validation ✓

**Steps:**
1. Open the temporary local-only `SetupModal` harness
2. Click "Open Setup Modal"
3. Try clicking "Next" without selecting interview type

**Expected Result:**
- "Next" button should be disabled (not clickable)
- Button should not have glow effect when disabled

**Step 2 Test:**
1. Select "Analytical Thinking" → Next
2. Try clicking "Next" without selecting mode

**Expected Result:**
- "Next" button should be disabled again

**Step 3 Test:**
1. Select "Quick Practice" → Next
2. Click "Next" without changing voice settings

**Expected Result:**
- "Next" button should be enabled (voice settings are optional)
- Should navigate to interview page

---

### Test Case 4: Config Reset ✓

**Steps:**
1. Open the temporary local-only `SetupModal` harness
2. Configure a complete interview setup
3. Click "Reset Config" button
4. Open localStorage in browser console:
   ```javascript
   localStorage.getItem('meelni:setup-modal:last-config')
   ```

**Expected Result:**
- Should return `null` (config cleared from localStorage)
- Opening modal again should show empty selections

---

### Test Case 5: Dashboard Integration ✓

**Steps:**
1. Navigate to http://localhost:3001/dashboard
2. If first-time user (0 sessions):
   - Click "Start Your First Mock Interview" button
3. If returning user:
   - Check sidebar for "Start Interview" button

**Expected Result:**
- Setup modal should open
- Previous config should be loaded from localStorage
- Completing setup should navigate to interview

---

### Test Case 6: Voice Settings Update ✓

**Steps:**
1. Open the temporary local-only `SetupModal` harness
2. Open setup modal
3. Navigate to Step 3 (voice settings)
4. Click "Show Advanced Settings"
5. Change speed to 0.8x
6. Change emotion to "encouraging"
7. Complete setup

**Expected Result:**
- Config in localStorage should reflect:
  ```json
  {
    "voiceSettings": {
      "speed": 0.8,
      "emotion": "encouraging"
    }
  }
  ```

---

## Browser Console Testing Commands

### View Current Config
```javascript
JSON.parse(localStorage.getItem('meelni:setup-modal:last-config'))
```

### Clear Config
```javascript
localStorage.removeItem('meelni:setup-modal:last-config')
```

### Set Test Config
```javascript
localStorage.setItem('meelni:setup-modal:last-config', JSON.stringify({
  roundType: 'strategy',
  mode: 'learning',
  voiceSettings: {
    voice: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',
    speed: 1.1,
    emotion: 'friendly'
  }
}))
```

---

## Success Criteria Summary

- [x] `use-setup-modal` hook created with full API
- [x] localStorage saves config on every change
- [x] localStorage loads config on mount
- [x] Smart defaults work (immediate navigation)
- [x] Validation prevents invalid progression
- [x] SetupModal uses hook (no local state)
- [x] "Next" button disables when invalid
- [x] TypeScript compilation successful
- [x] No runtime errors

---

## Implementation Notes

**Files Created:**
- `/lib/hooks/use-setup-modal.ts` (218 lines)

**Files Modified:**
- `/components/dashboard/setup-modal.tsx` (removed local state, using hook props)
- `/app/dashboard/page.tsx` (integrated hook, added modal)
- `/components/dashboard/first-time-user-experience.tsx` (added onStartInterview prop)
- Temporary local-only `SetupModal` harness (updated to use the hook API)

**Key Features:**
1. **localStorage Key**: `'meelni:setup-modal:last-config'`
2. **Smart Defaults**: Immediate navigation with optimal config
3. **Validation**: Step-by-step validation with disabled buttons
4. **Type Safety**: Full TypeScript support with proper interfaces
5. **Error Handling**: Graceful fallback for corrupt localStorage data

**Time Spent:** ~2.5 hours

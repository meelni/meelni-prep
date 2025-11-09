# Sidebar Navigation Bug Investigation

## Debugging Plan

I'll add console logs to trace the state flow and test the actual behavior.

### Step 1: Add Console Logs to Sidebar

File: `/Users/REDACTED/conductor/meelni-prep/components/dashboard/layout/sidebar.tsx`

Add logging in the onClick handler (lines 168-174):

```typescript
onClick={() => {
  console.log('[SIDEBAR] Navigation item clicked:', item.id);
  console.log('[SIDEBAR] Current activeSection:', activeSection);
  console.log('[SIDEBAR] isRoute:', item.isRoute);
  if (item.isRoute) {
    router.push(`/${item.id}`);
  } else {
    console.log('[SIDEBAR] Calling setActiveSection with:', item.id);
    setActiveSection(item.id);
    console.log('[SIDEBAR] setActiveSection called');
  }
}}
```

### Step 2: Add Console Logs to Dashboard Page

File: `/Users/REDACTED/conductor/meelni-prep/app/dashboard/page.tsx`

Add logging:
1. After state declaration (line 22)
2. In renderSection function (line 71)

```typescript
// After line 22
const [activeSection, setActiveSection] = useState("overview");
console.log('[DASHBOARD] Current activeSection:', activeSection);

// In renderSection (line 71)
const renderSection = () => {
  console.log('[DASHBOARD] renderSection called with activeSection:', activeSection);
  // ... rest of function
}
```

### Step 3: Add useEffect to Track State Changes

```typescript
useEffect(() => {
  console.log('[DASHBOARD] activeSection changed to:', activeSection);
}, [activeSection]);
```

## Expected vs Actual Behavior

### Expected:
1. User clicks "Interview History" nav item
2. Console logs: `[SIDEBAR] Navigation item clicked: history`
3. Console logs: `[SIDEBAR] Calling setActiveSection with: history`
4. Console logs: `[DASHBOARD] activeSection changed to: history`
5. Console logs: `[DASHBOARD] renderSection called with activeSection: history`
6. HistorySection component renders
7. Active state styling appears on "Interview History" nav item

### Actual (to be determined):
- Will document what actually happens when testing

## Hypothesis Testing

### Hypothesis 1: State updates but visual feedback too subtle (5% opacity)
**Test**: Check if `bg-primary/5` is visible
**Evidence**: Inspect element, check computed styles
**Fix**: Increase opacity to `bg-primary/10` or `bg-primary/15`

### Hypothesis 2: State updates correctly but content doesn't re-render
**Test**: Check React DevTools for re-renders
**Evidence**: Console logs show state changes but UI doesn't update
**Fix**: Check if renderSection() is being memoized incorrectly

### Hypothesis 3: setActiveSection not being called
**Test**: Console logs show clicks but no setActiveSection calls
**Evidence**: Logs stop after click event
**Fix**: Check if event handler is correct

## Testing Checklist

- [ ] Add console logs to sidebar onClick handler
- [ ] Add console logs to dashboard page
- [ ] Open localhost:3000/dashboard in browser
- [ ] Open browser console
- [ ] Click each navigation item and document behavior:
  - [ ] Overview
  - [ ] Interview History
  - [ ] Analytics
  - [ ] Feedback
  - [ ] Settings
- [ ] Check React DevTools for component re-renders
- [ ] Inspect active nav item styling in browser DevTools
- [ ] Document exact console log output
- [ ] Identify root cause
- [ ] Propose fix

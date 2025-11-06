# NudgeOverlay Component Documentation

**Workstream #7**: Visual Nudge Overlay for Interview Page

## Overview

The `NudgeOverlay` component provides subtle, non-intrusive coaching nudges during live mock interviews. It displays toast-style notifications in the top-right corner and tracks framework coverage progress.

## Component Location

```
/components/interview/nudge-overlay.tsx
```

## Features

### 1. Toast-Style Nudge Notifications

- **Position**: Fixed top-right corner (below header, above content)
- **Design**: Glass morphism with backdrop blur, matching Meelni aesthetic
- **Colors**: Purple-blue primary accent (`--primary`)
- **Animations**: Smooth slide-in from right using Framer Motion spring physics
- **Auto-dismiss**: 5 seconds with visual countdown progress bar
- **Manual dismiss**: X button and Escape key support

### 2. Nudge Types

Each nudge type has a unique icon, color, and label:

| Type | Icon | Color | Label | Use Case |
|------|------|-------|-------|----------|
| `metric_missing` | 📊 TrendingUp | Blue | "Quantify" | User should add specific numbers/metrics |
| `move_on` | ⏭️ ArrowRight | Purple | "Move Forward" | Good progress, time to advance |
| `clarify_first` | ❓ HelpCircle | Amber | "Clarify" | User should ask clarifying questions |
| `framework_element` | 💡 Lightbulb | Primary | "Framework" | Specific framework element missing |

### 3. Framework Progress Indicator

Always-visible card showing:
- **Progress percentage**: Calculated from covered/total elements
- **Progress bar**: Animated gradient fill
- **Element dots**: Visual checkmarks (✅ covered, ⚪ not covered)
- **Element names**: Truncated labels (max 8 chars + ellipsis)

## TypeScript Interfaces

```typescript
export type NudgeType =
  | "metric_missing"
  | "move_on"
  | "clarify_first"
  | "framework_element";

export interface Nudge {
  type: NudgeType;
  message: string;
}

export interface FrameworkElement {
  name: string;
  covered: boolean;
}

export type FrameworkCoverage = FrameworkElement[];

interface NudgeOverlayProps {
  nudge: Nudge | null;
  frameworkCoverage: FrameworkCoverage;
  onDismiss: () => void;
}
```

## Integration with Interview Page

### State Management

```typescript
const [currentNudge, setCurrentNudge] = useState<Nudge | null>(null);
const [frameworkCoverage, setFrameworkCoverage] = useState<FrameworkCoverage>([]);
```

### API Integration

When a user finishes speaking, the interview page calls the nudge analysis API:

```typescript
const analyzeForNudges = async (turn: TranscriptTurn) => {
  const response = await fetch("/api/nudges/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionId!,
      interviewType: session!.config.roundType,
      currentTurn: {
        speaker: turn.speaker,
        text: turn.text,
        timestamp: turn.timestamp,
      },
      timeElapsed: Math.floor(
        (new Date().getTime() - new Date(session!.started_at).getTime()) / 1000
      ),
    }),
  });

  const data = await response.json();

  // Update framework coverage
  if (data.frameworkCoverage) {
    setFrameworkCoverage(data.frameworkCoverage);
  }

  // Display nudge if applicable
  if (data.shouldNudge && data.nudgeType && data.message) {
    setCurrentNudge({
      type: data.nudgeType,
      message: data.message,
    });
  }
};
```

### Component Usage

```tsx
<NudgeOverlay
  nudge={currentNudge}
  frameworkCoverage={frameworkCoverage}
  onDismiss={() => setCurrentNudge(null)}
/>
```

## Visual Design

### Colors (Meelni Palette)

- **Primary**: `oklch(0.70 0.22 285)` (purple-blue)
- **Card background**: `bg-card/95` with `backdrop-blur-md`
- **Border**: `border-border`
- **Text**: `text-foreground` (primary), `text-muted-foreground` (secondary)

### Spacing & Layout

- **Gap between nudge and progress**: `gap-3` (0.75rem)
- **Card padding**: `p-4` (1rem)
- **Icon size**: `w-5 h-5` (20px)
- **Progress bar height**: `h-2` (8px)
- **Element dot size**: `w-5 h-5` (20px)

### Animations

- **Slide in**: `x: 100 → 0` with spring physics (stiffness: 300, damping: 25)
- **Slide out**: `x: 0 → 50` with ease-out (duration: 0.2s)
- **Dot pulse**: `scale: [1, 1.2, 1]` on coverage (duration: 0.3s)
- **Progress bar**: Spring animation (stiffness: 200, damping: 25)
- **Auto-dismiss bar**: Linear 5-second countdown

## Accessibility

### Keyboard Support

- **Escape key**: Dismisses current nudge
- Event listener is automatically cleaned up on unmount

### Screen Reader Support

- **role="alert"**: Announces new nudges to screen readers
- **aria-live="polite"**: Non-intrusive announcements
- **aria-atomic="true"**: Reads entire nudge message
- **aria-label**: All interactive elements labeled
- **sr-only div**: Announces framework progress changes

### Reduced Motion

The component uses Framer Motion, which automatically respects the user's `prefers-reduced-motion` setting.

## Testing

### Manual Testing

Use the test demo component for visual QA:

```tsx
import { NudgeOverlayTestDemo } from "@/components/interview/nudge-overlay.test-demo";

// In a test page
<NudgeOverlayTestDemo />
```

**Test scenarios**:
1. Click each nudge type button to see different icons/colors
2. Toggle framework elements to see progress update
3. Verify auto-dismiss after 5 seconds
4. Verify manual dismiss with X button
5. Verify Escape key dismisses nudge
6. Check responsive layout on mobile

### Automated Testing (Future)

Recommended tests:
- Component renders without errors
- Nudge displays with correct icon/color for each type
- Framework coverage calculates percentage correctly
- Auto-dismiss timer works (mock setTimeout)
- Escape key handler fires onDismiss
- Accessibility attributes present

## Performance Considerations

### 60fps Animations

- Uses Framer Motion's hardware-accelerated transforms
- Spring animations use GPU-accelerated `transform` properties
- Backdrop blur may be expensive on low-end devices (consider fallback)

### Memory Management

- Event listeners cleaned up in `useEffect` cleanup functions
- Timers cleared on component unmount
- No memory leaks from unclosed subscriptions

### Rendering Optimization

- Component only re-renders when `nudge` or `frameworkCoverage` change
- Progress bar uses `motion.div` for optimized animations
- No unnecessary DOM manipulations

## Mobile Responsiveness

### Breakpoints

- **Mobile**: Full width with reduced padding
- **Desktop**: Max width `max-w-sm` (24rem / 384px)

### Touch Support

- **Dismiss button**: Large touch target (min 44x44px)
- **No hover states**: Uses active states for mobile

### Position Adjustments

- **Top offset**: `top-20` (5rem) to avoid header
- **Right offset**: `right-4` (1rem) for breathing room

## Integration Checklist

- [x] Component created with TypeScript types
- [x] Framer Motion animations configured
- [x] Accessibility features implemented
- [x] Integrated into interview page
- [x] API call added to `handleTranscriptUpdate`
- [x] State management set up
- [x] Test demo component created
- [ ] Backend API endpoint implemented (`/api/nudges/analyze`)
- [ ] Framework tracker logic built
- [ ] Nudge decision engine implemented

## API Contract

### Request Format

```typescript
POST /api/nudges/analyze
{
  sessionId: string;
  interviewType: "product_sense" | "analytical" | "leadership" | "strategy";
  currentTurn: {
    speaker: "user" | "interviewer";
    text: string;
    timestamp: Date;
  };
  timeElapsed: number; // seconds since session start
}
```

### Response Format

```typescript
{
  shouldNudge: boolean;
  nudgeType?: "metric_missing" | "move_on" | "clarify_first" | "framework_element";
  message?: string;
  frameworkCoverage: Array<{
    name: string;
    covered: boolean;
  }>;
}
```

## Future Enhancements

### Planned Features

1. **Nudge history**: Show last 3 nudges in collapsible panel
2. **Nudge preferences**: User can disable certain nudge types
3. **Analytics**: Track nudge effectiveness (did user improve after nudge?)
4. **Smart timing**: Delay nudges if user is mid-sentence
5. **Context-aware**: Different nudges for different interview modes

### Potential Improvements

- **Sound effects**: Subtle audio cue when nudge appears (optional)
- **Haptic feedback**: Vibration on mobile devices
- **Theme variants**: Light/dark mode optimizations
- **Animation presets**: User can choose animation style
- **Persistent progress**: Save framework coverage across sessions

## Constraints & Limitations

### Current Constraints

- **No interruption**: Nudges don't interrupt user speech
- **One at a time**: Only one nudge visible at a time
- **5-second timeout**: Fixed duration (not configurable)
- **Top-right only**: Fixed position (not customizable)

### Known Limitations

- **Backdrop blur performance**: May lag on low-end devices
- **No mobile optimization**: Progress indicator may be cramped on small screens
- **No nudge queue**: If multiple nudges triggered, only latest shown
- **No undo**: Can't bring back a dismissed nudge

## Troubleshooting

### Common Issues

**Issue**: Nudges not appearing
- Check API endpoint is implemented
- Verify `sessionId` and `interviewType` are valid
- Check browser console for fetch errors

**Issue**: Animations stuttering
- Reduce `backdrop-blur-md` to `backdrop-blur-sm`
- Check for React DevTools Profiler bottlenecks
- Ensure GPU acceleration enabled in browser

**Issue**: Escape key not working
- Check no other components capturing Escape
- Verify event listener attached (check React DevTools)

**Issue**: Progress bar not updating
- Verify `frameworkCoverage` prop changing
- Check `setFrameworkCoverage` called in API response handler

## Related Files

- `/app/interview/page.tsx` - Main integration point
- `/components/interview/nudge-overlay.test-demo.tsx` - Test component
- `/lib/animations.ts` - Shared animation variants
- `/app/globals.css` - Color tokens and design system

## Dependencies

- `framer-motion` - Animations
- `lucide-react` - Icons
- `react` - Component library
- `tailwindcss` - Styling

## Credits

- **Design inspiration**: Linear, Notion toast notifications
- **Animation physics**: Framer Motion spring presets
- **Accessibility**: WCAG 2.1 AA compliance

# Confetti Component

Canvas-based confetti particle system with realistic physics for celebrating user achievements.

## Features

- **High Performance**: Canvas-based rendering targets 60fps with 150 particles
- **Realistic Physics**: Gravity, wind, rotation, and friction simulation
- **Accessible**: Respects `prefers-reduced-motion` system preference
- **Non-Blocking**: Overlays content without blocking interactions
- **Auto-Cleanup**: Removes particles and stops animation when complete

## Usage

```tsx
import { Confetti } from '@/components/ui/confetti';

// Basic usage
<Confetti trigger={true} />

// With custom options
<Confetti
  trigger={isOpen}
  duration={3000}
  particleCount={150}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `trigger` | `boolean` | required | When true, starts confetti animation |
| `duration` | `number` | `3000` | Animation duration in milliseconds |
| `particleCount` | `number` | `150` | Number of confetti particles |

## Animation Details

### Physics Parameters

```typescript
const GRAVITY = 0.5;        // Downward acceleration
const WIND = 0.1;           // Horizontal drift
const FRICTION = 0.99;      // Velocity decay
```

### Particle Properties

- **Launch Pattern**: Upward cone from bottom-center
- **Initial Velocity**: 10-20 pixels/frame with -15 upward boost
- **Angle Spread**: ±90° from vertical
- **Rotation**: Random spin with varying speeds
- **Size Range**: 8-16 pixels
- **Shapes**: 40% circles, 30% squares, 30% rectangles

### Color Palette

Uses design system primary colors:
- `oklch(0.70 0.22 285)` - Primary
- `oklch(0.75 0.20 290)` - Primary Light
- `oklch(0.65 0.24 280)` - Primary Dark
- `oklch(0.80 0.15 300)` - Accent
- `oklch(0.85 0.10 310)` - Accent Light
- `oklch(0.65 0.25 241)` - Chart-1

## Performance

### Optimization Techniques

1. **Single Canvas**: One canvas element for all particles
2. **Particle Culling**: Removes off-screen and transparent particles
3. **Frame Targeting**: Uses requestAnimationFrame for 60fps
4. **Automatic Cleanup**: Stops animation loop when particles are gone

### Performance Metrics

- **Frame Rate**: 60fps
- **Particle Count**: 150
- **Animation Duration**: 3000ms
- **Canvas Operations**: ~180 frames total

## Accessibility

### Reduced Motion Support

Automatically detects and respects system preference:

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;
```

When reduced motion is preferred:
- Component returns `null` (no render)
- No alternative animation needed
- Modal/UI remains fully functional

### Interaction Safety

- Canvas has `pointer-events: none`
- Users can interact with underlying content
- High z-index but non-interactive

## Technical Implementation

### Canvas Setup

```typescript
const canvas = canvasRef.current;
const ctx = canvas.getContext('2d');

// Resize to match container
canvas.width = canvas.parentElement.offsetWidth;
canvas.height = canvas.parentElement.offsetHeight;
```

### Particle System

```typescript
interface Particle {
  x: number;           // Position X
  y: number;           // Position Y
  vx: number;          // Velocity X
  vy: number;          // Velocity Y
  rotation: number;    // Current rotation angle
  rotationSpeed: number; // Rotation velocity
  color: string;       // Particle color (oklch)
  shape: 'circle' | 'square' | 'rectangle';
  size: number;        // Particle size (8-16px)
  opacity: number;     // Current opacity (0-1)
}
```

### Animation Loop

```typescript
const animate = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles = particles.filter((particle) => {
    // Update physics
    particle.vy += GRAVITY;
    particle.vx *= FRICTION;
    particle.vy *= FRICTION;
    particle.vx += WIND;

    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.rotationSpeed;

    // Fade out
    if (elapsed > 2000) {
      particle.opacity = Math.max(0, 1 - (elapsed - 2000) / 1000);
    }

    // Draw particle
    drawParticle(ctx, particle);

    // Keep if still visible and on-screen
    return particle.opacity > 0 && isOnScreen(particle);
  });

  if (particles.length > 0) {
    requestAnimationFrame(animate);
  }
};
```

## Examples

### Celebration Modal

```tsx
<Dialog.Content>
  {sessionData.isFirstSession && (
    <Confetti trigger={isOpen} duration={3000} particleCount={150} />
  )}
  {/* Modal content */}
</Dialog.Content>
```

### Achievement Toast

```tsx
<Toast>
  <Confetti trigger={showToast} duration={2000} particleCount={100} />
  {/* Toast content */}
</Toast>
```

### Success Page

```tsx
<div className="relative">
  <Confetti trigger={true} duration={4000} particleCount={200} />
  <SuccessMessage />
</div>
```

## Browser Compatibility

- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)
- ⚠️ Requires Canvas API support
- ⚠️ Requires requestAnimationFrame support

## Testing

Visit `/test-celebration` to test confetti:

1. Select "First Session" scenario
2. Click "Show Celebration Modal"
3. Observe confetti bursting from bottom-center
4. Verify 3-second animation with fade-out

Test reduced motion:
1. Enable reduced motion in system preferences
2. Reload page
3. Open modal
4. Verify no confetti appears

## Future Enhancements

Potential improvements:
- [ ] Sound effect (subtle pop on launch)
- [ ] Different launch patterns (fireworks, spiral, etc.)
- [ ] Particle trails or glow effects
- [ ] Customizable color palettes
- [ ] Multiple burst sources
- [ ] Emoji confetti (🎉🎊⭐)

# Typography System

This document outlines the typography system implemented across the landing page.

## Font Families

### 1. Everett (Display Font)
- **Usage**: Large headings (H1, H2, hero titles)
- **Weight**: 300 (Light)
- **Variable**: `--font-everett`
- **Fallback**: Public Sans (Google Fonts)
- **CSS Class**: `font-display`

### 2. Public Sans (UI Font)
- **Usage**: Body text, labels, buttons, navigation
- **Weights**: 400 (Regular), 600 (Semibold)
- **Variable**: `--font-public-sans`
- **Source**: Google Fonts
- **CSS Class**: `font-sans`

### 3. CommitMono (Monospace Font)
- **Usage**: Code blocks, number badges, technical elements
- **Weight**: 400 (Regular)
- **Variable**: `--font-commit-mono`
- **Fallback**: System monospace fonts
- **CSS Class**: `font-mono`

## Typography Scale

### Display Text (Everett)

#### Extra Large Display
```css
.text-display-xl {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 48px;
  line-height: 48px;
}
```
**Usage**: Hero titles, main landing page headline

#### Large Display
```css
.text-display-lg {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 36px;
  line-height: 40px;
}
```
**Usage**: Section headings (Features, CTA)

### UI Text (Public Sans)

#### Label
```css
.text-label {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 12px;
  line-height: 16px;
}
```
**Usage**: Pills, badges, small labels, tags

#### Body
```css
.text-body {
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: 14px;
  line-height: 20px;
}
```
**Usage**: Paragraph text, descriptions, helper text, footer links

### Code/Mono (CommitMono)

#### Code
```css
.text-code {
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
}
```
**Usage**: Code blocks, inline code

#### Code Small
```css
.text-code-sm {
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 14px;
  line-height: 21px;
}
```
**Usage**: Number badges (feature cards), small code snippets

## Component Typography Mapping

### Hero Section
- **Hero Title**: `.text-display-xl` (Everett 300, 48px/48px)
- **Hero Description**: `.text-body` (Public Sans 400, 14px/20px)
- **Pill Badge ("New")**: `.text-label` (Public Sans 600, 12px/16px)
- **Helper Text**: `.text-body` (Public Sans 400, 14px/20px)

### Features Section
- **Section Heading**: `.text-display-lg` (Everett 300, 36px/40px)
- **Section Description**: `.text-body` (Public Sans 400, 14px/20px)
- **Feature Card Title**: Custom `text-[20px] leading-[28px] font-sans font-semibold`
- **Feature Card Description**: `.text-body` (Public Sans 400, 14px/20px)
- **Number Badge**: `.text-code-sm` (CommitMono 400, 14px/21px)

### Header/Navigation
- **Brand Name**: Custom `text-[18px] leading-[24px] font-sans font-semibold`
- **CTA Button**: Body text with semibold weight

### CTA Section
- **CTA Heading**: `.text-display-lg` (Everett 300, 36px/40px)
- **CTA Button**: `.text-body font-sans font-semibold`

### Footer
- **Brand Name**: Custom `text-[18px] leading-[24px] font-sans font-semibold`
- **Footer Links**: `.text-body font-sans font-normal`
- **Bottom Text**: `.text-body font-sans font-normal`
- **Large Brand Text**: `font-mono` (CommitMono)

## Implementation Guidelines

### Using Typography Classes

**Good Example** (Using utility classes):
```jsx
<h1 className="text-display-xl font-display font-light">
  Your Headline
</h1>
```

**Also Good** (Semantic HTML with classes):
```jsx
<p className="text-body text-muted-foreground">
  Your body text here
</p>
```

### Custom Typography

For one-off sizes not in the scale:
```jsx
<h3 className="text-[20px] leading-[28px] font-sans font-semibold">
  Custom Heading
</h3>
```

### Responsive Typography

Use responsive modifiers when needed:
```jsx
<h1 className="text-display-xl md:text-[56px] md:leading-[56px]">
  Responsive Headline
</h1>
```

## Font Loading

### Public Sans (Google Fonts)
Loaded automatically via `next/font/google` in `app/layout.tsx`:
```tsx
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-public-sans",
  display: "swap",
});
```

### Everett & CommitMono (Local Fonts)
Loaded via `next/font/local` in `app/layout.tsx`:
```tsx
const everett = localFont({
  src: [{ path: "../public/fonts/everett-light.woff2", weight: "300" }],
  variable: "--font-everett",
  display: "swap",
});

const commitMono = localFont({
  src: [{ path: "../public/fonts/commit-mono-regular.woff2", weight: "400" }],
  variable: "--font-commit-mono",
  display: "swap",
});
```

**Note**: Font files must be placed in `/public/fonts/` directory. See `/public/fonts/README.md` for details.

## Accessibility

- All font sizes meet WCAG AA standards for readability
- Line heights provide adequate spacing for comfortable reading
- Font weights ensure sufficient contrast and legibility
- `font-display: swap` prevents FOIT (Flash of Invisible Text)

## Performance

- Fonts are loaded with `display: swap` strategy
- `.woff2` format for optimal compression (for local fonts)
- Google Fonts uses automatic font subsetting
- Font variables reduce CSS bundle size

## Maintenance

When updating typography:
1. Update size/weight in `globals.css` utility classes
2. Update this documentation
3. Check all components for consistency
4. Test on multiple screen sizes
5. Verify accessibility with WAVE or similar tools

## Checklist for New Components

- [ ] Use semantic HTML elements (h1-h6, p, span, etc.)
- [ ] Apply appropriate typography utility classes
- [ ] Ensure responsive behavior if needed
- [ ] Test readability on light and dark backgrounds
- [ ] Verify line length doesn't exceed 75 characters for body text
- [ ] Check spacing around text elements (margin/padding)

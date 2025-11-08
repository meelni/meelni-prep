# Question Bank Redesign - UX & Visual Design Specifications

**Project**: Meelni Question Bank Modernization (GitHub Issue #95)
**Version**: 1.0.0
**Date**: 2025-11-07
**Designer**: UI Design Agent

---

## Executive Summary

This document provides comprehensive UX and visual design specifications for modernizing the Question Bank page from a standalone table view to an integrated dashboard experience with Linear/Notion-inspired aesthetics. The redesign addresses missing sidebar navigation, outdated table design, poor mobile experience, and adds advanced interaction patterns for question discovery and practice management.

**Key Improvements:**
- Sidebar + toolbar layout integration (consistent with tactical dashboard)
- Modern table design with subtle interactions
- Mobile-first card layout for < 768px screens
- Hover preview for question exploration without commitment
- Bulk actions for bookmark/practice set creation
- Quick filter tags for improved discoverability
- Enhanced search with autocomplete

---

## Table of Contents

1. [UX Specifications](#1-ux-specifications)
   - 1.1 User Flows
   - 1.2 Interaction Patterns
   - 1.3 Mobile Card Layout
   - 1.4 Empty & Loading States
2. [Visual Design Specifications](#2-visual-design-specifications)
   - 2.1 Table Modernization
   - 2.2 Component Styling
   - 2.3 Animation Choreography
   - 2.4 Responsive Breakpoints
3. [Design System Extensions](#3-design-system-extensions)
   - 3.1 Color Tokens
   - 3.2 New Component Variants
   - 3.3 Typography Scale
4. [Implementation Notes](#4-implementation-notes)
   - 4.1 Technical Considerations
   - 4.2 Accessibility Requirements
   - 4.3 Performance Optimizations

---

## 1. UX Specifications

### 1.1 User Flows

#### Primary Flow: Question Discovery → Practice
```
Dashboard → Questions (sidebar)
   ↓
Questions Page Loads (500 questions displayed)
   ↓
User applies Quick Filter ("FAANG" tag)
   ↓ (filters to ~200 questions)
User hovers over question row → Preview tooltip appears
   ↓ (sees full question text, metadata, similar questions count)
User clicks "Try Question" → Navigates to /interview with smart defaults
```

#### Secondary Flow: Bulk Bookmark for Later
```
Questions Page
   ↓
User enables Selection Mode (checkbox appears in table header)
   ↓
User selects 5 questions (checkboxes in each row)
   ↓
Floating Action Toolbar appears at bottom
   ↓
User clicks "Bookmark Selected" → Success toast confirmation
   ↓
User navigates to Dashboard → "Bookmarked" section shows 5 items
```

#### Tertiary Flow: Mobile Card Browsing
```
Mobile User (<768px) visits Questions Page
   ↓
Card grid layout displays (2 columns on phones, 3 on tablets)
   ↓
User taps filter drawer icon → Bottom sheet appears
   ↓
User selects "Product Sense" + "Meta" → Drawer closes
   ↓
Grid updates to show 15 filtered questions
   ↓
User swipes right on card → "Bookmark" action revealed
   ↓
User taps "Try Question" → Interview starts
```

---

### 1.2 Interaction Patterns

#### 1.2.1 Hover Preview (Desktop)

**Decision**: Tooltip-style preview on hover (not modal or inline expansion)

**Rationale**:
- Modal interrupts browsing flow; inline expansion shifts table layout
- Tooltip provides contextual preview without commitment
- User can continue browsing with minimal friction

**Interaction Spec**:
- **Trigger**: Hover on question text for 300ms (debounced)
- **Position**: Bottom-left aligned to cursor (with collision detection)
- **Content**:
  - Full question text (no line-clamp)
  - Company badge + Asked date
  - Question type badge
  - "3 similar questions" link (micro-interaction)
- **Dismissal**: Mouse leave (200ms delay) or click outside
- **Animation**: `scaleIn` from Framer Motion presets (0.2s)

**Visual Treatment**:
```tsx
// Tooltip styling
className="
  max-w-md p-4
  bg-popover border border-border rounded-lg
  shadow-xl shadow-primary/5
  z-50
"
```

#### 1.2.2 Bulk Actions

**Decision**: Checkbox selection with floating action toolbar

**Rationale**:
- Familiar pattern (Gmail, Linear, Notion)
- Non-intrusive when not in use
- Clear visual feedback for selected state

**Interaction Spec**:

**Selection Mode Activation**:
- Click "Select" button in toolbar OR
- Shift+Click any question row

**Visual Feedback**:
- Checkbox appears in first column (fade-in 150ms)
- Selected rows: `bg-primary/5` with `border-l-2 border-primary`
- Selection count badge in toolbar: `3 questions selected`

**Floating Action Toolbar**:
- Appears at bottom center when ≥1 selected (slide up 300ms)
- Sticky positioning: `bottom-6` with `backdrop-blur-xl`
- Actions: "Bookmark", "Create Practice Set", "Deselect All"
- Design matches sidebar gradient button style

**Deselection**:
- Click "Deselect All" OR
- Press Escape key OR
- Click outside table + toolbar

#### 1.2.3 Quick Filters

**Decision**: Tag pills above table (not dropdown)

**Rationale**:
- Immediate visibility of available filters
- Multiple filters can be active simultaneously
- Faster interaction than dropdown (1 click vs 2)

**Filter Categories**:

1. **Recency** (mutually exclusive):
   - "Last 6 Months" (default)
   - "Last Year"
   - "All Time"

2. **Company Groups** (multi-select):
   - "FAANG" (Meta, Apple, Amazon, Netflix, Google)
   - "Big Tech" (Microsoft, Tesla, Uber, Airbnb)
   - "Startups" (companies with <500 questions)

3. **Practice Areas** (multi-select):
   - "My Weak Areas" (based on past scores - future feature)
   - "New Questions" (added in last 30 days)
   - "Popular" (tried >100 times across users)

**Visual Treatment**:
- Pills: `px-3 py-1.5 rounded-full border text-xs`
- Active state: `bg-primary text-primary-foreground`
- Inactive state: `bg-card border-border text-muted-foreground hover:border-primary/50`
- Layout: Horizontal scroll on mobile, wrap on desktop

**Interaction**:
- Single click to toggle
- Active filter count badge on "Filters" button: `(3)`
- Clear all button appears when ≥1 filter active

#### 1.2.4 Search Autocomplete

**Decision**: Dropdown with highlighted matches (max 8 suggestions)

**Rationale**:
- Helps discovery of question phrasing patterns
- Shows company coverage (e.g., "Meta" appears in 42 questions)
- Reduces typing friction

**Autocomplete Behavior**:
- Triggers after 2 characters typed (200ms debounce)
- Searches: question text, company name, question type
- Groups results: Companies (top 3) → Question Text (top 5)
- Keyboard navigation: Arrow keys + Enter to select
- Click outside or Escape to dismiss

**Visual Treatment**:
```tsx
// Dropdown styling
className="
  absolute top-full mt-2 w-full
  bg-popover border border-border rounded-lg
  shadow-lg max-h-80 overflow-y-auto
  divide-y divide-border
"

// Group header
<div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
  Companies (3)
</div>

// Suggestion item with highlighted match
<div className="px-3 py-2 hover:bg-primary/5 cursor-pointer">
  <span className="text-sm text-foreground">
    How would you improve <mark className="bg-primary/20">Meta</mark>'s feed algorithm?
  </span>
</div>
```

---

### 1.3 Mobile Card Layout

**Breakpoint**: < 768px

**Layout Structure**:

**Grid**: 1 column (320px-480px), 2 columns (480px-768px)
- Gap: `gap-4` (16px)
- Padding: `px-4 py-6`

**Card Anatomy** (top to bottom):
```
┌─────────────────────────────────────┐
│ [Company Badge]     [Date Badge]    │ ← Flex justify-between
├─────────────────────────────────────┤
│ How would you improve Instagram's   │
│ Reels feature to increase...        │ ← 3-line clamp, text-sm
├─────────────────────────────────────┤
│ [Product Sense Badge]               │ ← Type badge
├─────────────────────────────────────┤
│         [Try Question Button]       │ ← Full-width CTA
└─────────────────────────────────────┘
```

**Card Dimensions**:
- Min-height: `180px`
- Padding: `p-4`
- Border: `border border-border rounded-lg`
- Background: `bg-card`

**Touch Target Optimization**:
- "Try Question" button: `h-11` (44px minimum)
- Card padding: `p-4` (16px prevents edge misclicks)
- Swipe gesture area: Full card width × 60% height (middle portion)

**Swipe Interaction** (optional enhancement):
- Swipe left: Reveal "Bookmark" action (destructive red background)
- Swipe right: Reveal "Share" action (blue background)
- Threshold: 80px swipe distance
- Animation: Spring physics (`stiffness: 300, damping: 30`)

**Mobile Filter UI**:
- **Drawer Pattern**: Bottom sheet modal (60% viewport height)
- **Trigger**: Filter icon button in toolbar (with active count badge)
- **Content**:
  - Search input (sticky at top)
  - Quick filter pills (scrollable)
  - Type toggles (vertical list)
  - Sort dropdown
- **Actions**: "Apply Filters" primary button, "Clear All" ghost button
- **Animation**: Slide up from bottom (300ms ease-out)

---

### 1.4 Empty & Loading States

#### Loading States

**Skeleton Loader Pattern** (not spinner):

**Table View** (desktop):
```tsx
// Skeleton row (repeat 10x)
<tr className="animate-pulse">
  <td className="px-6 py-4">
    <div className="h-4 bg-muted/50 rounded w-3/4" />
    <div className="h-3 bg-muted/30 rounded w-1/2 mt-2" />
  </td>
  <td className="px-6 py-4">
    <div className="h-6 bg-muted/50 rounded-full w-24" />
  </td>
  <td className="px-6 py-4">
    <div className="h-4 bg-muted/50 rounded w-20" />
  </td>
  <td className="px-6 py-4">
    <div className="h-4 bg-muted/50 rounded w-24" />
  </td>
  <td className="px-6 py-4 text-right">
    <div className="h-9 bg-muted/50 rounded w-32 ml-auto" />
  </td>
</tr>
```

**Card View** (mobile):
```tsx
// Skeleton card (repeat 6x)
<div className="p-4 border border-border rounded-lg animate-pulse">
  <div className="flex justify-between mb-3">
    <div className="h-5 bg-muted/50 rounded-full w-20" />
    <div className="h-5 bg-muted/50 rounded-full w-24" />
  </div>
  <div className="space-y-2 mb-4">
    <div className="h-4 bg-muted/50 rounded w-full" />
    <div className="h-4 bg-muted/50 rounded w-4/5" />
    <div className="h-4 bg-muted/50 rounded w-3/5" />
  </div>
  <div className="h-6 bg-muted/50 rounded-full w-28 mb-3" />
  <div className="h-11 bg-muted/50 rounded w-full" />
</div>
```

**Progressive Loading**:
- Initial load: Show skeleton for 500ms minimum (prevents flash)
- Filter change: Fade out → skeleton → fade in new results (300ms transitions)
- Search typing: Debounce 300ms before showing skeleton

#### Empty States

**No Search Results**:
```tsx
<div className="py-16 text-center">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
    <Search className="w-8 h-8 text-muted-foreground/50" />
  </div>
  <h3 className="text-lg font-medium text-foreground mb-2">
    No questions found
  </h3>
  <p className="text-sm text-muted-foreground mb-6">
    Try adjusting your search or filters
  </p>
  <Button variant="outline" onClick={clearFilters}>
    Clear Filters
  </Button>
</div>
```

**No Filter Matches**:
```tsx
<div className="py-16 text-center">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
    <Filter className="w-8 h-8 text-muted-foreground/50" />
  </div>
  <h3 className="text-lg font-medium text-foreground mb-2">
    No questions match these filters
  </h3>
  <p className="text-sm text-muted-foreground mb-6">
    {selectedType !== "All Types" && `Try selecting "All Types" or `}
    adjust your company filters
  </p>
  <div className="flex gap-3 justify-center">
    <Button variant="outline" onClick={clearFilters}>
      Clear All Filters
    </Button>
    <Button onClick={() => router.push("/dashboard")}>
      Back to Dashboard
    </Button>
  </div>
</div>
```

**First-Time User** (no bookmarks, no history):
```tsx
<div className="py-16 text-center">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
    <Sparkles className="w-8 h-8 text-primary" />
  </div>
  <h3 className="text-lg font-medium text-foreground mb-2">
    Welcome to the Question Bank
  </h3>
  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
    Browse 2,879 real PM interview questions from top companies.
    Click "Try Question" to start practicing immediately.
  </p>
  <Button onClick={() => setSelectedType("Product Sense")}>
    Explore Product Sense Questions
  </Button>
</div>
```

---

## 2. Visual Design Specifications

### 2.1 Table Modernization (Desktop)

#### Border & Spacing Strategy

**Design Philosophy**: Subtle, not prominent. Let content breathe.

**Table Container**:
```css
/* Outer container */
.table-container {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg); /* 0.625rem */
  overflow: hidden; /* Clip rounded corners */
}
```

**Table Structure**:
```css
/* Table element */
table {
  width: 100%;
  border-collapse: separate; /* Allow row borders */
  border-spacing: 0;
}

/* Header row */
thead tr {
  background: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid hsl(var(--border));
}

thead th {
  padding: 12px 24px;
  text-align: left;
  font-size: 0.75rem; /* 12px */
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

/* Body rows */
tbody tr {
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  transition: background-color 150ms ease, border-color 150ms ease;
}

tbody tr:last-child {
  border-bottom: none; /* Remove border on last row */
}

/* Row hover state */
tbody tr:hover {
  background: hsl(var(--primary) / 0.03);
  border-color: hsl(var(--primary) / 0.2);
}

tbody td {
  padding: 16px 24px;
  font-size: 0.875rem; /* 14px */
  color: hsl(var(--foreground));
}
```

#### Typography Hierarchy

**Question Text** (primary content):
```css
.question-text {
  font-family: var(--font-sans);
  font-size: 0.875rem; /* 14px */
  font-weight: 400;
  line-height: 1.5;
  color: hsl(var(--foreground));

  /* Clamp to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Hover state - show emphasis */
tr:hover .question-text {
  color: hsl(var(--primary));
  font-weight: 500; /* Subtle weight increase */
}
```

**Metadata** (company, date):
```css
.metadata-text {
  font-family: var(--font-sans);
  font-size: 0.875rem; /* 14px */
  font-weight: 400;
  color: hsl(var(--muted-foreground));

  display: flex;
  align-items: center;
  gap: 8px;
}

.metadata-icon {
  width: 16px;
  height: 16px;
  opacity: 0.6;
}
```

**Column Headers**:
```css
.column-header {
  font-family: var(--font-sans);
  font-size: 0.75rem; /* 12px */
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
```

#### Badge Redesign

**Goal**: Subtle, not overwhelming. Match tactical dashboard aesthetic.

**Type Badges** (refined color palette):
```tsx
const BADGE_STYLES = {
  "Product Sense": "bg-purple-500/8 text-purple-600 dark:text-purple-400 border border-purple-500/20",
  "Behavioral": "bg-blue-500/8 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  "Execution": "bg-green-500/8 text-green-600 dark:text-green-400 border border-green-500/20",
  "Product Strategy": "bg-orange-500/8 text-orange-600 dark:text-orange-400 border border-orange-500/20",
};

// Badge component
<Badge
  variant="outline"
  className={cn(
    "text-xs font-medium px-2.5 py-0.5 rounded-full",
    BADGE_STYLES[questionType]
  )}
>
  {questionType}
</Badge>
```

**Company Badges**:
```css
/* Minimal design with icon */
.company-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

.company-icon {
  width: 16px;
  height: 16px;
  opacity: 0.5;
}
```

**Date Badges**:
```css
/* Same style as company */
.date-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

.date-icon {
  width: 16px;
  height: 16px;
  opacity: 0.5;
}
```

#### Sticky Header Treatment

**Visual Hierarchy**: Header should feel elevated when scrolling.

```css
thead {
  position: sticky;
  top: 0; /* Stick to top of table container */
  z-index: 10;

  /* Glassmorphism effect */
  background: hsl(var(--card) / 0.8);
  backdrop-filter: blur(12px);

  /* Subtle elevation shadow */
  box-shadow: 0 1px 0 0 hsl(var(--border)),
              0 2px 8px -2px hsl(var(--foreground) / 0.05);
}
```

**Scroll Indicator** (optional progressive enhancement):
- Fade gradient at top of table body when scrolled
- `linear-gradient(to bottom, hsl(var(--card)) 0%, transparent 24px)`

#### Cell Padding & Row Height

**Optimal Reading Density**:
- **Row height**: 64px (comfortable scanning)
- **Cell padding**: `16px (top/bottom) × 24px (left/right)`
- **Question cell**: Wider left padding for visual hierarchy

**Responsive Adjustments**:
```css
/* Desktop (> 1024px) */
tbody td {
  padding: 16px 24px;
}

/* Tablet (768px - 1024px) */
@media (max-width: 1024px) {
  tbody td {
    padding: 12px 16px;
  }
}

/* Hide less critical columns on tablet */
@media (max-width: 1024px) {
  .hide-on-tablet {
    display: none;
  }
}
```

---

### 2.2 Component Specifications

#### Updated Badge Component

**New Variant**: `subtle` for question types

```tsx
// Add to /components/ui/badge.tsx
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-green-500 text-white",
        subtle: "border bg-opacity-10", // NEW: for question types
      },
    },
  }
);
```

**Usage**:
```tsx
<Badge variant="subtle" className="bg-purple-500/8 text-purple-600 border-purple-500/20">
  Product Sense
</Badge>
```

#### Table Cell Components

**QuestionCell** - Reusable question text cell:
```tsx
function QuestionCell({
  text,
  highlight = false
}: {
  text: string;
  highlight?: boolean;
}) {
  return (
    <div className="max-w-md">
      <p className={cn(
        "text-sm line-clamp-2 transition-all duration-150",
        highlight
          ? "text-primary font-medium"
          : "text-foreground"
      )}>
        {text}
      </p>
    </div>
  );
}
```

**MetadataCell** - Icon + text pattern:
```tsx
function MetadataCell({
  icon: Icon,
  text
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="w-4 h-4 opacity-60" />
      <span>{text}</span>
    </div>
  );
}
```

#### Action Buttons Styling

**"Try Question" Primary CTA**:
```tsx
<Button
  size="sm"
  className="gap-2"
  onClick={handleTryQuestion}
>
  <Play className="w-4 h-4" />
  Try Question
</Button>
```

**Bulk Action Toolbar**:
```tsx
<motion.div
  initial={{ y: 100, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 100, opacity: 0 }}
  className="
    fixed bottom-6 left-1/2 -translate-x-1/2
    px-6 py-4 rounded-xl
    bg-card/80 backdrop-blur-xl
    border border-border
    shadow-xl shadow-primary/10
    flex items-center gap-4
    z-50
  "
>
  <span className="text-sm font-medium text-foreground">
    {selectedCount} questions selected
  </span>
  <div className="flex gap-2">
    <Button size="sm" variant="glow">
      <Bookmark className="w-4 h-4 mr-2" />
      Bookmark
    </Button>
    <Button size="sm" variant="outline">
      Create Practice Set
    </Button>
    <Button size="sm" variant="ghost" onClick={deselectAll}>
      Deselect All
    </Button>
  </div>
</motion.div>
```

#### Quick Filter Tags/Pills

**Filter Pill Component**:
```tsx
function FilterPill({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all duration-150",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
```

**Filter Section Layout**:
```tsx
<div className="space-y-3">
  {/* Recency Filters */}
  <div className="flex items-center gap-2">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      Recency
    </span>
    <div className="flex gap-2">
      <FilterPill label="Last 6 Months" active={recency === "6m"} onClick={...} />
      <FilterPill label="Last Year" active={recency === "1y"} onClick={...} />
      <FilterPill label="All Time" active={recency === "all"} onClick={...} />
    </div>
  </div>

  {/* Company Groups */}
  <div className="flex items-center gap-2">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      Companies
    </span>
    <div className="flex gap-2 flex-wrap">
      <FilterPill label="FAANG" active={filters.includes("faang")} onClick={...} />
      <FilterPill label="Big Tech" active={filters.includes("bigtech")} onClick={...} />
      <FilterPill label="Startups" active={filters.includes("startups")} onClick={...} />
    </div>
  </div>
</div>
```

#### Search Input with Autocomplete

**Input Field**:
```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  <input
    type="text"
    placeholder="Search questions or companies..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="
      w-full pl-10 pr-4 py-2.5
      bg-card border border-border rounded-lg
      text-sm text-foreground placeholder:text-muted-foreground
      focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
      transition-all duration-150
    "
  />

  {/* Autocomplete Dropdown */}
  {showAutocomplete && (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="
        absolute top-full mt-2 w-full
        bg-popover border border-border rounded-lg
        shadow-lg max-h-80 overflow-y-auto
        divide-y divide-border
        z-50
      "
    >
      {/* Company results */}
      <div>
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Companies (3)
        </div>
        {companyResults.map(company => (
          <button
            key={company}
            onClick={() => handleSelect(company)}
            className="
              w-full px-3 py-2 text-left
              hover:bg-primary/5 transition-colors
              flex items-center justify-between
            "
          >
            <span className="text-sm text-foreground">
              {highlightMatch(company, searchQuery)}
            </span>
            <span className="text-xs text-muted-foreground">
              42 questions
            </span>
          </button>
        ))}
      </div>

      {/* Question text results */}
      <div>
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Questions (5)
        </div>
        {questionResults.map(question => (
          <button
            key={question.id}
            onClick={() => handleSelect(question.id)}
            className="
              w-full px-3 py-2 text-left
              hover:bg-primary/5 transition-colors
            "
          >
            <p className="text-sm text-foreground line-clamp-2">
              {highlightMatch(question.text, searchQuery)}
            </p>
          </button>
        ))}
      </div>
    </motion.div>
  )}
</div>
```

---

### 2.3 Animation Choreography

#### Row Hover Animations

**Subtle Lift + Background Transition**:
```tsx
// Use Framer Motion for smooth transitions
<motion.tr
  whileHover={{
    backgroundColor: "hsl(var(--primary) / 0.03)",
    transition: { duration: 0.15, ease: "easeOut" }
  }}
  className="border-b border-border transition-border-color duration-150"
>
  {/* Table cells */}
</motion.tr>
```

**Question Text Weight Shift**:
```css
/* CSS-only approach for performance */
.question-text {
  transition: color 150ms ease, font-weight 150ms ease;
}

tr:hover .question-text {
  color: hsl(var(--primary));
  font-weight: 500;
}
```

**Icon Scale on Hover**:
```tsx
// Wrap icons in motion.div
<motion.div whileHover={{ scale: 1.1 }}>
  <Calendar className="w-4 h-4 opacity-60" />
</motion.div>
```

#### Table Load-In Animation

**Stagger Rows Strategy**:
```tsx
// Container with stagger
<motion.tbody
  variants={staggerContainer}
  initial="initial"
  animate="animate"
>
  {questions.map((question, index) => (
    <motion.tr
      key={question.id}
      variants={fadeInUp}
      custom={index}
      transition={{ delay: index * 0.015 }} // 15ms stagger
    >
      {/* Cells */}
    </motion.tr>
  ))}
</motion.tbody>
```

**Optimized for Performance**:
- Max 20 rows staggered (remaining appear instantly)
- GPU-accelerated transforms only (opacity, y)
- No layout shifts during animation

#### Filter Application Transition

**Cross-Fade Pattern**:
```tsx
// Wrap table in AnimatePresence
<AnimatePresence mode="wait">
  <motion.div
    key={filterKey} // Changes when filters update
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    {/* Table content */}
  </motion.div>
</AnimatePresence>
```

#### Modal/Preview Animations

**Hover Preview Tooltip**:
```tsx
<AnimatePresence>
  {showPreview && (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      exit="initial"
      className="absolute z-50 max-w-md p-4 bg-popover border border-border rounded-lg shadow-xl"
    >
      {/* Preview content */}
    </motion.div>
  )}
</AnimatePresence>
```

**Mobile Filter Drawer**:
```tsx
// Bottom sheet slide-up
<motion.div
  initial={{ y: "100%" }}
  animate={{ y: 0 }}
  exit={{ y: "100%" }}
  transition={{
    type: "spring",
    stiffness: 300,
    damping: 30
  }}
  className="fixed inset-x-0 bottom-0 h-[60vh] bg-card border-t border-border rounded-t-2xl"
>
  {/* Filter content */}
</motion.div>
```

#### Mobile Card Animations

**Card Flip/Expand**:
```tsx
// Individual card entrance
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.05, duration: 0.3 }}
  whileTap={{ scale: 0.98 }}
  className="p-4 border border-border rounded-lg bg-card"
>
  {/* Card content */}
</motion.div>
```

**Swipe Action Reveal**:
```tsx
// Use motion.div with drag constraints
<motion.div
  drag="x"
  dragConstraints={{ left: -80, right: 80 }}
  dragElastic={0.2}
  onDragEnd={(e, info) => {
    if (info.offset.x > 80) handleBookmark();
    if (info.offset.x < -80) handleShare();
  }}
  className="relative"
>
  {/* Card content */}

  {/* Background action hints */}
  <div className="absolute inset-y-0 left-0 w-20 bg-blue-500 flex items-center justify-center">
    <Share className="w-5 h-5 text-white" />
  </div>
  <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center">
    <Bookmark className="w-5 h-5 text-white" />
  </div>
</motion.div>
```

---

### 2.4 Responsive Breakpoints

#### Breakpoint Strategy

**Tailwind Breakpoints**:
- `sm`: 640px (mobile landscape)
- `md`: 768px (tablet portrait)
- `lg`: 1024px (desktop)
- `xl`: 1280px (large desktop)

**Layout Modes**:
- **< 768px**: Card grid (mobile)
- **768px - 1024px**: Condensed table (tablet)
- **> 1024px**: Full table (desktop)

#### Desktop View (> 1024px)

**Full Table Layout**:
- All 5 columns visible: Question | Type | Company | Date | Action
- Sidebar: 280px width (expanded)
- Content area: `calc(100vw - 280px)`
- Max table width: 1400px (centered)

**Column Widths**:
```css
/* Flexible column sizing */
th:nth-child(1) { width: 40%; }  /* Question */
th:nth-child(2) { width: 15%; }  /* Type */
th:nth-child(3) { width: 15%; }  /* Company */
th:nth-child(4) { width: 15%; }  /* Date */
th:nth-child(5) { width: 15%; }  /* Action */
```

#### Tablet View (768px - 1024px)

**Condensed Table**:
- Hide "Date" column (less critical)
- Reduce cell padding: `12px 16px` (from `16px 24px`)
- Sidebar: Collapsed to 64px by default

**Column Widths**:
```css
th:nth-child(1) { width: 45%; }  /* Question */
th:nth-child(2) { width: 20%; }  /* Type */
th:nth-child(3) { width: 20%; }  /* Company */
th:nth-child(4) { width: 15%; }  /* Action */
```

**Responsive Classes**:
```tsx
<th className="hidden lg:table-cell"> {/* Date column */}
  Asked Date
</th>
```

#### Mobile View (< 768px)

**Card Grid**:
- 1 column (320px - 480px): Single column, full width
- 2 columns (480px - 768px): Dual column grid

**Grid Layout**:
```css
.card-grid {
  display: grid;
  gap: 16px;
  padding: 16px;
}

@media (min-width: 480px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Mobile Toolbar**:
- Sticky header: Height reduced to 60px
- "Back to Dashboard" hidden (use sidebar hamburger icon)
- Search + filter icon only (full filter drawer on tap)

**Touch Optimization**:
- Minimum button size: `44px × 44px`
- Increased spacing between interactive elements
- Larger tap targets for filter pills: `py-2.5` instead of `py-1.5`

---

## 3. Design System Extensions

### 3.1 Color Tokens

**New Tokens Needed**:

```css
:root {
  /* Question type colors - light theme */
  --color-type-product-sense: oklch(0.65 0.18 285); /* Purple */
  --color-type-behavioral: oklch(0.60 0.18 241);    /* Blue */
  --color-type-execution: oklch(0.60 0.16 150);     /* Green */
  --color-type-strategy: oklch(0.65 0.18 45);       /* Orange */

  /* Hover states */
  --color-table-row-hover: oklch(0.55 0.22 285 / 0.03);
  --color-table-row-selected: oklch(0.55 0.22 285 / 0.05);
}

.dark {
  /* Question type colors - dark theme */
  --color-type-product-sense: oklch(0.70 0.18 285);
  --color-type-behavioral: oklch(0.68 0.18 241);
  --color-type-execution: oklch(0.68 0.16 150);
  --color-type-strategy: oklch(0.70 0.18 45);

  /* Hover states */
  --color-table-row-hover: oklch(0.70 0.22 285 / 0.03);
  --color-table-row-selected: oklch(0.70 0.22 285 / 0.05);
}
```

**Usage**:
```tsx
<Badge className="bg-[var(--color-type-product-sense)]/10 text-[var(--color-type-product-sense)] border-[var(--color-type-product-sense)]/20">
  Product Sense
</Badge>
```

---

### 3.2 New Component Variants

#### Badge: `subtle` Variant

**Add to `/components/ui/badge.tsx`**:

```tsx
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-transparent bg-green-500 text-white hover:bg-green-600",
        // NEW: Subtle variant for question types
        subtle: "border bg-opacity-10 hover:bg-opacity-20 transition-all duration-150",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);
```

#### Button: `selection` Variant

**For bulk action toolbar**:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // ... existing variants
        // NEW: Selection mode CTA
        selection: "bg-gradient-to-r from-primary via-purple-500 to-primary text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all",
      },
    },
  }
);
```

#### New: FilterPill Component

**Create `/components/ui/filter-pill.tsx`**:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const filterPillVariants = cva(
  "inline-flex items-center rounded-full border text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20",
        false: "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
      },
      size: {
        sm: "px-2.5 py-1",
        md: "px-3 py-1.5",
        lg: "px-4 py-2",
      },
    },
    defaultVariants: {
      active: false,
      size: "md",
    },
  }
);

export interface FilterPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof filterPillVariants> {
  active?: boolean;
}

const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ className, active, size, ...props }, ref) => {
    return (
      <button
        className={cn(filterPillVariants({ active, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

FilterPill.displayName = "FilterPill";

export { FilterPill, filterPillVariants };
```

---

### 3.3 Typography Scale

**No Changes Needed** - Existing scale is optimal.

Current scale covers all use cases:
- `text-xs` (12px): Column headers, filter labels
- `text-sm` (14px): Question text, metadata, body
- `text-base` (16px): Not used in table
- `text-lg` (18px): Section headers
- `text-3xl` (30px): Page title

**Recommendation**: Continue using application-scale sizing (avoid 6xl+).

---

## 4. Implementation Notes

### 4.1 Technical Considerations

#### Virtualization Needs

**When to Virtualize**:
- **Yes**: If displaying >1000 rows simultaneously
- **No**: Current implementation loads 500 max (acceptable without virtualization)

**Recommendation**: Defer virtualization to Phase 2. Use pagination or infinite scroll first.

**Library Options** (if needed):
- `react-virtual` (Tanstack Virtual): Lightweight, flexible
- `react-window`: Established, performant

#### Animation Performance

**60fps Guidelines**:
- ✅ Use GPU-accelerated properties: `opacity`, `transform` (translateX/Y, scale)
- ❌ Avoid: `height`, `width`, `top/left`, `margin`, `padding`

**Optimization Strategies**:
1. **Limit Stagger Count**: Max 20 staggered rows (rest instant)
2. **Use CSS Transitions for Hover**: Avoid Framer Motion overhead on hover
3. **Throttle Scroll Events**: Debounce 100ms for scroll-triggered animations
4. **Lazy Load Images**: If company logos added (use Next.js Image)

**Framer Motion Best Practices**:
```tsx
// Good: Only animates on mount
<motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} />

// Bad: Re-renders on every hover
<motion.tr whileHover={{ y: -2 }} /> // Use CSS instead
```

#### State Management

**Local State** (useState):
- Search query
- Selected filters
- Sort option
- Selected question IDs (bulk actions)

**Server State** (React Query recommended):
- Question list data
- Filter options
- User bookmarks

**Why React Query**:
- Automatic caching + revalidation
- Optimistic updates for bookmarks
- Loading/error states handled
- Reduces boilerplate vs manual fetch

**Example**:
```tsx
const { data, isLoading } = useQuery({
  queryKey: ["questions", selectedType, searchQuery],
  queryFn: () => fetchQuestions({ type: selectedType, search: searchQuery }),
  staleTime: 5 * 60 * 1000, // 5 min cache
});
```

---

### 4.2 Accessibility Requirements

#### Keyboard Navigation

**Table Navigation**:
- `Tab`: Move between rows
- `Enter/Space`: Activate "Try Question" button
- `Shift+Click`: Enter selection mode
- `Escape`: Exit selection mode / close modals

**Search Autocomplete**:
- `ArrowDown/Up`: Navigate suggestions
- `Enter`: Select highlighted suggestion
- `Escape`: Close dropdown

**Filter Pills**:
- `Tab`: Focus next pill
- `Space/Enter`: Toggle filter
- Proper focus indicators (ring-2 ring-primary)

#### ARIA Labels

**Table Structure**:
```tsx
<table role="table" aria-label="PM Interview Questions">
  <thead>
    <tr role="row">
      <th role="columnheader" scope="col">Question</th>
      {/* ... */}
    </tr>
  </thead>
  <tbody role="rowgroup">
    <tr role="row" aria-label={`Question: ${question.text}`}>
      {/* ... */}
    </tr>
  </tbody>
</table>
```

**Interactive Elements**:
```tsx
// Filter pill
<button
  aria-pressed={isActive}
  aria-label={`Filter by ${label}`}
>
  {label}
</button>

// Try Question button
<button aria-label={`Start interview with question: ${question.text}`}>
  Try Question
</button>

// Bulk selection
<input
  type="checkbox"
  aria-label={`Select question: ${question.text}`}
  aria-checked={isSelected}
/>
```

**Live Regions**:
```tsx
// Announce filter results
<div role="status" aria-live="polite" className="sr-only">
  {filteredQuestions.length} questions found
</div>

// Selection count
<div role="status" aria-live="polite" className="sr-only">
  {selectedCount} questions selected
</div>
```

#### Focus Management

**Modal/Drawer Focus Trap**:
```tsx
// Use react-focus-lock
import FocusLock from "react-focus-lock";

<FocusLock>
  <div className="filter-drawer">
    {/* Drawer content */}
  </div>
</FocusLock>
```

**Skip Links**:
```tsx
// Add to top of page
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground"
>
  Skip to questions
</a>
```

#### Color Contrast

**WCAG AA Compliance**:
- Text on backgrounds: Minimum 4.5:1 ratio
- Large text (18px+): Minimum 3:1 ratio
- Interactive elements: Minimum 3:1 ratio

**Verify Badges**:
```css
/* Product Sense badge */
bg-purple-500/8 text-purple-600 /* ✓ Passes contrast check */

/* Hover states */
hover:border-primary/50 /* ✓ 3:1 against card background */
```

**Tools**:
- Chrome DevTools: Lighthouse accessibility audit
- Figma Plugin: Stark (contrast checker)
- Manual: WebAIM Contrast Checker

---

### 4.3 Performance Optimizations

#### Render Optimization

**Memoization Strategy**:
```tsx
// Memoize table rows
const TableRow = React.memo(({ question, onSelect, isSelected }) => {
  return (
    <tr>
      {/* Row content */}
    </tr>
  );
}, (prev, next) => {
  // Only re-render if question data or selection state changes
  return prev.question.id === next.question.id &&
         prev.isSelected === next.isSelected;
});

// Memoize expensive filters
const filteredQuestions = useMemo(() => {
  return questions.filter(q => /* ... */).sort(/* ... */);
}, [questions, searchQuery, selectedType, sortBy]);
```

#### Debouncing & Throttling

**Search Input**:
```tsx
const [searchQuery, setSearchQuery] = useState("");
const debouncedSearch = useDebounce(searchQuery, 300);

// Only fetch when debounced value changes
useEffect(() => {
  fetchQuestions(debouncedSearch);
}, [debouncedSearch]);
```

**Scroll Events** (if implementing infinite scroll):
```tsx
const handleScroll = useThrottle(() => {
  // Check if near bottom, load more
}, 100);
```

#### Bundle Size

**Code Splitting**:
```tsx
// Lazy load filter drawer on mobile
const FilterDrawer = lazy(() => import("./FilterDrawer"));

<Suspense fallback={<FilterSkeleton />}>
  <FilterDrawer {...props} />
</Suspense>
```

**Tree Shaking**:
- Import Lucide icons individually: `import { Search } from "lucide-react"`
- Avoid `import * as Icons from "lucide-react"`

#### Image Optimization

**Company Logos** (future feature):
```tsx
import Image from "next/image";

<Image
  src={`/logos/${company}.svg`}
  alt={`${company} logo`}
  width={16}
  height={16}
  loading="lazy"
  className="opacity-80"
/>
```

#### Caching Strategy

**React Query Cache**:
```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      cacheTime: 10 * 60 * 1000, // 10 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

**localStorage Cache** (for user preferences):
```tsx
// Save filter state
useEffect(() => {
  localStorage.setItem("questionFilters", JSON.stringify({
    selectedType,
    sortBy,
    activeFilters,
  }));
}, [selectedType, sortBy, activeFilters]);

// Restore on mount
useEffect(() => {
  const saved = localStorage.getItem("questionFilters");
  if (saved) {
    const { selectedType, sortBy, activeFilters } = JSON.parse(saved);
    // Restore state
  }
}, []);
```

---

## Appendix: Design Checklist

### Pre-Implementation Review

- [ ] Reviewed existing design system (sidebar, toolbar, buttons, badges)
- [ ] Confirmed color tokens compatible with light/dark themes
- [ ] Verified animation presets available in `/lib/animations.ts`
- [ ] Checked responsive breakpoints align with Tailwind defaults

### Implementation Checklist

**Layout Integration**:
- [ ] Sidebar navigation integrated (280px expanded, 64px collapsed)
- [ ] Toolbar header added (64px height, backdrop blur)
- [ ] Content area uses `calc(100vw - sidebar-width)`
- [ ] Mobile hamburger menu for sidebar (< 768px)

**Table Design**:
- [ ] Subtle borders (`border-border`, 1px)
- [ ] Row hover state (`bg-primary/03`, `border-primary/20`)
- [ ] Sticky header with glassmorphism
- [ ] Typography hierarchy (14px question text, 12px headers)
- [ ] Badge redesign (subtle variant, 8% opacity backgrounds)
- [ ] Cell padding (16px × 24px)

**Interactions**:
- [ ] Hover preview tooltip (300ms delay, collision detection)
- [ ] Bulk selection mode (checkboxes, floating toolbar)
- [ ] Quick filter pills (tag UI, multi-select)
- [ ] Search autocomplete (8 suggestions, keyboard nav)
- [ ] Loading skeletons (pulse animation, 500ms min)
- [ ] Empty states (search, filters, first-time)

**Mobile Responsive**:
- [ ] Card grid layout (< 768px)
- [ ] Filter drawer (bottom sheet, 60vh)
- [ ] Touch targets (44px minimum)
- [ ] Swipe gestures (optional)

**Animations**:
- [ ] Row stagger (15ms delay, max 20 rows)
- [ ] Filter cross-fade (200ms)
- [ ] Modal/drawer slide (spring physics)
- [ ] Hover transitions (CSS, 150ms)

**Accessibility**:
- [ ] ARIA labels (table, filters, buttons)
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Focus indicators (ring-2 ring-primary)
- [ ] Live regions (filter count, selection)
- [ ] Color contrast (WCAG AA)

**Performance**:
- [ ] Memoized table rows
- [ ] Debounced search (300ms)
- [ ] React Query caching (5min stale time)
- [ ] Code splitting (filter drawer)
- [ ] Lazy loading (if needed)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-07 | Initial specification document |

---

**End of Specification**

For questions or clarifications, reference GitHub Issue #95 or the tactical dashboard implementation files.

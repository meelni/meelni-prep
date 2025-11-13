### ADR-017: Marketing Landing Page Architecture
- **Date**: 2025-11-05
- **Decision**: Implemented modular, component-based landing page architecture adapted from reference UI design
- **Implementation**:
  - **Components Structure**: Created `/components/sections/` directory for page sections (header, hero, features, cta, footer)
  - **Configuration-Driven**: Centralized all copy in `/lib/config.tsx` for easy updates
  - **Reusable Primitives**: Built `aurora-text.tsx` and `section.tsx` for consistent patterns
  - **Design System**: Extended `globals.css` with aurora animations and additional color tokens
- **Rationale**:
  - Separation of concerns: content (config), structure (sections), styling (CSS)
  - Easier to maintain and update marketing copy without touching component logic
  - Reusable components enable rapid iteration on landing page variants
  - Professional aesthetic (Linear/Notion-inspired) builds trust with PM candidates
- **Reference Source**:
  - Adapted from external UI design template in `/ui-design` directory
  - Extracted and customized relevant components (hero, features, CTA)
  - Removed unnecessary sections (testimonials, pricing, blog, etc.)
  - **Recommendation**: External `/ui-design` folder can be deleted from parent directory
- **Architecture Pattern**:
  ```
  /app/page.tsx (orchestrator)
    → imports sections from /components/sections/
      → each section imports from /lib/config.tsx
      → uses primitives (aurora-text, section) for consistency
  ```
- **Consequences**:
  - Clean separation allows marketing team to update copy in config file
  - Consistent design language across all landing page sections
  - Easy to A/B test different hero messages or feature sets
  - Component library can be reused for future marketing pages
  - External UI template no longer needed (all necessary code extracted)


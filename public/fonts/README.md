# Font Files Required

This directory needs the following font files:

## Everett Font
- **File**: `everett-light.woff2`
- **Weight**: 300 (Light)
- **Usage**: Display headings (h1, h2)
- **Specs**: 48px/48px line-height for XL, 36px/40px for LG

## CommitMono Font
- **File**: `commit-mono-regular.woff2`
- **Weight**: 400 (Regular)
- **Usage**: Code blocks, monospace elements, number badges
- **Specs**: 16px/24px or 14px/21px line-height

## Public Sans
This font is loaded from Google Fonts, so no file is needed.
- **Weights**: 400 (Regular), 600 (Semibold)
- **Usage**: Body text, labels, UI elements
- **Specs**:
  - Labels: 12px/16px, weight 600
  - Body: 14px/20px, weight 400

## Installation Instructions

1. Obtain the font files from the appropriate source
2. Convert to `.woff2` format if needed (for optimal web performance)
3. Place the files in this directory:
   - `everett-light.woff2`
   - `commit-mono-regular.woff2`
4. Verify the font loading in the browser dev tools

## Fallback Configuration

Until the actual font files are added, the system uses these fallbacks:
- **Everett** → Public Sans (via Google Fonts)
- **CommitMono** → system monospace fonts

# Font Sources & How to Get Them

## Quick Summary

| Font | Cost | Where to Get | Status |
|------|------|-------------|---------|
| **Public Sans** | ✅ FREE | Google Fonts (auto-loaded) | ✅ **DONE** |
| **CommitMono** | ✅ FREE | commitmono.com | ⏳ **Download needed** |
| **Everett** | 💰 Paid | Adobe Fonts / Font foundries | ⏳ **License needed** |

---

## 1. Public Sans - ✅ Already Working!

**Status**: No action needed. This is already set up and working.

**What it is**: A free, open-source font family from the U.S. government.

**How it works**:
- Loaded automatically from Google Fonts CDN
- Configured in `app/layout.tsx`
- No local files needed

**Weights used**:
- 400 (Regular) - for body text
- 600 (Semibold) - for labels and emphasis

**License**: Open Font License (OFL) - completely free for any use

---

## 2. CommitMono - ✅ Free & Open Source

**Status**: Needs download (5 minute task)

**What it is**: A free, open-source monospaced font designed for coding.

**Cost**: **FREE** (Apache 2.0 License)

### How to Get CommitMono:

#### Option 1: Official Website (Easiest)
1. Visit **https://commitmono.com/**
2. Click the **"Download"** button
3. Extract the ZIP file
4. Find the file that looks like: `CommitMono-400-Regular.woff2`
5. Rename it to: `commit-mono-regular.woff2`
6. Move it to: `/public/fonts/commit-mono-regular.woff2`

#### Option 2: GitHub
1. Visit **https://github.com/eigilnikolajsen/commit-mono**
2. Click **"Releases"** on the right sidebar
3. Download the latest release ZIP
4. Follow steps 3-6 from Option 1

#### Option 3: Google Fonts (Alternative)
CommitMono is also available on Google Fonts:
1. Visit **https://fonts.google.com/specimen/Commit+Mono**
2. Select weight 400
3. Download the font family
4. Extract and convert to .woff2 if needed

### File Format Notes:
- **Preferred**: `.woff2` (smallest file size, best for web)
- **Also works**: `.woff`, `.ttf`, `.otf`
- **Converter** (if needed): https://cloudconvert.com/ttf-to-woff2

### What We Need:
- File name: `commit-mono-regular.woff2`
- Weight: 400 (Regular)
- Location: `/public/fonts/`

**Time to complete**: ~5 minutes

---

## 3. Everett - 💰 Commercial Font (Requires License)

**Status**: Needs purchase/license or alternative solution

**What it is**: A commercial display typeface with elegant, geometric letterforms.

**Cost**: Typically **$40-200+** depending on license type

### How to Get Everett:

#### Option 1: Adobe Fonts (If you have Creative Cloud)
**Best option if you already subscribe to Adobe**

1. Log in to **https://fonts.adobe.com/**
2. Search for "Everett"
3. Click "Activate fonts"
4. Download web font files
5. Find the Light (300) weight in .woff2 format
6. Rename to: `everett-light.woff2`
7. Move to: `/public/fonts/`

**Cost**: Included with Adobe Creative Cloud subscription (~$55/month)

#### Option 2: Purchase from Font Foundries
1. **MyFonts**: https://www.myfonts.com/
   - Search for "Everett"
   - Select Light (300) weight
   - Choose "Web Font" license
   - Purchase and download

2. **Fonts.com**: https://www.fonts.com/
   - Similar process to MyFonts

3. **Original Foundry**: Search for the original designer/foundry

**Cost**: $40-200+ for web license (one-time purchase)

#### Option 3: Check with Your Team
- Your company may already own a license
- Ask your design team or IT department
- Check brand assets repository

### What We Need:
- File name: `everett-light.woff2`
- Weight: 300 (Light)
- Location: `/public/fonts/`

### ❓ Don't Have Access to Everett?

**No problem!** You have alternatives:

#### Alternative 1: Use Public Sans (Already included)
Public Sans works great as a fallback. To use it instead of Everett:

1. The system already falls back to Public Sans if Everett isn't found
2. Just don't add the Everett font file
3. Everything will work fine!

#### Alternative 2: Use a Free Similar Font

Here are free alternatives that have a similar aesthetic to Everett:

1. **Outfit** (Google Fonts)
   - Geometric, clean lines
   - https://fonts.google.com/specimen/Outfit
   - Weight 300 available

2. **Josefin Sans** (Google Fonts)
   - Geometric, elegant
   - https://fonts.google.com/specimen/Josefin+Sans
   - Weight 300 available

3. **Montserrat** (Google Fonts)
   - Modern, geometric
   - https://fonts.google.com/specimen/Montserrat
   - Weight 300 available

To use an alternative:
```typescript
// In app/layout.tsx, replace Everett with (for example) Outfit:
import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300"],
  variable: "--font-everett", // Keep same variable name
  display: "swap",
});
```

---

## Quick Start Guide

### Minimum Setup (Free, 5 minutes):

1. **CommitMono**: Download from https://commitmono.com/
   - Place as: `/public/fonts/commit-mono-regular.woff2`

2. **Everett**: Skip for now (falls back to Public Sans)
   - Or use a free alternative like Outfit from Google Fonts

3. **Public Sans**: Already working! ✅

### Full Setup (If you have/can get Everett):

1. Get Everett Light (300) from Adobe Fonts or purchase
2. Download CommitMono from https://commitmono.com/
3. Place both files in `/public/fonts/`:
   - `everett-light.woff2`
   - `commit-mono-regular.woff2`
4. Restart dev server
5. Done! ✅

---

## Troubleshooting

### "Font file not found" error?
- Check file names match exactly:
  - `everett-light.woff2` (not `Everett-Light.woff2`)
  - `commit-mono-regular.woff2` (not `CommitMono-Regular.woff2`)
- Verify files are in `/public/fonts/` directory
- Restart dev server with `npm run dev`

### Font not loading in browser?
- Open browser DevTools → Network tab
- Filter by "Font"
- Check if fonts are loading (200 status) or failing (404 status)
- Verify file paths in `app/layout.tsx` match actual file names

### Want to use different fonts entirely?
Just update `app/layout.tsx` with your preferred fonts and restart the dev server!

---

## License Summary

| Font | License | Commercial Use | Attribution Required |
|------|---------|----------------|---------------------|
| Public Sans | OFL | ✅ Yes | ❌ No |
| CommitMono | Apache 2.0 | ✅ Yes | ❌ No |
| Everett | Commercial | ✅ Yes (with license) | Depends on license |

---

## Next Steps

**Priority 1** (Free, Quick):
1. Download CommitMono from https://commitmono.com/
2. Place in `/public/fonts/commit-mono-regular.woff2`
3. Restart dev server

**Priority 2** (Optional):
1. Decide on Everett:
   - Purchase if budget allows
   - Use Adobe Fonts if you have CC
   - Or use free alternative like Outfit
2. Add font file or switch to alternative
3. Restart dev server

**Priority 3** (Polish):
1. Test fonts load correctly in browser
2. Verify visual appearance matches design
3. Check performance (font loading speed)

---

Questions? Check the detailed docs in `/public/fonts/README.md` or see the typography guide in `TYPOGRAPHY.md`.

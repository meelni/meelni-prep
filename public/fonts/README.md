# Font Files - Quick Setup Guide

Place your font files in this directory for the typography system to work.

## ✅ What's Already Working

**Public Sans** - No action needed!
- Loaded automatically from Google Fonts
- Used for body text, labels, and UI elements

## 📦 What You Need to Download

### 1. CommitMono (FREE - 5 minutes)

**Download**: https://commitmono.com/

**Steps**:
1. Click "Download" on the website
2. Extract the ZIP file
3. Find: `CommitMono-400-Regular.woff2` (or similar name)
4. Rename to: `commit-mono-regular.woff2`
5. Place in this folder

**File name required**: `commit-mono-regular.woff2`

### 2. Everett (PAID or use alternative)

**Option A**: Purchase/License Required
- Adobe Fonts (if you have Creative Cloud)
- MyFonts.com (~$40-200)
- Ask your design team if company has license

**Option B**: Use Free Alternative
- The system falls back to Public Sans automatically
- Or replace with Outfit/Montserrat from Google Fonts

**File name required** (if using): `everett-light.woff2`

## 🚀 Quick Start (Minimum Setup)

**Just need CommitMono**:
1. Download from https://commitmono.com/
2. Rename to `commit-mono-regular.woff2`
3. Place in this folder
4. Restart dev server

**For Everett**:
- Either add the font file (if you have license)
- Or skip it - system uses Public Sans as fallback

## 📁 Final File Structure

```
/public/fonts/
├── commit-mono-regular.woff2  ← Download from commitmono.com
├── everett-light.woff2         ← Optional (falls back to Public Sans)
└── README.md                   ← This file
```

## ❓ Troubleshooting

**Font not loading?**
- Check file names match exactly (lowercase, hyphens)
- Verify files are in `/public/fonts/` directory
- Restart dev server: `npm run dev`

**Don't have Everett license?**
- No problem! System falls back to Public Sans
- Everything still looks professional

## 📚 More Info

See `FONT_SOURCES.md` in project root for:
- Detailed download instructions
- Font licensing information
- Alternative font options
- Full troubleshooting guide

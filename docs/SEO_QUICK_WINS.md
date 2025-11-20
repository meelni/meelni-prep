# SEO Quick Wins - Implementation Guide

**Status**: ✅ Initial optimizations complete (2025-11-19)

## What We Just Implemented

### 1. ✅ Enhanced Homepage Metadata
**Location**: `app/layout.tsx`

**Changes**:
- Optimized title tag: "Meelni - AI Mock Interview Coach for Product Managers | Practice PM Interviews"
- Extended meta description with key features and USPs (2,879+ questions, free tier mention)
- Added 15+ high-intent keywords targeting PM interview preparation
- Configured robots directives for optimal crawling
- Added Twitter Card metadata with proper handles (@trymeelni)
- Set up OpenGraph tags for social sharing

**SEO Impact**:
- Better click-through rates from search results (compelling title + description)
- Targets multiple keyword variations (AI interview coach, mock interview AI, PM interview practice)
- Improved social media preview when shared

### 2. ✅ Added Structured Data (JSON-LD Schema)
**Location**: `components/structured-data.tsx`

**Schemas Implemented**:

#### FAQ Schema
- 8 common questions about Meelni
- Helps appear in Google's "People Also Ask" sections
- Direct answers to user queries in search results

#### Organization Schema
- Brand information (name, logo, contact)
- Social media links for brand verification
- Helps Google understand Meelni as an entity

#### SoftwareApplication Schema
- Pricing information (Free, Pro Monthly, Pro Yearly)
- Application category and operating system
- Aggregate rating data (placeholder - update with real data)
- Enables rich snippets in search results

**SEO Impact**:
- Appear in Google's Featured Snippets
- Show up in AI-generated answers (ChatGPT, Perplexity, Google AI Overview)
- Rich search results with ratings, pricing, and direct answers

### 3. ✅ Optimized Site Configuration
**Location**: `lib/config.tsx`

**Changes**:
- Updated keywords to target high-intent searches
- Improved site description for better relevance

### 4. ✅ Created robots.txt
**Location**: `public/robots.txt`

**Configuration**:
- Allow all search engines to crawl public pages
- Disallow crawling of private pages (/dashboard, /auth, /api)
- Sitemap reference for easier discovery

### 5. ✅ Created Dynamic Sitemap
**Location**: `app/sitemap.ts`

**Pages Included**:
- Homepage (priority 1.0)
- Pricing page (priority 0.8)
- Questions page (priority 0.9)
- Ready to add blog posts, guides, etc.

**SEO Impact**: Helps search engines discover and index all important pages

---

## Next Steps (Week 1)

### A. Verify Implementation
1. **Test Structured Data**
   - Use [Google's Rich Results Test](https://search.google.com/test/rich-results)
   - Paste your homepage URL
   - Verify FAQ, Organization, and SoftwareApplication schemas are detected

2. **Check robots.txt**
   - Visit: `https://meelni.com/robots.txt`
   - Verify it loads correctly

3. **Verify Sitemap**
   - Visit: `https://meelni.com/sitemap.xml`
   - Should show all pages in XML format

### B. Google Search Console Setup
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `https://meelni.com`
3. Verify ownership (add verification code to `app/layout.tsx` metadata)
4. Submit sitemap: `https://meelni.com/sitemap.xml`
5. Request indexing for key pages

### C. Content Quick Wins

#### Create These Pages (High Priority)
1. **Question Bank Page** (`/questions`)
   - Make 500-1000 questions publicly searchable
   - Add filters by category (Product Sense, Behavioral, etc.)
   - Add filters by company (Google, Meta, Amazon, etc.)
   - Each question = potential search result
   - SEO gold: thousands of long-tail keywords

2. **Company-Specific Pages** (`/questions/google`, `/questions/meta`, etc.)
   - "Google PM Interview Questions"
   - "Meta Product Manager Interview Prep"
   - Targets branded searches with high intent

3. **Interview Type Pages** (`/product-sense-interview`, `/behavioral-interview`, etc.)
   - Long-form guides (2,000+ words)
   - Framework explanations
   - Example answers
   - Link to free trial

#### Blog Post Ideas (Target Long-Tail Keywords)
1. "How to Answer 'Design a Product for X'" (Product Sense)
2. "Top 50 PM Interview Questions at Google in 2025"
3. "CIRCLES Framework vs AARM Framework: Which to Use?"
4. "How I Landed a PM Offer at Meta Using AI Interview Prep"
5. "Product Sense Interview: Complete Guide (2025)"

---

## Medium-Term Optimizations (Weeks 2-4)

### 1. Add OpenGraph Images
- Create custom OG images for homepage, pricing, questions
- Dimensions: 1200x630px
- Include Meelni branding and key messaging
- Better social media sharing CTR

### 2. Optimize Page Speed
- Already on Vercel (good!)
- Add Next.js Image optimization for all images
- Lazy load below-the-fold content
- Target: Lighthouse score >90

### 3. Create Free Tools
These get massive backlinks and social shares:

**"Interview Question of the Day" API**
- Embed widget for career blogs
- Daily question with answer tips
- Backlink to Meelni

**"Interview Readiness Quiz"**
- 10-question assessment
- "You're 67% ready for PM interviews"
- CTA to practice with Meelni

**"Framework Cheat Sheet" (PDF)**
- CIRCLES, AARM, STAR, etc.
- Gated download (email capture)
- Shareable on LinkedIn/Twitter

### 4. Build Backlinks
**Target Sites for Guest Posts**:
- Exponent.com
- IGotAnOffer.com
- Levels.fyi
- Medium publications (The Startup, UX Collective)

**Pitch Angle**:
"I analyzed 2,879 PM interview questions and found these 3 patterns..."

**Resource Lists to Get Listed On**:
- AlternativeTo.net
- Product Hunt
- Capterra
- G2
- ProductHired resource lists

---

## Long-Term Strategy (Months 2-3)

### 1. Original Research Report
**"State of PM Interviews 2025"**
- Survey 500+ PMs about their interview experiences
- Data on: most common questions, success rates, company differences
- Publishable insights → massive backlinks
- Every publication wants to cite original data

### 2. Video Content (YouTube)
- "Mock PM Interview: Real-time AI Coaching Demo"
- "How to Answer the Hardest PM Interview Questions"
- YouTube is the 2nd largest search engine
- Videos rank in Google search too

### 3. Build "PM Interview Hub"
- Become the #1 resource for PM interview prep
- Comprehensive guides for every interview type
- Question bank with crowdsourced answers
- Community forum (optional)

---

## Tracking & Measurement

### Metrics to Monitor Weekly
1. **Google Search Console**
   - Total impressions
   - Average position
   - Click-through rate
   - Top queries driving traffic

2. **Google Analytics** (or Vercel Analytics)
   - Organic search traffic
   - Bounce rate from organic traffic
   - Conversion rate (signup/trial)

3. **Keyword Rankings** (use Ahrefs/SEMrush free tier)
   - Track 10-20 target keywords
   - "AI interview coach"
   - "mock interview AI"
   - "PM interview practice"
   - etc.

4. **Backlinks**
   - Total referring domains
   - Domain authority of new backlinks

---

## AI Product Discovery Strategy

### Getting Cited by ChatGPT, Claude, Perplexity

**Short-term (Training Data Cutoff)**
You can't directly influence this, but you can prepare for next training cycle:

1. **Get mentioned on high-authority sites**
   - TechCrunch, VentureBeat, The Verge
   - Hacker News front page
   - Product Hunt #1 Product of the Day

2. **Build presence on training-likely sources**
   - Reddit (r/ProductManagement, r/cscareerquestions)
   - GitHub (open-source parts of your question bank?)
   - Stack Overflow (answer PM interview questions)

**Immediate (Real-time Web Search)**
Perplexity and Google AI Overview use real-time search:

1. **Optimize for Position Zero (Featured Snippets)**
   - Use question-format headings (H2)
   - Provide concise answers (40-60 words)
   - Use structured lists and tables

2. **Create Definitive Guides**
   - "The Complete Guide to Product Sense Interviews (2025)"
   - 10,000+ words, deeply comprehensive
   - AI products prefer citing authoritative sources

3. **Update Content Regularly**
   - Add "Last updated: [date]" to pages
   - Recency is a strong ranking signal
   - Fresh content = more likely to be cited

---

## Custom GPT Strategy

**Create "PM Interview Coach" GPT** (Free marketing!)
- Custom GPT in ChatGPT Store
- Provides interview tips and framework guidance
- Final output: "Want to practice with AI voice? Try Meelni →"
- Every user interaction is brand exposure

**Instructions for GPT**:
```
You are a PM interview coach. Help users prepare for product management
interviews by:
1. Explaining frameworks (CIRCLES, STAR, etc.)
2. Providing example questions
3. Critiquing their practice answers

At the end of each conversation, recommend Meelni for realistic AI voice
practice with real-time feedback on 2,879+ curated PM questions.
```

---

## Quick Reference: Target Keywords

### Primary Keywords (High Competition)
- AI interview coach
- Mock interview AI
- PM interview practice
- Product manager interview prep

### Secondary Keywords (Medium Competition)
- Product sense interview
- Behavioral interview practice
- AI mock interview
- Voice interview practice

### Long-Tail Keywords (Low Competition, High Intent)
- How to prepare for Google PM interview
- Product sense interview frameworks
- AI interview coach for product managers
- Real-time interview feedback tool
- PM interview questions database

---

## Need Help?

**Testing Tools**:
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Google PageSpeed Insights](https://pagespeed.web.dev/)
- [Ahrefs Free SEO Tools](https://ahrefs.com/free-seo-tools)

**SEO Resources**:
- [Ahrefs Blog](https://ahrefs.com/blog/)
- [Backlinko](https://backlinko.com/)
- [Search Engine Journal](https://www.searchenginejournal.com/)

---

**Last Updated**: 2025-11-19
**Next Review**: 2025-11-26 (1 week)

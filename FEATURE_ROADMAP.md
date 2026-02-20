# VisionTags AI: Feature Roadmap & Revenue Strategy (v2)

> Last updated: February 19, 2026
> Status: 1 paying Pro customer (Phoenix Publishing), approved in Shopify App Store
> Goal: Maximize revenue through strategic feature development + distribution
> Research basis: Deep competitive analysis of 8+ competitor apps, 100+ web searches, market validation of every feature

---

## Current State

**What VisionTags does today:**
- Analyzes product images with Claude Haiku 4.5 (vision AI)
- Extracts 10 metafields (color, color_hex, material, pattern, gender, age group, neckline, sleeve length, fit, product type)
- Generates SEO tags (color/material/pattern keywords + 3-5 vibe/occasion tags)
- Generates alt text (125 chars, accessibility-compliant)
- Generates product descriptions (2-4 sentences, plain text)
- Generates SEO titles (max 60 chars)
- Generates meta descriptions (max 155 chars)
- Inline editing before syncing to Shopify
- Auto-sync new products via webhook (Pro only)
- Re-analyze on image change (Pro only)
- Credit-based billing with hard cap (no surprise overage bills)

**Current pricing:**

| Plan | Price | Credits/mo |
|------|-------|-----------|
| Free | $0 | 50 |
| Pro | $19/mo | 5,000 |

**Unit economics:** ~$0.004 per scan (Claude Haiku, 1024 max_tokens). Pro plan: $20 API cost, $19 revenue = -$1 loss. Reinforces need for $29 pricing.

---

## Competitive Landscape (Validated Feb 2026)

### Direct Competitors

| App | Price Range | Reviews | What They Do | What They DON'T Do |
|-----|-----------|---------|-------------|-------------------|
| **Lyros** (Smart SEO & Tags) | $0-25/mo | 17 (5.0) | Tags, SEO titles, descriptions, alt text, 5 languages, custom prompts, "Built for Shopify" | **No metafields** |
| **TAGit** (AI Tags) | $0-119/mo | 7 (5.0) | Tags, 12 languages, custom prompts, auto-process new products | **No metafields**, tags only |
| **Brezz** (AI Metafields) | $0-497/mo | 1 (5.0) | Metafields (color, material, style), image analysis | **No tags**, 65x more expensive per scan than us |
| **AutoMeta** (AI Custom Fields) | Free + $1/1K words | 0 | Text-based metafield generation (ChatGPT) | **No vision**, zero traction |

### Adjacent Competitors (Description/SEO Apps)

| App | Price Range | Reviews | Key Threat |
|-----|-----------|---------|-----------|
| **Profitonium** (ChatGPT Descriptions) | $0-199/mo | 359 (4.9) | Bulk descriptions + image analysis + 30 languages + Flow |
| **StoreYa/Yodel** (ChatGPT Descriptions) | $0-100/mo | 339 (4.8) | Descriptions + blog + LLM.txt for AI shopping |
| **StoreSEO** | $15-250/mo | 576 (5.0) | Image optimization + schema markup + Google Search Console |

### Our Unique Position

**VisionTags is the only app combining vision-based metafield extraction + tag generation + descriptions + SEO in a single scan.** Lyros does tags but no metafields. Brezz does metafields but no tags (and costs 65x more per scan). Profitonium does descriptions but no metafields.

### Key Competitive Insights

- **Lyros gives 10,000 credits for $25/mo** while we give 5,000 for $19/mo. At high volume, they're cheaper.
- **TAGit launched after us and already has 7 reviews** to our 0. Getting reviews matters more than features.
- **Brezz charges $0.245/product** vs. our $0.0038/scan. We're 65x cheaper for metafields.
- **Custom prompts are table stakes.** Lyros, TAGit, Profitonium all have them. We don't (yet).
- **Multi-language is expected.** TAGit: 12 languages, Lyros: 5, Profitonium: 30+. We have 0.
- **Claude Vision is a real advantage.** Cheaper than GPT-4 Vision, competitive quality. User testimonials: "more accurate than anything else we've tested." This is our moat and we should market it.

### Shopify Native AI (Existential Threat Assessment: LOW)

**Shopify Magic does NOT do:** Tags, metafields, image analysis for attributes, alt text, bulk processing.
**Shopify Magic DOES do:** Product descriptions (text-only, one at a time, free).

Shopify is building platform features (Catalog, Agentic Storefronts) that RELY ON merchant-provided structured data, not tools to CREATE that data. VisionTags creates the data. We're complementary, not competing with Shopify.

---

## Strategic Positioning: Dual Angle

### Primary: "AI Product Enrichment"
> "VisionTags analyzes your product images to auto-fill metafields, tags, descriptions, and alt text. One scan enriches everything."

### Premium: "AI Shopping Readiness"
> "73% of shoppers use AI to discover products. ChatGPT Shopping and Perplexity need structured product data to find your products. VisionTags creates that data automatically."

**Why dual positioning:**
- "Auto-tagging" is the core value prop everyone understands
- "AI Shopping Readiness" is the forward-looking angle that justifies premium pricing and differentiates from competitors stuck in the old SEO mindset
- Traffic from AI sources to retail sites: **+4,700% YoY** (this is the tailwind)

---

## Pricing Strategy (v2: 3 Tiers, Not 5)

### Why 3 tiers, not 5
Research shows 3-4 tiers maximize conversions (up to 3.2% boost). 5+ tiers cause analysis paralysis. The original roadmap proposed 5 tiers (Free/Starter/Pro/Business/Enterprise). This is too many.

### Why $29, not $19
- $19/mo has 21% margin (unsustainable)
- Adding descriptions + custom prompts justifies the price increase
- $29 is a proven SMB sweet spot (TAGit Starter is $29, Lyros Business is $25)
- Psychology research: $29 signals more value than $19 without crossing the $30 resistance point

### Recommended Structure

| Tier | Price | Credits/mo | Target | Key Features |
|------|-------|-----------|--------|-------------|
| **Free** | $0 | 100 | Trial / small stores | Metafields + tags + alt text + descriptions. Manual scan only. |
| **Pro** | $29/mo | 2,500 | Growing stores (100-500 products) | + Auto-sync new products, custom AI prompts, re-scan on image change |
| **Business** | $79/mo | 10,000 | Established stores (500+ products) | + Multi-language (5 languages), priority queue, enhanced dashboard |

### Why these numbers

- **Free at 100** (up from 50): Matches Profitonium (100), beats Lyros/TAGit (50). Costs us $0.30 per free user. A small store with 100 products gets their full catalog done and sees real value.
- **Pro at $29**: With descriptions + custom prompts added, we offer MORE than Lyros ($25 for tags/SEO only) and comparable to TAGit Starter ($29 for tags only). We give metafields + tags + descriptions + alt text for $29.
- **Business at $79**: 10,000 credits beats Lyros Business (10,000 for $25) but includes multi-language + metafields, which Lyros doesn't have. Competes with Brezz Starter ($49 for only 200 products) at a fraction of the per-scan cost.

### Revenue impact (per 100 customers)

| Scenario | Distribution | MRR |
|----------|-------------|-----|
| Current (all Pro $19) | 100% Pro | $1,900 |
| New (50 Pro, 30 Business, 20 Free) | Mixed | $3,820 |
| **Improvement** | | **2x** |

---

## Phase 1: Quick Wins (Do Now, 1-2 Weeks Each)

These features are table stakes that competitors already have or that cost nearly nothing to add. Ship them before anything else.

### 1.1 Product Description + SEO Generation :white_check_mark: SHIPPED (Feb 19, 2026)

**What:** Add product descriptions, SEO titles, and meta descriptions to the scan output. Claude already analyzes the image. Adding these fields to the JSON response costs virtually $0 extra.

**Why this survived deep scrutiny:** We nearly killed this feature because Shopify Magic does descriptions for free. But the research proved otherwise:
- Magic only works **one product at a time** (no bulk). Merchants with 1,000 products need 1,000 manual operations.
- Image-aware descriptions are **objectively better** than text-only (captures texture, color, style details ChatGPT misses).
- Profitonium charges $15-199/mo and has 359 reviews despite Magic being free. The demand is real.
- **The incremental cost is $0.** Same API call, same image, one more field in the JSON response.

**This is NOT feature creep.** It's completing the product enrichment package. Not including descriptions is like selling a car without seats because "we focus on the engine." Merchants hire VisionTags to enrich product data from images. Descriptions are product data.

**Implementation:**
- Expand Claude prompt to return `description` (2-3 sentences), `seo_title` (< 60 chars), `meta_description` (< 160 chars)
- Add `suggestedDescription`, `suggestedSeoTitle`, `suggestedMetaDescription` to Product model
- Add editable fields in job detail UI
- Add sync options (checkboxes: metafields, tags, alt text, description)
- Sync via `productUpdate` mutation (description field) + metafields (SEO title/meta)

**Effort:** 1 week.

**Competitive advantage:** Only app offering **vision-aware bulk descriptions + metafields + tags** in one scan.

---

### 1.2 Settings Page + Custom AI Prompts

**What:** A settings page where merchants can:
- Toggle auto-sync on/off (this is a Pro feature with NO UI currently)
- Write custom instructions for the AI (brand voice, specific keywords, things to ignore)
- Choose which metafields to generate (not all merchants need "neckline" or "sleeve_length")
- Set tag preferences (max number of tags, focus on SEO vs. vibe/occasion)
- Set description tone (professional, casual, luxury, playful)

**Why this is table stakes:** Every single competitor with good reviews offers customization. Lyros, TAGit, and Profitonium all have custom prompts. "Limited customization" is the most common complaint in competitor reviews. Without settings, we're a black box that merchants can't control.

**Implementation:**
- New route: `app.settings.tsx` (replace "Additional page" placeholder in nav)
- Add `preferences` JSON column to `ShopSettings` model
- Pass preferences to Claude prompt at scan time
- Custom prompt: text area with 500 char limit, appended to system prompt

**Effort:** 1 week. Settings page + custom prompts together.

---

### 1.3 Rescan Failed Products

**What:** "Retry Failed" button on the job detail page that re-queues only ERROR products.

**Why:** Currently merchants have to start an entirely new scan if products fail (rate limit, bad image, API error). This wastes credits and is frustrating.

**Implementation:**
- Add "retry-failed" action in `app.jobs.$id.tsx`
- Filter products with status "ERROR", reset to "PENDING"
- Re-queue only those products, deduct credits only for retries

**Effort:** 2-3 days.

---

### 1.4 Bump Free Tier to 100 Credits

**What:** Increase from 50 to 100 credits.

**Why:** 50 is at the low end (Profitonium: 100, StoreYa: 120). More importantly, 50 products isn't enough for merchants to see transformative value. At 100, a small store scans their full catalog and understands why they need this. Cost: $0.30 per free user.

**Implementation:** Change one constant in `billing.server.ts`. Update Partner Dashboard.

**Effort:** 5 minutes.

---

## Phase 2: Revenue Multipliers (Months 2-4)

Features that expand the addressable market, enable higher pricing, or dramatically reduce churn.

### 2.1 Multi-Language Output

**What:** Generate tags and metafields in multiple languages. Merchant picks languages in settings (top 5: English, Spanish, French, German, Portuguese). Each scan returns translations alongside English output.

**Why this survived scrutiny:** We nearly killed this because Shopify Translate & Adapt is free. But Translate & Adapt does NOT translate custom metafields or AI-generated tags. A merchant using VisionTags to generate tags in English still needs someone/something to translate those tags for their French storefront. Claude Haiku supports 20+ languages natively at no extra API cost.

**Scoped down from v1:** Originally proposed 20 languages. Now scoped to top 5. Enough to unlock EU merchants without overbuilding.

**Revenue impact:** This is the key differentiator for the Business tier ($79/mo). TAGit charges $119/mo for 12-language support with only 4,000 tags. We'd offer 10,000 credits + 5 languages for $79.

**Effort:** 2-3 weeks. Prompt engineering + storage + language selector in settings.

---

### 2.2 Vertical Metafield Schemas

**What:** Industry-specific metafield sets that merchants can choose from:
- **Fashion:** neckline, sleeve_length, fit, occasion, season, fabric_weight (current default, enhanced)
- **Home & Garden:** room_type, design_style, dimensions_category, indoor_outdoor
- **Jewelry:** gemstone, metal_type, setting_style, occasion
- **Electronics:** connectivity, compatibility, form_factor
- **General:** color, material, pattern, product_type (works for everything)

**Why this is new (wasn't in v1):** Brezz charges $49-497/mo for metafield automation. Their only advantage over VisionTags is (presumably) more flexible metafield schemas. By offering vertical-specific schemas, we match Brezz's value at 1/13th the price ($29 vs. $497 for their top tier). This also solves the problem that our current 10 metafields are fashion-biased (neckline, sleeve_length don't make sense for electronics).

**Implementation:**
- Define schema templates (JSON objects with metafield definitions per vertical)
- Merchant selects their industry in settings (or "General")
- Claude prompt dynamically adapts to requested metafields
- Schema selection stored in `ShopSettings.preferences`

**Effort:** 1-2 weeks. Mostly prompt engineering + settings UI.

---

### 2.3 Bulk Edit UI

**What:** Replace one-product-at-a-time editing with a spreadsheet-like table:
- Data table (Polaris IndexTable) showing all products
- Editable inline cells for tags, description, alt text
- Filter by status (pending, analyzed, synced, error)
- Search by product title
- "Select all" and "Sync selected" batch operations

**Why:** The current UX requires expanding each product card individually. For 500 products, this is unusable. This is a basic UX improvement that larger stores need.

**Effort:** 2 weeks. Frontend-heavy (Polaris IndexTable).

---

### 2.4 Catalog Completeness Widget

**What (simplified from v1):** Instead of a full analytics dashboard, add a simple completeness widget to the existing dashboard:
- "425 of 1,200 products enriched"
- "775 products need scanning"
- "3,150 metafields filled"
- "425 products have AI-generated alt text"
- Progress bar showing catalog coverage

**Why this was simplified:** v1 proposed a full analytics page with charts and trend lines. That's overengineered for this stage. A simple widget on the existing dashboard shows value, drives re-engagement ("you still have 775 products to scan!"), and takes 3 days to build instead of 2 weeks.

**Why it matters for retention:** The #1 churn risk is merchants scanning their catalog once and canceling. The completeness widget creates a "progress bar effect" that motivates continued usage.

**Effort:** 3-5 days. Query existing Product/Job tables, add to dashboard loader + UI.

---

### 2.5 Shopify Flow Integration

**What:** Create Flow triggers and actions:
- **Triggers:** "Scan completed," "Credits running low"
- **Actions:** "Scan product," "Scan collection"

**Why:** Shopify Flow is free for all merchants (Basic+ plans). Apps with Flow integration appear in Flow's connector library, which is a free distribution channel. Profitonium has Flow integration and lists it as a key feature.

This also enables powerful merchant workflows: "When a product is imported from Oberlo, auto-scan with VisionTags." Currently our webhook only handles products/create. Flow would let merchants trigger scans from any event.

**Effort:** 1-2 weeks. Shopify has good docs for Flow extension.

---

### 2.6 AI Shopping Readiness Score

**What:** A widget on the dashboard showing how "AI Shopping Ready" the merchant's catalog is:
- Structured attributes completeness (metafields filled?)
- Tag quality (are tags specific enough for AI filtering?)
- Description quality (does it describe the product for AI agents?)
- Alt text coverage
- Overall readiness grade (A/B/C/D/F)

**Why this is new (wasn't in v1):** The "agentic commerce" research revealed that AI shopping traffic is up +4,700% YoY. ChatGPT Shopping and Perplexity rank products based on structured data quality. This widget makes the abstract concept of "AI shopping readiness" tangible and actionable.

**Positioning:** "73% of shoppers use AI to find products. Is your catalog ready? Your AI Shopping Readiness: C. Scan 775 more products to reach B."

**Effort:** 1 week. Scoring algorithm + dashboard widget. Data from existing tables.

---

## Phase 3: Moat Builders (Months 5-8)

Features that create defensible competitive advantages and high switching costs.

### 3.1 Multi-Image Analysis

**What:** Analyze all product images (not just the first one). Different angles reveal different attributes: front shows neckline, back shows closure, detail shot shows texture/material, lifestyle shot shows occasion/vibe.

**Why:** Currently we only see the first image, missing data from other angles. This produces better metafield accuracy, richer tags, and more detailed descriptions. It also increases credit consumption (1 credit per image, not per product).

**Competitive advantage:** No competitor explicitly offers multi-image analysis. Claude supports multi-image input natively.

**Pricing:** 1 credit per image. A product with 4 images costs 4 credits. Increases ARPU without changing pricing tiers.

**Effort:** 2-3 weeks. Prompt engineering for multi-image context + merge logic + UI showing per-image attributions.

---

### 3.2 Enhanced Metafield Sync

**What:** Beyond just writing metafields, also:
- Set Shopify product category from AI analysis (maps to Standard Product Taxonomy)
- Update product type field
- Create/update metafield definitions in the store (so metafields appear in Shopify admin filters)
- Validate metafields against Shopify's standard taxonomy categories

**Why:** Shopify's Standard Product Taxonomy now has 10K+ categories and 1K+ attributes. Properly categorized products get better visibility in Shopify's search, collection filtering, and AI shopping feeds. Currently we write metafields but don't set product categories. This makes VisionTags the "product data quality" tool, not just a tagging tool.

**Effort:** 2-3 weeks. Taxonomy mapping + GraphQL mutations for product category + metafield definition creation.

---

## Distribution Strategy (As Important As Features)

### The Hard Truth

TAGit launched in December 2025 (after VisionTags) and already has 7 reviews. We have 0. **Reviews are more important than features right now.** A merchant choosing between VisionTags (0 reviews) and Lyros (17 reviews, 5.0 stars, "Built for Shopify") will pick Lyros every time.

### Actions

1. **Ask Phoenix Publishing for a review.** They're our first paying customer. One genuine 5-star review with details changes everything. (Email sent Feb 19 requesting feedback + review.)

2. **App Store listing optimization:**
   - Title: Include "AI Metafields" and "Product Tags" (search terms merchants use)
   - Screenshots: Show before/after of product enrichment
   - Description: Lead with "The only app that auto-fills metafields + tags + descriptions from product images"
   - Feature comparison table vs. Lyros/TAGit/Brezz

3. **Content marketing (AI shopping angle):**
   - "How to Make Your Products Discoverable in ChatGPT Shopping" (blog post / YouTube)
   - "Why Metafields Matter for AI Commerce in 2026" (Shopify Community post)
   - "VisionTags vs. Manual Tagging: 75% Cost Savings Case Study"

4. **Direct outreach to stores with large catalogs:**
   - Stores with 500+ products and poor/no metafields
   - Message angle: "I noticed your products don't have structured metafields, which means AI shopping tools like ChatGPT can't find them. VisionTags fills those automatically from your product images."

5. **Free tier as growth engine:**
   - Bumping to 100 credits lets small stores experience full value
   - Follow up after free scan with "You enriched 87 products. Want to do the other 413? Upgrade to Pro."

6. **Shopify Community presence:**
   - Answer questions about metafields, product tagging, AI commerce
   - Subtle VisionTags mentions where relevant (don't spam)

7. **Target: 10 reviews in 90 days, 50 reviews in 6 months.** At 50 reviews, apply for "Built for Shopify" certification.

---

## Features Considered and Rejected (v2)

### Scheduled/Recurring Scans
**Originally proposed as Phase 2 (2 weeks effort)**
**Why rejected:** Product images rarely change. VisionTags already auto-scans new products via webhook and re-scans when images change. There's no evidence merchants need periodic re-scanning of unchanged products. The rescan-failed-products button covers the actual use case (retrying errors). Building a cron system for a problem that doesn't exist wastes 2 weeks.

### Theme Extension: Smart Product Filters
**Originally proposed as Phase 3 "ultimate moat" (4-6 weeks effort)**
**Why rejected:** The product filter market is dominated by Boost Commerce ($29-599/mo), Searchanise ($19+/mo), and Shopify's own Search & Discovery app (free). These are mature products with years of development. VisionTags is a DATA layer, not a UX layer. The right strategy is to create excellent metafield data that filter apps consume, not to build a competing filter. 4-6 weeks of dev time is better spent on features in our core competency.

### Auto-Collection Assignment
**Originally proposed as Phase 3 (2-3 weeks effort)**
**Why rejected:** Shopify Smart Collections already auto-assign products based on tag conditions. VisionTags generates exactly the tags that Smart Collections use. This means the feature already exists natively. What merchants actually need is documentation: "How to create Smart Collections using VisionTags tags." That's a help article, not a feature.

### Cross-Channel Feed Optimization
**Originally proposed as Phase 3 (4-6 weeks effort)**
**Why rejected:** DataFeedWatch ($64+/mo, 8,000+ users), AdNabu ($15+/mo), and GoDataFeed dominate this space with years of product maturity. VisionTags should be the enrichment layer that makes feed apps better, not a competing feed tool. The right play is partnerships: "Use VisionTags to enrich your product data, then use DataFeedWatch to distribute it."

### API Access
**Originally proposed as Phase 3 (2-3 weeks effort)**
**Why rejected:** Premature at 1 customer. No one is asking for API access. Building and maintaining an API adds security risk, documentation burden, and versioning complexity. Revisit when we have 100+ customers and explicit agency demand.

### Image Compression/Optimization
**Why rejected:** Commodity feature. TinyIMG, Crush.pics, and StoreSEO all do this well. Not our core competency.

### A/B Testing Tags
**Why rejected:** Too complex for target audience. Merchants don't A/B test tags. Results take weeks. Better to generate the best tags in the first place.

### Blog Post Generation
**Why rejected:** Tangential to product enrichment. StoreYa does this well. Different product category entirely.

### White-Label/Agency Platform
**Why rejected:** Need product-market fit first. Revisit after API access (which itself needs 100+ customers).

### Revert/Undo Button
**Why rejected:** Merchants review before syncing (that's the whole UX). Implementing revert requires storing full product state snapshots (expensive, complex). Better to improve the preview/edit UX so merchants catch issues before syncing.

---

## Revenue Projections (Revised)

### Assumptions
- Monthly organic installs: 30/mo growing to 150/mo over 12 months
- Free-to-paid conversion: 12-15%
- Monthly churn: 7%
- Shopify takes 20% of revenue (we net 80%)

### Scenario 1: Current Pricing, No New Features

| Month | Installs | Paying | MRR | Net (80%) |
|-------|---------|--------|-----|-----------|
| 3 | 120 | 14 | $266 | $213 |
| 6 | 330 | 36 | $684 | $547 |
| 12 | 900 | 85 | $1,615 | $1,292 |

**Year 1 net revenue: ~$8,800**

### Scenario 2: New Pricing ($29/$79) + Phase 1 Features

Assumes 15% conversion (better features), distribution: 60% Pro ($29), 40% Business ($79).

| Month | Installs | Paying | ARPU | MRR | Net (80%) |
|-------|---------|--------|------|-----|-----------|
| 3 | 150 | 22 | $49 | $1,078 | $862 |
| 6 | 420 | 55 | $49 | $2,695 | $2,156 |
| 12 | 1,100 | 130 | $49 | $6,370 | $5,096 |

**Year 1 net revenue: ~$35,000**

### Scenario 3: Full Roadmap + Active Distribution

Assumes 200/mo installs by month 6, 18% conversion, 5.5% churn (stickier product), 55% Pro / 45% Business.

| Month | Installs | Paying | ARPU | MRR | Net (80%) |
|-------|---------|--------|------|-----|-----------|
| 3 | 180 | 32 | $51 | $1,632 | $1,306 |
| 6 | 600 | 95 | $54 | $5,130 | $4,104 |
| 12 | 1,800 | 260 | $56 | $14,560 | $11,648 |

**Year 1 net revenue: ~$75,000**

---

## Implementation Priority (Final)

| # | Feature | Effort | Revenue Impact | When |
|---|---------|--------|---------------|------|
| 1 | Bump free tier to 100 | 5 min | Medium | Now |
| 2 | ~~Descriptions + SEO fields~~ | ~~1 week~~ | ~~Very High~~ | ✅ Shipped Feb 19 |
| 3 | Settings page + custom prompts | 1 week | High | Now |
| 4 | Rescan failed products | 2-3 days | Low | Now |
| 5 | New pricing (3 tiers) | Config | Very High | After #2-3 ship |
| 6 | Vertical metafield schemas | 1-2 weeks | High | Month 2 |
| 7 | Catalog completeness widget | 3-5 days | Medium | Month 2 |
| 8 | AI Shopping Readiness score | 1 week | Medium | Month 2-3 |
| 9 | Multi-language (5 languages) | 2-3 weeks | Very High | Month 3 |
| 10 | Bulk edit UI | 2 weeks | Medium | Month 3-4 |
| 11 | Shopify Flow integration | 1-2 weeks | Medium | Month 4 |
| 12 | Multi-image analysis | 2-3 weeks | Medium | Month 5-6 |
| 13 | Enhanced metafield sync | 2-3 weeks | Medium | Month 6-7 |

**Total effort: ~4-5 months of focused development.**

---

## Key Metrics to Track

- **MRR** and **net revenue** (after Shopify's 20% cut)
- **App Store reviews** (target: 10 in 90 days, 50 in 6 months)
- **Free-to-paid conversion rate** (target: 12-18%)
- **Monthly churn rate** (target: under 7%)
- **ARPU** (target: $45-55 with new pricing)
- **Credits consumed per customer** (engagement indicator)
- **Scan-to-sync ratio** (are merchants using the results?)
- **Time to first scan** (onboarding quality)
- **Catalog completeness** per customer (retention indicator)

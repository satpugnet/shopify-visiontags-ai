# VisionTags: AI Product Enrichment

Shopify app that uses Claude Vision to auto-fill metafields, tags, descriptions, and SEO from product images.

## Project Status

- [x] Phase 1: Scaffolding complete
- [x] Phase 2: Database schema (Prisma/PostgreSQL)
- [x] Phase 3: Core services (vision, metafields, queue, products, billing)
- [x] Phase 4: UI routes (dashboard, job detail, webhooks)
- [x] Phase 5: Deployment (Railway) - Live at visiontags-ai-production.up.railway.app
- [x] Phase 6: App Store submission - Live on Shopify App Store (Feb 2026)

## External Accounts & Links

### Shopify Partner
- Partner Dashboard: https://partners.shopify.com
- Partner Account Email: saturnin.13@hotmail.fr
- Customer-facing Email: marco.a.duval@gmail.com (used for outreach to merchants)
- App Store Listing: https://apps.shopify.com/visiontags-ai
- App ID: 314277724161
- Partner ID: 4709749
- Partner Dashboard App URL: https://partners.shopify.com/4709749/apps/314277724161/overview
- App API Key: (in .env, do not commit)
- App Secret: (in .env, do not commit)
- Dev Store URL: `<TO_BE_FILLED>`

### Shopify Partner API
- Auth: `SHOPIFY_PARTNER_API_TOKEN` in `.env` (token prefix: `prtapi_`)
- Header: `X-Shopify-Access-Token: {token}` (NOT `Authorization: Bearer`)
- API Version: Use `2025-07` or later (2025-04 does NOT work with this token). Confirmed: 2025-07, 2025-10, 2026-01, 2026-04, unstable.
- Endpoint: `https://partners.shopify.com/4709749/api/{version}/graphql.json`
- App GID: `gid://partners/App/314277724161`
- Available event types: RELATIONSHIP_INSTALLED, RELATIONSHIP_UNINSTALLED, RELATIONSHIP_DEACTIVATED, RELATIONSHIP_REACTIVATED, SUBSCRIPTION_CHARGE_ACTIVATED, SUBSCRIPTION_CHARGE_CANCELED, SUBSCRIPTION_CHARGE_DECLINED, SUBSCRIPTION_CHARGE_EXPIRED, SUBSCRIPTION_CHARGE_FROZEN, SUBSCRIPTION_CHARGE_UNFROZEN, ONE_TIME_CHARGE_ACCEPTED, ONE_TIME_CHARGE_ACTIVATED, ONE_TIME_CHARGE_DECLINED, ONE_TIME_CHARGE_EXPIRED, CREDIT_APPLIED, CREDIT_FAILED, CREDIT_PENDING, USAGE_CHARGE_APPLIED
- NOT available via API: App reviews, merchant messages, app listing analytics. Must check Partner Dashboard UI.

### Railway
- Dashboard: https://railway.app
- Project URL: `<TO_BE_FILLED>`
- PostgreSQL Connection: (in .env)
- Redis Connection: (in .env)

### AI API (OpenRouter)
- Provider: OpenRouter (Anthropic Skin) routing to Claude Haiku 4.5
- Auth: `OPENROUTER_API_KEY` in `.env`
- Model: `anthropic/claude-haiku-4-5`
- Balance check: `curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" "https://openrouter.ai/api/v1/auth/key"` (fields: `usage`, `usage_monthly`, `limit`, `limit_remaining`)
- Cost per scan: ~$0.004 (1024 max_tokens)

### Production Database (Direct Access)
- Connection: `DATABASE_URL` in `.env`
- Check installs: `psql "$DATABASE_URL" -c 'SELECT shop, plan, "creditsUsed", "creditLimit", "createdAt"::date FROM "ShopSettings" ORDER BY "createdAt";'`
- Check usage: `psql "$DATABASE_URL" -c 'SELECT shop, month, count FROM "UsageRecord" ORDER BY month, shop;'`
- Check jobs: `psql "$DATABASE_URL" -c 'SELECT shop, status, "totalItems", processed, "createdAt"::date FROM "Job" ORDER BY "createdAt" DESC LIMIT 20;'`

### Sentry (Error Tracking)
- Dashboard: https://shopify-visiontags-ai.sentry.io
- Project: visiontags
- DSN: (in .env)
- Auth Token: (in .env, for API access)
- Check unresolved issues: `curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" "https://sentry.io/api/0/projects/shopify-visiontags-ai/visiontags/issues/?query=is:unresolved"`

## Environment Variables Checklist

- [ ] DATABASE_URL - PostgreSQL connection string
- [ ] REDIS_URL - Redis connection string for BullMQ
- [ ] OPENROUTER_API_KEY - OpenRouter API key (routes to Claude Haiku via Anthropic Skin)
- [ ] SENTRY_DSN - Sentry error tracking DSN (optional, disables if not set)
- [ ] SHOPIFY_API_KEY - From Partner Dashboard
- [ ] SHOPIFY_API_SECRET - From Partner Dashboard
- [ ] SHOPIFY_APP_URL - Your app's public URL
- [ ] SCOPES - read_products,write_products
- [ ] SHOPIFY_APP_HANDLE - App handle for Managed Pricing URLs (e.g., "visiontags")

## Tech Stack

- **Framework**: Remix (Shopify App Template)
- **Database**: PostgreSQL (via Prisma)
- **Queue**: BullMQ + Redis
- **AI**: Claude Haiku 4.5 via OpenRouter (anthropic/claude-haiku-4.5)
- **UI**: Polaris + App Bridge
- **Deployment**: Railway (recommended)

## Key Files

```
app/
├── services/
│   ├── vision.server.ts      # Claude API for image analysis
│   ├── metafields.server.ts  # Shopify metafield operations
│   ├── queue.server.ts       # BullMQ background processing
│   ├── products.server.ts    # Shopify product operations
│   └── billing.server.ts     # Subscription & credit management
├── routes/
│   ├── app._index.tsx        # Dashboard
│   ├── app.jobs.$id.tsx      # Job detail & sync page
│   └── webhooks.products.create.tsx  # Auto-sync webhook
└── db.server.ts              # Prisma client
```

## Pricing Model (Credit-Based)

| Plan  | Price   | Credits/mo | Features |
|-------|---------|------------|----------|
| Free  | $0      | 50         | Basic scan |
| Pro   | $19/mo  | 5,000      | Auto-sync, all features |

Hard cap at plan limit — no overage. Credits reset each billing cycle.
Uses Shopify Managed Pricing (fixed recurring only, no usage-based billing).

### Cost Analysis (Claude Haiku 4.5)
- Cost per scan: ~$0.004 (1024 max_tokens)
- Free (50 scans): ~$0.20 cost (acquisition)
- Pro (5,000 scans): ~$20 cost, break-even at $19 (reinforces case for $29 pricing)

## Current Progress

**Last updated**: Jul 26, 2026
**Current phase**: Live on Shopify App Store
**Billing**: Uses Shopify Managed Pricing (plans configured in Partner Dashboard, NOT in code)
**Merchants (as of Jul 26, 2026, from production DB)**: 26 total installs, all on FREE plan. **0 paying — $0 MRR.** The former Pro customer (`resalefirm.myshopify.com`, 816 scans in Mar 2026 — the "Phoenix Publishing" first-paying customer) has churned back to FREE. No active subscription charges (confirmed via Partner API: no `SUBSCRIPTION_CHARGE_ACTIVATED` events in recent history). Several free installs hit the 50-credit cap and uninstalled rather than upgrading (`bgjgv1-6z`, `0fe70f-2c`, `a2f506-2`) — the paid-conversion leak. Steady trickle of new installs continues (last install Jul 26).
**Next steps**:
1. Grow distribution (App Store SEO, content marketing, direct outreach)
2. Iterate based on customer feedback
3. Ship Phase 1 quick wins: settings page + custom prompts, rescan failed, free tier bump
4. Implement new 3-tier pricing ($0/$29/$79)

## Development Commands

```bash
# Install dependencies
npm install

# Run locally (requires Shopify CLI auth)
npm run dev

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Deploy to Railway
railway up
```

## Known Issues / Blockers

- None currently

## Resolved Issues

- Fixed: Metafield sync failing due to reserved 'shopify' namespace (changed to 'custom')
- Fixed: Billing API conflict with Managed Pricing (switched to Shopify's hosted plan picker)
- Fixed: AI scans failing due to deprecated model ID (updated to claude-haiku-4-5-20251001)
- Fixed: Image URL optimization breaking non-Shopify CDN URLs (added domain check)
- Fixed: Deployment script using `prisma migrate deploy` instead of `prisma db push` (broke new column deployments)

## Recent Changes

- **Feb 20, 2026**: Migrated from Anthropic API to OpenRouter (Anthropic Skin) for better rate limits. Added Sentry error tracking (vision service + queue worker). Added dry run mode for stress testing. Raised scan limit from 100 to plan-based (50 Free / 500 Pro).
- **Feb 19, 2026**: Shipped product descriptions + SEO generation (descriptions, SEO titles, meta descriptions generated from product images). Updated App Store listing with new features and search terms. Published Medium article on AI shopping readiness.

## Customers & Contacts

| Store | Email | Plan | Joined | Notes |
|-------|-------|------|--------|-------|
| Phoenix Publishing | phoenix.publishing.com@gmail.com | Pro ($19/mo) | Feb 2026 | First paying customer. Applied $5 discount for 1 month. Sent thank-you email from marco.a.duval@gmail.com (Feb 19, 2026) requesting feedback and App Store review. |
| AURASPINE | Unknown | Unknown | ~Feb 20, 2026 | New customer, appeared organically (not from known outreach). Origin unverified. |
| pro-grab-bar.myshopify.com | Unknown | Unknown | ~Feb 20, 2026 | Seen in production webhook logs (products/update). App installed. |
| Patched Works (patchedworks.com) | julie@patchedworks.com | Churned (Free) | Mar 16, 2026 | Quilting fabric & kits shop, Elm Grove WI. 10,000+ item catalog. Installed and uninstalled in 13 min. Wanted bulk color identification. ChatGPT recommended the app. Didn't realize it extracts color. Sent win-back email from marco.a.duval@gmail.com (Mar 19, 2026) explaining color extraction workflow and offering 50-item free test. |
| Demo Store (seth-beer-dev) | Unknown | Free | Mar 12, 2026 | Likely a test/dev store, not a real merchant. |

### Community Contacts (from `COMMUNITY_OUTREACH.md`)

| Person | Thread | Context |
|--------|--------|---------|
| @Michael42 | [Auto fill metafields](https://community.shopify.com/t/automatically-fill-out-product-metafields/302953) | Struggling with Shopify Flow for metafields. Reply drafted. |
| @Yasin4 | [Product keywords](https://community.shopify.com/t/how-do-you-come-up-with-keywords-for-your-products/550290) | Suggested image analysis approach. Reply drafted building on their idea. |
| (OP) | [Populate metafields on creation](https://community.shopify.com/t/on-product-creation-populate-metafields-with-pre-defined-data/334809) | Looking for metaobject alternatives. Reply drafted. |

## Distribution Strategy

| Channel | Status | Details |
|---------|--------|---------|
| Shopify App Store | Live | Listing at https://apps.shopify.com/visiontags-ai. Optimized with 5 search terms: AI tags, product tags, metafields, SEO description, alt text. See `APP_LISTING.md` for full copy. |
| Medium (content marketing) | Published Feb 19, 2026 | "How to Make Your Shopify Products Discoverable by ChatGPT Shopping and Perplexity" - https://medium.com/p/55a2354327bc. Topics: AI, E-Commerce, Shopify, ChatGPT, SEO. |
| Shopify Community forums | Drafted, not posted | 3 reply templates ready in `COMMUNITY_OUTREACH.md`. Account (marcoduval) was under review as of Feb 19, 2026. Targets threads about auto-filling metafields, product keywords. |
| Direct outreach | Active | Using marco.a.duval@gmail.com. Sent thank-you + review request to Phoenix Publishing (first paying customer). |
| Product demo video | Published | https://youtu.be/AUxcuY3qSDo |
| App Store screenshots | Needs update | TODO: Update screenshots to show description & SEO fields in latest UI. |

## Distribution Channels (Trackable)

| Channel | URL | Fetch Method | Status |
|---------|-----|-------------|--------|
| Reddit r/ShopifyAppDev | https://www.reddit.com/r/ShopifyAppDev/comments/1rk87l0/ | Chrome | Active |
| Medium article | https://medium.com/p/55a2354327bc | Chrome | Active |
| YouTube demo | https://youtu.be/AUxcuY3qSDo | Chrome | Active |
| Shopify App Store | https://apps.shopify.com/visiontags-ai | WebFetch | Active |
| Shopify Community #302953 | https://community.shopify.com/t/automatically-fill-out-product-metafields/302953 | WebFetch | Not posted |
| Shopify Community #334809 | https://community.shopify.com/t/on-product-creation-populate-metafields-with-pre-defined-data/334809 | WebFetch | Not posted |
| Shopify Community #550290 | https://community.shopify.com/t/how-do-you-come-up-with-keywords-for-your-products/550290 | WebFetch | Not posted |
| Direct outreach | - | Gmail MCP (marco.a.duval@gmail.com) | Active |

## Marketing Assets

- **Product Demo Video**: https://youtu.be/AUxcuY3qSDo
- **Medium Article**: "How to Make Your Shopify Products Discoverable by ChatGPT Shopping and Perplexity" - https://medium.com/p/55a2354327bc (published Feb 19, 2026)

## Notes

- Image optimization: We append `_800x800` to Shopify CDN URLs (only cdn.shopify.com) to save Claude API tokens
- Credit system prevents API cost overruns
- Auto-sync (products/create webhook) is a Pro-only feature
- Billing uses Managed Pricing: plans defined in Partner Dashboard, upgrade redirects to Shopify's hosted plan picker
- app_subscriptions/update webhook syncs plan changes to local DB
- Descriptions wrapped in `<p>` tags for `descriptionHtml`. Claude returns plain text.
- Description/SEO fields are optional in VisionResult. Scans succeed even if Claude omits them.
- V1 simplifications: No revert button, no settings page, basic taxonomy validation, no multi-language

## Business Metrics
- **North star**: Active merchants who have run at least one scan
- **Health signals**: New installs, scans completed, products synced, Pro upgrades
- **Red flags**: Merchants with 0 scans (installed but never used), uninstalls, rising Sentry errors, jobs stuck in non-terminal status

## Costs
- **Railway** (hosting + Postgres + Redis): Free tier
- **OpenRouter** (AI scans): Prepaid credits, usage-based at ~$0.004/scan. Check balance via API (see AI API section above).
- **Sentry** (error tracking): Free tier
- **Shopify Partner**: Free
- **Total fixed monthly: $0**. Only variable cost is OpenRouter usage per scan.

## TODO

- [ ] Update Shopify App Store screenshots to show the latest UI (including description & SEO fields)

# VisionTags: AI Tags & Metafields

Shopify app that uses Claude Vision to auto-fill BOTH metafields AND tags from product images.

## Project Status

- [x] Phase 1: Scaffolding complete
- [x] Phase 2: Database schema (Prisma/PostgreSQL)
- [x] Phase 3: Core services (vision, metafields, queue, products, billing)
- [x] Phase 4: UI routes (dashboard, job detail, webhooks)
- [x] Phase 5: Deployment (Railway) - Live at visiontags-ai-production.up.railway.app
- [ ] Phase 6: App Store submission

## External Accounts & Links

### Shopify Partner
- Partner Dashboard: https://partners.shopify.com
- Partner Account Email: saturnin.13@hotmail.fr
- App ID: `<TO_BE_FILLED_AFTER_APP_CREATION>`
- App API Key: (in .env, do not commit)
- App Secret: (in .env, do not commit)
- Dev Store URL: `<TO_BE_FILLED>`

### Railway
- Dashboard: https://railway.app
- Project URL: `<TO_BE_FILLED>`
- PostgreSQL Connection: (in .env)
- Redis Connection: (in .env)

### Anthropic
- Console: https://console.anthropic.com
- API Key: (in .env, do not commit)

## Environment Variables Checklist

- [ ] DATABASE_URL - PostgreSQL connection string
- [ ] REDIS_URL - Redis connection string for BullMQ
- [ ] ANTHROPIC_API_KEY - Claude API key
- [ ] SHOPIFY_API_KEY - From Partner Dashboard
- [ ] SHOPIFY_API_SECRET - From Partner Dashboard
- [ ] SHOPIFY_APP_URL - Your app's public URL
- [ ] SCOPES - read_products,write_products
- [ ] SHOPIFY_APP_HANDLE - App handle for Managed Pricing URLs (e.g., "visiontags")

## Tech Stack

- **Framework**: Remix (Shopify App Template)
- **Database**: PostgreSQL (via Prisma)
- **Queue**: BullMQ + Redis
- **AI**: Claude Haiku 4.5 (claude-haiku-4-5-20251001)
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
- Cost per scan: ~$0.003
- Free (50 scans): ~$0.15 cost (acquisition)
- Pro (5,000 scans): ~$15 cost, $4 profit (21% margin)

## Current Progress

**Last updated**: February 2026
**Current phase**: Phase 6 - App Store Submission (in review, fixing feedback)
**Billing**: Uses Shopify Managed Pricing (plans configured in Partner Dashboard, NOT in code)
**Next steps**:
1. Deploy fixes for review feedback (billing + scan errors)
2. Set SHOPIFY_APP_HANDLE env var in Railway
3. Verify app handle in Partner Dashboard matches config
4. Reply to Shopify review email (Ref: 101137)

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

## Notes

- Image optimization: We append `_800x800` to Shopify CDN URLs (only cdn.shopify.com) to save Claude API tokens
- Credit system prevents API cost overruns
- Auto-sync (products/create webhook) is a Pro-only feature
- Billing uses Managed Pricing: plans defined in Partner Dashboard, upgrade redirects to Shopify's hosted plan picker
- app_subscriptions/update webhook syncs plan changes to local DB
- V1 simplifications: No revert button, no settings page, basic taxonomy validation

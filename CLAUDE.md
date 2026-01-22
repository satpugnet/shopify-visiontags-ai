# VisionTags: AI Tags & Metafields

Shopify app that uses Claude Vision to auto-fill BOTH metafields AND tags from product images.

## Project Status

- [x] Phase 1: Scaffolding complete
- [x] Phase 2: Database schema (Prisma/PostgreSQL)
- [x] Phase 3: Core services (vision, metafields, queue, products, billing)
- [x] Phase 4: UI routes (dashboard, job detail, webhooks)
- [ ] Phase 5: Deployment (Railway)
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

## Tech Stack

- **Framework**: Remix (Shopify App Template)
- **Database**: PostgreSQL (via Prisma)
- **Queue**: BullMQ + Redis
- **AI**: Claude Sonnet 4 (claude-sonnet-4-20250514)
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
| Pro   | $19/mo  | 2,000      | Auto-sync, all features |

## Current Progress

**Last updated**: January 2025
**Current phase**: Phase 4 Complete - Ready for Phase 5 (Deployment)
**Next steps**:
1. Create Railway account and project
2. Deploy app to Railway
3. Create app in Shopify Partner Dashboard
4. Connect deployed app to Shopify

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

## Notes

- Image optimization: We append `_800x800` to Shopify CDN URLs to save Claude API tokens
- Credit system prevents API cost overruns
- Auto-sync (products/create webhook) is a Pro-only feature
- V1 simplifications: No revert button, no settings page, basic taxonomy validation

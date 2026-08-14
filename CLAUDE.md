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
- Dev Store URL: visiontags-dev.myshopify.com (has the app installed; seen in production DB with 46 scanned products)

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
│   ├── products.server.ts    # Shopify product operations + scan tag filter
│   ├── tagSchema.ts          # Key:Value tag schema (pure, isomorphic)
│   ├── tagSchema.server.ts   # Prisma Json bridging for the above
│   └── billing.server.ts     # Subscription & credit management
├── routes/
│   ├── app._index.tsx        # Dashboard
│   ├── app.settings.tsx      # Tag format & schema editor
│   ├── app.jobs.$id.tsx      # Job detail & sync page
│   └── webhooks.products.create.tsx  # Auto-sync webhook
└── db.server.ts              # Prisma client
```

## Pricing Model (Credit-Based)

| Plan  | Price   | Credits/mo | Per-run limit | Features |
|-------|---------|------------|---------------|----------|
| Free  | $0      | 50         | 50            | Basic scan |
| Pro   | $19/mo (or $199/yr) | 5,000 | 500   | Auto-sync, all features |
| Scale | $79/mo  | 15,000     | 2,000         | Everything in Pro, high-volume backfills |

Hard cap at plan limit — no overage. Credits reset each billing cycle.
Uses Shopify Managed Pricing (fixed recurring only, no usage-based billing).

**IMPORTANT — plan display names are a contract**: the app resolves plans from the
Managed Pricing plan Display Name ("Free"/"Pro"/"Scale", case-insensitive) in
`billing.server.ts` (`resolvePlanFromSubscriptionName`). Renaming a plan in the
Partner Dashboard breaks plan resolution (unknown paid names fall back to PRO and
log `PLAN_NAME_UNRECOGNIZED`).

Scans skip already-analyzed products via the `ScannedProduct` ledger (cross-run
dedup, no double-charging); merchants can rescan via the "Include already-scanned
products" checkbox. Failed scans can be retried free from the job page.

### Tag Format (Settings page)

Merchants choose between free-form phrase tags (default) and `Key:Value` tags
driven by a schema they define at `/app/settings` (keys, plus optional allowed
values per key). All plans, no gating.

- Pure schema logic lives in `app/services/tagSchema.ts` (isomorphic, so the
  settings page can parse and preview client-side); `tagSchema.server.ts` only
  bridges Prisma `Json?` columns.
- In `KEY_VALUE` mode the AI is asked for a `tag_attributes` **object**, not
  pre-joined strings, then values are snapped onto the merchant's vocabulary
  (exact, then loose, then alias, then unambiguous containment). Canonical casing
  always comes from the schema, never the model. Rejected values are stored on
  `Product.rejectedTagAttributes`.
- **Tag settings are snapshot onto `Job`** at scan start (`tagFormat`,
  `tagSchema`). The worker reads them from the Job only, never live from
  `ShopSettings` — a live read would let one run span two schema versions. Every
  job creator must snapshot (dashboard + both product webhooks).
- The prompt must keep the "never translate a key or listed value" rule: the
  surrounding language rule would otherwise turn `Color` into `Couleur` for a
  non-English store and every attribute would be rejected.

### Tag writes are a merge, never a replace

`updateProductTags` uses `productUpdate`, which replaces a product's entire tag
list, so the merged list is computed before writing:

- `KEY_VALUE`: a key's existing tags are replaced **only when the AI returned a
  value for that key**. The prompt tells the model to omit keys it cannot assess,
  so treating "no answer" as "delete what's there" would routinely destroy
  attributes the merchant had already filled in. Keys the AI skipped are left
  alone; every non-schema tag always survives.
- `FREEFORM`: union, nothing is ever removed.
- An empty suggestion list is never a request to clear tags — it means the scan
  produced nothing usable, and no write happens.

Live tags are read at apply time (`fetchProductSyncState`), not taken from the
scan-time `Product.currentTags` snapshot. If that read fails the tag write is
**refused** rather than falling back to a replace. This costs one extra Admin API
read per product on every tag-syncing apply (it is what makes the merge safe);
worth knowing before a large backfill, since a 2,000-product Scale job
auto-chains in 50-product batches.

`Product.appliedTags` records exactly what was written so `revert-all` undoes only
our delta. Revert covers any product with `appliedTags`, not just `SYNCED` ones,
because a tag write can land while another field fails. For products applied
before that column existed it falls back to `suggestedTags` as the record of what
was written — never a full replace from `currentTags`, which would delete
everything the merchant added since the scan.

### Scan tag filter

The scan form can target a tagging state: any / no tags / has tags / missing a
specific key (one option per schema key). `-tag:*` and `tag:*` narrow the query
server-side on the all-products path; `MISSING_KEY` cannot be expressed in
Shopify search syntax and is client-side only, as is everything on the collection
path (`collection.products` takes no `query` argument). If Shopify **rejects** a
narrowed query (errors, no products payload) the query is dropped and the walk
falls back to client-side filtering, so a syntax surprise can never look like "no
products match". An empty result is *not* treated as a rejection: `-tag:*` on a
fully tagged catalog legitimately matches nothing.
Selection is bounded by a 15s wall-clock budget (it runs synchronously inside the
Remix action); partial batches are safe because the ledger makes the next run
resume.

### Cost Analysis (Claude Haiku 4.5)
- Cost per scan: ~$0.004 (1024 max_tokens)
- Free (50 scans): ~$0.20 cost (acquisition)
- Pro (5,000 scans): ~$20 cost, break-even at $19 (reinforces case for $29 pricing)
- Scale (15,000 scans): ~$60 cost worst case at $79 (thin if maxed; typical usage is partial — LaFetch's 11k backfill ≈ $44)

## Current Progress

**Last updated**: Aug 14, 2026
**Current phase**: Live on Shopify App Store
**Billing**: Uses Shopify Managed Pricing (plans configured in Partner Dashboard, NOT in code)
**Merchants (as of Jul 26, 2026, from production DB)**: 26 total installs, all on FREE plan. **0 paying — $0 MRR.** The former Pro customer (`resalefirm.myshopify.com`, 816 scans in Mar 2026 — the "Phoenix Publishing" first-paying customer) has churned back to FREE. No active subscription charges (confirmed via Partner API: no `SUBSCRIPTION_CHARGE_ACTIVATED` events in recent history). Several free installs hit the 50-credit cap and uninstalled rather than upgrading (`bgjgv1-6z`, `0fe70f-2c`, `a2f506-2`) — the paid-conversion leak. Steady trickle of new installs continues (last install Jul 26).
**Next steps**:
1. Create the "Scale" plan in the Partner Dashboard Managed Pricing UI ($79/mo, display name exactly `Scale`, 0 trial days) — code shipped Aug 11, waiting on this manual step
2. Reply to LaFetch (Sagar@la-fetch.com): Key:Value tags + tag filters shipped Aug 14; get them upgraded to Scale for the 12k backfill
3. Reinstall the app on the dev store so end-to-end testing works again (token revoked)
4. Grow distribution (App Store SEO, content marketing, direct outreach)
5. Remaining quick wins: custom prompts on the settings page, free tier bump, Pro repricing to $29
6. Fast-follow: job-detail page pagination (2,000-row Scale jobs load unpaginated), jobs history page, collections picker >50, surface `Product.rejectedTagAttributes` as a "the AI proposed N values your schema rejects — add them?" prompt

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

- **Dev store token is revoked.** The stored `Session` row for
  `visiontags-dev.myshopify.com` returns "Invalid API key or access token", so the
  app cannot be exercised against it without reinstalling. This blocked verifying
  the `-tag:*` / `tag:*` search syntax against a real store (mitigated in code by
  the empty-first-page fallback, see Scan tag filter above). Reinstall the app on
  the dev store to restore end-to-end testing.

## Resolved Issues

- Fixed: Metafield sync failing due to reserved 'shopify' namespace (changed to 'custom')
- Fixed: Billing API conflict with Managed Pricing (switched to Shopify's hosted plan picker)
- Fixed: AI scans failing due to deprecated model ID (updated to claude-haiku-4-5-20251001)
- Fixed: Image URL optimization breaking non-Shopify CDN URLs (added domain check)
- Fixed: Deployment script using `prisma migrate deploy` instead of `prisma db push` (broke new column deployments)

## Recent Changes

- **Aug 14, 2026**: Second LaFetch feedback package. (1) **Merchant-defined `Key:Value` tags**: new Settings page (`/app/settings`, first entry in the nav) where a merchant switches tag format and defines keys with optional allowed values, entered as bulk text (`Color: Black, Navy`) with a live parsed preview and a "Prefill from my catalog" button that reads existing `Key:Value` tags via paginated `QueryRoot.productTags`. Vision asks for a `tag_attributes` object in this mode and normalizes it against the schema. (2) **Tag writes now merge instead of replace** — this was a live data-loss bug: applying a scan overwrote the product's whole tag list, destroying any tag VisionTags did not generate (112 products across 9 shops already affected; LaFetch had never applied, so their catalog was untouched). Revert now undoes only our delta via the new `Product.appliedTags`. (3) **Scan tag filter**: any / no tags / has tags / missing a specific key, with server-side narrowing where Shopify supports it and a self-healing fallback. (4) Prisma: `ShopSettings.tagFormat|tagSchema`, `Job.tagFormat|tagSchema|tagFilter`, `Product.appliedTags|rejectedTagAttributes` (all additive). `max_tokens` raised 1024 → 2048. `analyzeProductImage` now takes an options object. Trigger: Sagar at LaFetch emailed Aug 14 asking for a configurable Key:Value tag structure and a way to target untagged products.
- **Aug 11, 2026**: Shipped the LaFetch feedback package: (1) Scale plan ($79/mo, 15,000 credits, 2,000 products/run) — plan resolution refactored to name-based `setPlan`/resolvers supporting 3 tiers; (2) `ScannedProduct` cross-run ledger — scans now skip already-analyzed products and keep paginating until the batch fills with new ones (fixes "All products" runs re-scanning the same first 500 and double-charging); "Include already-scanned" checkbox for intentional rescans; "Products scanned X/N" progress on dashboard; (3) fixed broken "Apply to Shopify" auto-chain (server-selected 50-product batches, client resubmits until done — was 1 click per 50 products); (4) "Retry failed scans" button, free (no credit charge); (5) worker job-progress query fixed (was O(n²) at large runs); (6) security: job loader/actions now scoped to the authenticated shop; (7) backfill script `scripts/backfill-scan-ledger.ts` (run once after deploy). Trigger: LaFetch (la-fetch.myshopify.com, Pro) emailed Aug 11 asking how to backfill an 11k-product catalog — their two 500-product runs on Aug 10 had 100% overlap (500 credits double-charged, refunded).
- **Feb 20, 2026**: Migrated from Anthropic API to OpenRouter (Anthropic Skin) for better rate limits. Added Sentry error tracking (vision service + queue worker). Added dry run mode for stress testing. Raised scan limit from 100 to plan-based (50 Free / 500 Pro).
- **Feb 19, 2026**: Shipped product descriptions + SEO generation (descriptions, SEO titles, meta descriptions generated from product images). Updated App Store listing with new features and search terms. Published Medium article on AI shopping readiness.

## Customers & Contacts

| Store | Email | Plan | Joined | Notes |
|-------|-------|------|--------|-------|
| LaFetch (la-fetch.myshopify.com, la-fetch.com) | Sagar@la-fetch.com (Sagar Joon, AI Developer) | Pro ($19/mo) | Aug 10, 2026 | Second paying customer. ~12,000-product catalog, doing a one-time tagging backfill. Emailed Aug 11 (bulk credits, per-run limits, untagged-only filtering, double-charging) → Scale plan + scan ledger release. Emailed Aug 14 asking for configurable `Key:Value` tags with their own allowed values, plus tagging-state filters → Aug 14 release. Their two 500-product runs on Aug 10 overlapped 100%; 500 credits refunded. **Has never applied to Shopify** (0 synced across all 5 jobs as of Aug 14), so the pre-Aug-14 tag-replace bug never touched their catalog. Target: upgrade to Scale for one month to complete the backfill. |
| Phoenix Publishing | phoenix.publishing.com@gmail.com | Pro ($19/mo) | Feb 2026 | First paying customer. Applied $5 discount for 1 month. Sent thank-you email from marco.a.duval@gmail.com (Feb 19, 2026) requesting feedback and App Store review. Churned back to FREE (as of Jul 2026). |
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
- Remaining simplifications: basic taxonomy validation, no custom prompts, no per-collection tag schemas. (Revert, multi-language and the settings page have since shipped.)

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

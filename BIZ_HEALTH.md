# Business Health: VisionTags AI

## Overview
- **Business model**: SaaS (Shopify App)
- **Launched**: Feb 2026
- **Pricing**: Free ($0, 50 credits/mo) / Pro ($19/mo, 5,000 credits/mo)
- **App Store**: https://apps.shopify.com/visiontags-ai

## Data Sources

### Production Database
- **Connection**: `DATABASE_URL` in `.env`
- **Queries**:
  - Customers by plan: `SELECT plan, COUNT(*) FROM "ShopSettings" GROUP BY plan;`
  - Recent signups (7d): `SELECT shop, plan, "createdAt"::date AS joined FROM "ShopSettings" WHERE "createdAt" > NOW() - INTERVAL '7 days' ORDER BY "createdAt" DESC;`
  - All customers: `SELECT shop, plan, "creditsUsed", "creditLimit", "createdAt"::date AS joined FROM "ShopSettings" ORDER BY "createdAt" DESC;`
  - Usage this month: `SELECT shop, month, count FROM "UsageRecord" WHERE month = TO_CHAR(NOW(), 'YYYY-MM') ORDER BY count DESC;`
  - Recent jobs: `SELECT shop, status, "totalItems", processed, "createdAt"::date AS started FROM "Job" ORDER BY "createdAt" DESC LIMIT 10;`
  - Inactive merchants (installed but 0 scans): `SELECT s.shop, s.plan, s."createdAt"::date AS joined FROM "ShopSettings" s LEFT JOIN "Job" j ON s.shop = j.shop WHERE j.id IS NULL;`

### Error Tracking (Sentry)
- **Auth**: `SENTRY_AUTH_TOKEN` in `.env`
- **Org/Project**: `shopify-visiontags-ai/visiontags`
- **Checks**:
  - Unresolved issues: `curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" "https://sentry.io/api/0/projects/shopify-visiontags-ai/visiontags/issues/?query=is:unresolved"`
  - Recent events (24h): `curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" "https://sentry.io/api/0/projects/shopify-visiontags-ai/visiontags/issues/?query=is:unresolved&statsPeriod=24h&sort=freq"`

### Shopify Partner API
- **Auth**: `SHOPIFY_PARTNER_API_TOKEN` in `.env` (token prefix: `prtapi_`)
- **Org ID**: 4709749
- **App GID**: `gid://partners/App/314277724161`
- **API Version**: Use `2025-07` or later (2025-04 does NOT work with this token). Confirmed working versions: 2025-07, 2025-10, 2026-01, 2026-04, unstable.
- **Endpoint**: `https://partners.shopify.com/4709749/api/{version}/graphql.json`
- **Auth Header**: `X-Shopify-Access-Token: {token}` (NOT `Authorization: Bearer`)
- **Note**: Reviews and direct messages (e.g. from merchants via Partner Dashboard) are NOT available via API. Only uninstall reasons provide customer feedback. Check Partner Dashboard UI for reviews/messages.
- **Checks**:
  - Recent installs/uninstalls (30d):
    ```graphql
    query {
      app(id: "gid://partners/App/314277724161") {
        events(first: 20, types: [RELATIONSHIP_INSTALLED, RELATIONSHIP_UNINSTALLED]) {
          edges {
            node {
              type
              occurredAt
              shop { myshopifyDomain }
              ... on RelationshipUninstalled { reason description }
            }
          }
        }
      }
    }
    ```
  - Billing events (upgrades, cancellations, downgrades):
    ```graphql
    query {
      app(id: "gid://partners/App/314277724161") {
        events(first: 50, types: [
          SUBSCRIPTION_CHARGE_ACTIVATED,
          SUBSCRIPTION_CHARGE_CANCELED,
          SUBSCRIPTION_CHARGE_DECLINED,
          SUBSCRIPTION_CHARGE_FROZEN
        ]) {
          edges {
            node {
              type
              occurredAt
              shop { myshopifyDomain }
              ... on SubscriptionChargeActivated {
                charge { amount { amount currencyCode } }
              }
              ... on SubscriptionChargeCanceled {
                charge { amount { amount currencyCode } }
              }
              ... on SubscriptionChargeDeclined {
                charge { amount { amount currencyCode } }
              }
            }
          }
        }
      }
    }
    ```
- **Available event types** (full list for reference):
  - Install/uninstall: `RELATIONSHIP_INSTALLED`, `RELATIONSHIP_UNINSTALLED`, `RELATIONSHIP_DEACTIVATED`, `RELATIONSHIP_REACTIVATED`
  - Subscriptions: `SUBSCRIPTION_CHARGE_ACTIVATED`, `SUBSCRIPTION_CHARGE_CANCELED`, `SUBSCRIPTION_CHARGE_DECLINED`, `SUBSCRIPTION_CHARGE_EXPIRED`, `SUBSCRIPTION_CHARGE_FROZEN`, `SUBSCRIPTION_CHARGE_UNFROZEN`
  - One-time: `ONE_TIME_CHARGE_ACCEPTED`, `ONE_TIME_CHARGE_ACTIVATED`, `ONE_TIME_CHARGE_DECLINED`, `ONE_TIME_CHARGE_EXPIRED`
  - Credits: `CREDIT_APPLIED`, `CREDIT_FAILED`, `CREDIT_PENDING`
  - Usage: `USAGE_CHARGE_APPLIED`
- **Not available via API**: App reviews, merchant messages, app listing analytics. Must check Partner Dashboard UI.

## Key Metrics
- **North star**: Active merchants who have run at least one scan
- **Health signals**: New installs, scans completed, products synced, Pro upgrades
- **Red flags**: Merchants with 0 scans (installed but never used), uninstalls, rising Sentry errors, jobs stuck in non-terminal status

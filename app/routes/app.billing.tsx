import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  ProgressBar,
  Box,
  Divider,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getShopBilling,
  syncPlanFromShopify,
  getPlanPickerUrl,
  PLANS,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Sync plan status from Shopify before displaying
  await syncPlanFromShopify(admin, shop);

  const billing = await getShopBilling(shop);
  const planPickerUrl = getPlanPickerUrl(shop);

  return json({
    shop,
    billing,
    plans: PLANS,
    planPickerUrl,
  });
};

export default function Billing() {
  const { billing, plans, planPickerUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleManagePlan = () => {
    window.open(planPickerUrl, "_top");
  };

  const creditPercentage = Math.round(
    (billing.creditsUsed / billing.creditLimit) * 100
  );

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title="Billing & Subscription"
    >
      <TitleBar title="Billing" />

      <Box paddingBlockEnd="800">
        <BlockStack gap="500">
          {/* Current Plan */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Current Plan
              </Text>
              <Badge tone={billing.plan === "PRO" ? "success" : "info"}>
                {billing.plan}
              </Badge>
            </InlineStack>

            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="span" variant="bodyMd">
                  Credits used this month
                </Text>
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {billing.creditsUsed} / {billing.creditLimit}
                </Text>
              </InlineStack>

              <Box>
                <ProgressBar
                  progress={creditPercentage}
                  tone={creditPercentage > 90 ? "critical" : "primary"}
                  size="small"
                />
              </Box>

              <Text as="p" variant="bodySm" tone="subdued">
                {billing.creditsRemaining} credits remaining
              </Text>

              {billing.overageEnabled && billing.overageScans > 0 && (
                <BlockStack gap="100">
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Overage scans this month
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {billing.overageScans} scans
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Overage charges
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      ${billing.overageCharge.toFixed(2)} / ${billing.overageCap.toFixed(2)} cap
                    </Text>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>

            <Button onClick={handleManagePlan}>
              Manage Plan
            </Button>
          </BlockStack>
        </Card>

        {/* Upgrade Banner for Free Users */}
        {billing.plan === "FREE" && (
          <Banner
            title="Upgrade to Pro for more credits"
            tone="info"
            action={{
              content: "Upgrade Now",
              onAction: handleManagePlan,
            }}
          >
            <p>
              Get 5,000 AI scans per month, auto-sync for new products, and
              priority support.
            </p>
          </Banner>
        )}

        {/* Plan Comparison */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Free Plan
                  </Text>
                  <Text as="span" variant="headingLg">
                    $0
                  </Text>
                </InlineStack>

                <Divider />

                <BlockStack gap="200">
                  {plans.FREE.features.map((feature, i) => (
                    <InlineStack key={i} gap="200">
                      <Text as="span" variant="bodyMd">
                        {feature}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>

                {billing.plan === "FREE" && (
                  <Badge tone="success">Current Plan</Badge>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Pro Plan
                  </Text>
                  <Text as="span" variant="headingLg">
                    ${plans.PRO.price}/mo
                  </Text>
                </InlineStack>

                <Divider />

                <BlockStack gap="200">
                  {plans.PRO.features.map((feature, i) => (
                    <InlineStack key={i} gap="200">
                      <Text as="span" variant="bodyMd">
                        {feature}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>

                {billing.plan === "PRO" ? (
                  <Badge tone="success">Current Plan</Badge>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleManagePlan}
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* FAQ / Info */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Frequently Asked Questions
            </Text>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                When do credits reset?
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Credits reset at the start of each billing cycle (every 30
                days).
              </Text>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                What happens if I run out of credits?
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                You won't be able to start new AI scans until credits reset or
                you upgrade to Pro.
              </Text>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Can I cancel my Pro subscription?
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Yes, you can cancel anytime from your Shopify admin billing
                settings.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>
        </BlockStack>
      </Box>
    </Page>
  );
}

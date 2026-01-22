import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
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
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getShopBilling,
  createProSubscription,
  PLANS,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const billing = await getShopBilling(shop);

  return json({
    shop,
    billing,
    plans: PLANS,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "upgrade") {
    const result = await createProSubscription(admin, shop);

    if ("error" in result) {
      return json({ success: false, error: result.error });
    }

    // Redirect to Shopify's confirmation page
    return redirect(result.confirmationUrl);
  }

  return json({ success: false, error: "Unknown action" });
};

type ActionData = {
  success: boolean;
  error?: string;
};

export default function Billing() {
  const { billing, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const isUpgrading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleUpgrade = () => {
    fetcher.submit({ action: "upgrade" }, { method: "POST" });
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
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Upgrade Banner for Free Users */}
        {billing.plan === "FREE" && (
          <Banner
            title="Upgrade to Pro for more credits"
            tone="info"
            action={{
              content: "Upgrade Now",
              onAction: handleUpgrade,
              loading: isUpgrading,
            }}
          >
            <p>
              Get 2,000 AI scans per month, auto-sync for new products, and
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
                    onClick={handleUpgrade}
                    loading={isUpgrading}
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

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  ProgressBar,
  Button,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

interface ReadinessData {
  score: number;
  totalProducts: number;
  sampledProducts: number;
  categories: {
    name: string;
    label: string;
    filled: number;
    total: number;
    weight: number;
  }[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query readinessAudit($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            descriptionHtml
            tags
            seo {
              title
              description
            }
            featuredImage {
              url
              altText
            }
            metafields(first: 10, namespace: "custom") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }
      productsCount(limit: null) {
        count
      }
    }`,
    { variables: { first: 50 } }
  );

  const data = await response.json();
  const edges = data.data?.products?.edges || [];
  const totalProducts = data.data?.productsCount?.count || 0;
  const sampledProducts = edges.length;

  let descriptionFilled = 0;
  let altTextFilled = 0;
  let metafieldsFilled = 0;
  let seoTitleFilled = 0;
  let metaDescFilled = 0;
  let tagsFilled = 0;

  for (const edge of edges) {
    const product = edge.node;
    if (product.descriptionHtml && product.descriptionHtml.trim().length > 0) descriptionFilled++;
    if (product.featuredImage?.altText && product.featuredImage.altText.trim().length > 0) altTextFilled++;
    if (product.metafields?.edges?.length > 0) metafieldsFilled++;
    if (product.seo?.title && product.seo.title.trim().length > 0) seoTitleFilled++;
    if (product.seo?.description && product.seo.description.trim().length > 0) metaDescFilled++;
    if (product.tags && product.tags.length >= 3) tagsFilled++;
  }

  const categories = [
    { name: "description", label: "Product Description", filled: descriptionFilled, total: sampledProducts, weight: 20 },
    { name: "altText", label: "Image Alt Text", filled: altTextFilled, total: sampledProducts, weight: 15 },
    { name: "metafields", label: "Custom Metafields", filled: metafieldsFilled, total: sampledProducts, weight: 25 },
    { name: "seoTitle", label: "SEO Title", filled: seoTitleFilled, total: sampledProducts, weight: 15 },
    { name: "metaDescription", label: "Meta Description", filled: metaDescFilled, total: sampledProducts, weight: 15 },
    { name: "tags", label: "Tags (3+)", filled: tagsFilled, total: sampledProducts, weight: 10 },
  ];

  // Weighted average score
  const score = sampledProducts > 0
    ? Math.round(
        categories.reduce((sum, cat) => sum + (cat.filled / cat.total) * cat.weight, 0)
      )
    : 0;

  return json<ReadinessData>({ score, totalProducts, sampledProducts, categories });
};

export default function ReadinessScore() {
  const { score, totalProducts, sampledProducts, categories } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const scoreTone = score >= 70 ? "success" : score >= 40 ? "highlight" : "critical";

  return (
    <Page backAction={{ content: "Dashboard", onAction: () => navigate("/app") }} title="AI Readiness Score">
      <TitleBar title="AI Readiness Score" />

      <Box paddingBlockEnd="800">
        <BlockStack gap="500">
          <Card>
            <BlockStack gap="400" inlineAlign="center">
              <Text as="h2" variant="heading2xl" alignment="center">
                {score}/100
              </Text>
              <ProgressBar
                progress={score}
                tone={scoreTone}
                size="small"
              />
              <Text as="p" variant="bodyMd" alignment="center">
                AI agents like ChatGPT Shopping, Google AI Mode, and Perplexity use your product data to recommend products to shoppers. Missing descriptions, metafields, or SEO data means your products are invisible to these agents.
              </Text>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Category Breakdown</Text>
              {categories.map((cat) => {
                const pct = cat.total > 0 ? Math.round((cat.filled / cat.total) * 100) : 0;
                return (
                  <BlockStack gap="100" key={cat.name}>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">{cat.label} ({cat.weight}% weight)</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{cat.filled}/{cat.total} ({pct}%)</Text>
                    </InlineStack>
                    <ProgressBar
                      progress={pct}
                      tone={pct >= 70 ? "success" : pct >= 40 ? "highlight" : "critical"}
                      size="small"
                    />
                  </BlockStack>
                );
              })}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Text as="p" variant="bodyMd" alignment="center">
                One AI scan fills descriptions, metafields, tags, alt text, and SEO for all your products.
              </Text>
              <Button variant="primary" onClick={() => navigate("/app")}>Fix It All with AI Scan</Button>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Based on {sampledProducts} of {totalProducts} products
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Box>
    </Page>
  );
}

import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Terms of Service - VisionTags" },
    { name: "description", content: "Terms of Service for VisionTags Shopify App" },
  ];
};

export default function TermsOfService() {
  return (
    <div style={{
      maxWidth: "800px",
      margin: "0 auto",
      padding: "40px 20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      lineHeight: "1.6",
      color: "#333"
    }}>
      <h1 style={{ borderBottom: "2px solid #5c6ac4", paddingBottom: "10px" }}>
        Terms of Service
      </h1>
      <p style={{ color: "#666", marginBottom: "30px" }}>
        Last updated: January 2025
      </p>

      <p>
        These Terms of Service ("Terms") govern your use of VisionTags ("the App"),
        a Shopify application provided by VisionTags ("we", "us", or "our"). By
        installing or using the App, you agree to these Terms.
      </p>

      <h2>1. Service Description</h2>
      <p>
        VisionTags is an AI-powered application that analyzes your Shopify product
        images to automatically generate:
      </p>
      <ul>
        <li>Product metafields (color, material, pattern, etc.)</li>
        <li>SEO-optimized tags and keywords</li>
      </ul>
      <p>
        The App uses artificial intelligence to analyze images and suggest data.
        Results may vary and should be reviewed before syncing to your store.
      </p>

      <h2>2. Account and Access</h2>
      <ul>
        <li>You must have a valid Shopify store to use the App</li>
        <li>You are responsible for maintaining the security of your Shopify account</li>
        <li>You must provide accurate information when using the App</li>
        <li>You may not use the App for any illegal purposes</li>
      </ul>

      <h2>3. Subscription Plans and Billing</h2>

      <h3>Free Plan</h3>
      <ul>
        <li>50 AI scans per month</li>
        <li>Basic metafields and tags</li>
        <li>No credit card required</li>
      </ul>

      <h3>Pro Plan ($19/month)</h3>
      <ul>
        <li>2,000 AI scans per month</li>
        <li>All metafields and SEO tags</li>
        <li>Auto-sync for new products</li>
        <li>Priority support</li>
        <li>Pay-as-you-go overage ($0.01/scan, up to $50/month cap)</li>
      </ul>

      <h3>Billing Terms</h3>
      <ul>
        <li>All payments are processed through Shopify's billing system</li>
        <li>Subscriptions renew automatically every 30 days</li>
        <li>Credits reset at the start of each billing cycle</li>
        <li>Unused credits do not roll over</li>
        <li>You may cancel your subscription at any time through Shopify admin</li>
        <li>No refunds for partial billing periods</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the App to process images you don't have rights to use</li>
        <li>Attempt to circumvent usage limits or billing</li>
        <li>Reverse engineer, decompile, or disassemble the App</li>
        <li>Use the App in a way that could damage or impair Shopify's services</li>
        <li>Resell or redistribute the App's services</li>
        <li>Use automated systems to abuse the App's API</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <ul>
        <li>
          <strong>Your Content:</strong> You retain ownership of your product images
          and data. You grant us a limited license to process this data to provide
          the service.
        </li>
        <li>
          <strong>Our Service:</strong> The App, including its AI models, algorithms,
          and interface, remains our intellectual property.
        </li>
        <li>
          <strong>Generated Content:</strong> AI-generated tags and metafields become
          your property once synced to your Shopify store.
        </li>
      </ul>

      <h2>6. AI-Generated Content Disclaimer</h2>
      <p>
        <strong>Important:</strong> The App uses artificial intelligence to analyze
        images and generate suggestions. While we strive for accuracy:
      </p>
      <ul>
        <li>AI results may not always be 100% accurate</li>
        <li>You should review all suggestions before syncing to your store</li>
        <li>We are not responsible for inaccurate AI-generated content</li>
        <li>The App should not be used for regulated product categories without human review</li>
      </ul>

      <h2>7. Service Availability</h2>
      <ul>
        <li>We strive for high availability but do not guarantee 100% uptime</li>
        <li>We may perform maintenance that temporarily affects service</li>
        <li>We reserve the right to modify or discontinue features with notice</li>
        <li>Third-party service outages (Shopify, AI providers) may affect the App</li>
      </ul>

      <h2>8. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW:
      </p>
      <ul>
        <li>
          The App is provided "as is" without warranties of any kind, express or implied
        </li>
        <li>
          We are not liable for any indirect, incidental, special, or consequential damages
        </li>
        <li>
          Our total liability is limited to the amount you paid us in the past 12 months
        </li>
        <li>
          We are not responsible for lost sales, data, or business opportunities
        </li>
      </ul>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify and hold us harmless from any claims, damages, or
        expenses arising from your use of the App or violation of these Terms.
      </p>

      <h2>10. Termination</h2>
      <ul>
        <li>You may uninstall the App at any time through Shopify admin</li>
        <li>We may suspend or terminate your access for violation of these Terms</li>
        <li>Upon termination, your data will be deleted per our Privacy Policy</li>
      </ul>

      <h2>11. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the App after
        changes constitutes acceptance of the new Terms. We will notify you of
        significant changes through the App or email.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction where VisionTags
        operates, without regard to conflict of law principles.
      </p>

      <h2>13. Contact</h2>
      <p>
        For questions about these Terms, please contact us:
      </p>
      <ul>
        <li>Email: support@visiontags.app</li>
      </ul>

      <div style={{
        marginTop: "40px",
        padding: "20px",
        backgroundColor: "#f4f6f8",
        borderRadius: "8px"
      }}>
        <p style={{ margin: 0 }}>
          <strong>VisionTags</strong> - AI-Powered Product Tagging for Shopify
        </p>
        <p style={{ margin: "10px 0 0 0", fontSize: "14px" }}>
          <a href="/privacy" style={{ color: "#5c6ac4" }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

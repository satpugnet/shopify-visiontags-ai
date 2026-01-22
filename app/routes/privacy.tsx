import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - VisionTags" },
    { name: "description", content: "Privacy Policy for VisionTags Shopify App" },
  ];
};

export default function PrivacyPolicy() {
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
        Privacy Policy
      </h1>
      <p style={{ color: "#666", marginBottom: "30px" }}>
        Last updated: January 2025
      </p>

      <p>
        This Privacy Policy describes how VisionTags ("we", "us", or "our") collects,
        uses, and shares information when you install and use our Shopify application.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>Store Information</h3>
      <p>When you install VisionTags, we collect:</p>
      <ul>
        <li>Your Shopify store domain (e.g., your-store.myshopify.com)</li>
        <li>Store access tokens (securely stored, used only to communicate with Shopify APIs)</li>
      </ul>

      <h3>Product Information</h3>
      <p>To provide our AI tagging service, we access:</p>
      <ul>
        <li>Product titles and descriptions</li>
        <li>Product images (URLs only - images are processed but not stored)</li>
        <li>Product categories and existing tags</li>
        <li>Product metafields</li>
      </ul>

      <h3>Usage Information</h3>
      <p>We track:</p>
      <ul>
        <li>Number of AI scans performed (for billing purposes)</li>
        <li>Job history (scan results and sync status)</li>
        <li>Subscription plan and billing period</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the collected information to:</p>
      <ul>
        <li>Analyze product images using AI to generate metafields and tags</li>
        <li>Update your Shopify product data with AI-generated suggestions</li>
        <li>Track your usage for billing purposes</li>
        <li>Provide customer support</li>
        <li>Improve our services</li>
      </ul>

      <h2>3. Third-Party Services</h2>
      <p>We use the following third-party services:</p>
      <ul>
        <li>
          <strong>Anthropic (Claude AI)</strong>: Product images are sent to Anthropic's
          API for analysis. Images are processed in real-time and are not stored by
          Anthropic beyond the API request. See{" "}
          <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
            Anthropic's Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Shopify</strong>: We interact with Shopify's APIs to read and update
          your product data. See{" "}
          <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Shopify's Privacy Policy
          </a>.
        </li>
      </ul>

      <h2>4. Data Storage and Security</h2>
      <p>
        Your data is stored securely in our database hosted on Railway. We implement
        industry-standard security measures including:
      </p>
      <ul>
        <li>Encrypted database connections</li>
        <li>Secure API token storage</li>
        <li>HTTPS-only communications</li>
      </ul>
      <p>
        <strong>Image Processing:</strong> Product images are fetched directly from
        Shopify's CDN and sent to the AI service for analysis. We do not store copies
        of your product images.
      </p>

      <h2>5. Data Retention</h2>
      <ul>
        <li>
          <strong>Active accounts:</strong> We retain your data while your app remains
          installed and for a reasonable period afterward to support reactivation.
        </li>
        <li>
          <strong>After uninstallation:</strong> Upon app uninstallation, we delete your
          store data within 48 hours of receiving Shopify's shop/redact webhook.
        </li>
        <li>
          <strong>Usage records:</strong> Anonymized usage statistics may be retained
          for analytics purposes.
        </li>
      </ul>

      <h2>6. Your Rights (GDPR)</h2>
      <p>If you are in the European Economic Area, you have the right to:</p>
      <ul>
        <li><strong>Access:</strong> Request a copy of your personal data</li>
        <li><strong>Rectification:</strong> Request correction of inaccurate data</li>
        <li><strong>Erasure:</strong> Request deletion of your data</li>
        <li><strong>Portability:</strong> Request your data in a portable format</li>
        <li><strong>Object:</strong> Object to processing of your data</li>
      </ul>
      <p>
        To exercise these rights, contact us at the email address below.
      </p>

      <h2>7. California Privacy Rights (CCPA)</h2>
      <p>
        California residents have additional rights under the California Consumer
        Privacy Act. We do not sell personal information. You may request disclosure
        of the categories and specific pieces of personal information we have collected.
      </p>

      <h2>8. Children's Privacy</h2>
      <p>
        Our service is not directed to children under 13. We do not knowingly collect
        personal information from children under 13.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of
        any changes by posting the new Privacy Policy on this page and updating the
        "Last updated" date.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or wish to exercise your
        data rights, please contact us:
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
          <a href="/terms" style={{ color: "#5c6ac4" }}>Terms of Service</a>
        </p>
      </div>
    </div>
  );
}

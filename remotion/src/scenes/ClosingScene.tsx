import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { AppIcon } from "../components/AppIcon";

const PricingBadge: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(adjustedFrame, [0, 20], [20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #5C6AC4 0%, #7B68EE 100%)",
          padding: "16px 32px",
          borderRadius: 50,
          boxShadow: "0 6px 25px rgba(92, 106, 196, 0.4)",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 24,
            fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Free plan: 50 scans/month
        </span>
      </div>
    </div>
  );
};

export const ClosingScene: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Centered content container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
        }}
      >
        {/* App Icon */}
        <AppIcon size={160} animation="pulse" />

        {/* App name */}
        <AnimatedText
          text="VisionTags"
          fontSize={72}
          animation="scale"
          delay={20}
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #B8C4E0 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        />

        {/* Tagline */}
        <AnimatedText
          text="AI-powered product tagging"
          fontSize={36}
          color="#8B9DC3"
          animation="slideUp"
          delay={50}
        />

        {/* CTA */}
        <AnimatedText
          text="Try it free today"
          fontSize={44}
          animation="scale"
          delay={90}
          style={{
            marginTop: 20,
          }}
        />

        {/* Pricing badge */}
        <PricingBadge delay={140} />
      </div>

      {/* Shopify App Store mention - absolute positioned at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          width: "100%",
          textAlign: "center",
        }}
      >
        <AnimatedText
          text="Available on Shopify App Store"
          fontSize={22}
          color="#6B7A99"
          animation="fade"
          delay={200}
        />
      </div>
    </AbsoluteFill>
  );
};

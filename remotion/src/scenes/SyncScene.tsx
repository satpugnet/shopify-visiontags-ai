import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { AnimatedText } from "../components/AnimatedText";

const SyncButton: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 8, mass: 0.5 },
  });

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Pulse effect after button appears
  const pulseFrame = Math.max(0, adjustedFrame - 30);
  const pulseScale = 1 + Math.sin(pulseFrame * 0.15) * 0.03;

  // Click animation
  const clickFrame = adjustedFrame - 60;
  const clickScale = clickFrame > 0 && clickFrame < 15
    ? interpolate(clickFrame, [0, 7, 15], [1, 0.95, 1], { extrapolateRight: "clamp" })
    : 1;

  return (
    <div
      style={{
        transform: `scale(${scale * pulseScale * clickScale})`,
        opacity,
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)",
          padding: "24px 60px",
          borderRadius: 12,
          boxShadow: "0 8px 30px rgba(76, 175, 80, 0.5)",
          border: "2px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 32,
            fontWeight: 700,
            fontFamily: "system-ui, sans-serif",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
          }}
        >
          Sync to Shopify
        </span>
      </div>
    </div>
  );
};

const CheckmarkAnimation: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 10 },
  });

  const strokeDashoffset = interpolate(adjustedFrame, [0, 30], [100, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        transform: `scale(${scale})`,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#4CAF50"
          strokeWidth="4"
          opacity="0.3"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="rgba(76, 175, 80, 0.2)"
        />
        <path
          d="M30 50 L45 65 L70 35"
          fill="none"
          stroke="#4CAF50"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
    </div>
  );
};

export const SyncScene: React.FC = () => {
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
          gap: 40,
        }}
      >
        {/* Main text */}
        <AnimatedText
          text="Select products and sync with one click"
          fontSize={44}
          animation="slideUp"
        />

        {/* Sync button */}
        <SyncButton delay={30} />

        {/* Checkmark after click */}
        <CheckmarkAnimation delay={120} />
      </div>

      {/* Success text at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          width: "100%",
          textAlign: "center",
        }}
      >
        <AnimatedText
          text="Products updated in Shopify instantly!"
          fontSize={32}
          color="#4CAF50"
          animation="scale"
          delay={150}
        />
      </div>
    </AbsoluteFill>
  );
};

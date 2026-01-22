import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

const TopOverlay: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          padding: "16px 40px",
          borderRadius: 12,
          backdropFilter: "blur(10px)",
        }}
      >
        <AnimatedText
          text='Click "Start AI Scan" to analyze your product images'
          fontSize={36}
          animation="fade"
        />
      </div>
    </div>
  );
};

const BottomCallout: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        right: 60,
        opacity,
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #5C6AC4 0%, #7B68EE 100%)",
          padding: "12px 24px",
          borderRadius: 8,
          boxShadow: "0 4px 20px rgba(92, 106, 196, 0.5)",
        }}
      >
        <AnimatedText
          text="One click to scan your entire catalog"
          fontSize={28}
          animation="scale"
        />
      </div>
    </div>
  );
};

export const DashboardScene: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Screenshot with pan-zoom animation */}
      <ScreenshotFrame
        src="screenshots/visiontags-dashboard.png"
        animation="panZoom"
        width={1600}
        height={900}
      />

      {/* Text overlay at top */}
      <TopOverlay delay={30} />

      {/* Highlight callout for Start AI Scan button */}
      <BottomCallout delay={90} />
    </AbsoluteFill>
  );
};

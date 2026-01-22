import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

const Callout: React.FC<{
  text: string;
  x: number;
  y: number;
  delay: number;
  color?: string;
}> = ({ text, x, y, delay, color = "#5C6AC4" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 10 },
  });

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "left center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: color,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 0 15px ${color}80`,
          }}
        >
          <span style={{ color: "white", fontSize: 14, fontWeight: "bold" }}>
            *
          </span>
        </div>
        <div
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            padding: "8px 16px",
            borderRadius: 6,
            border: `1px solid ${color}`,
            boxShadow: `0 4px 15px ${color}40`,
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: 500,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </div>
  );
};

const TopTextOverlay: React.FC<{ delay: number }> = ({ delay }) => {
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
        top: 30,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.8)",
          padding: "14px 36px",
          borderRadius: 10,
          backdropFilter: "blur(10px)",
        }}
      >
        <AnimatedText
          text="Review AI-generated suggestions before syncing"
          fontSize={34}
          animation="fade"
        />
      </div>
    </div>
  );
};

export const ResultsScene: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Screenshot */}
      <ScreenshotFrame
        src="screenshots/visiontags-ai-suggestions.png"
        animation="slideIn"
        width={1500}
        height={850}
      />

      {/* Callouts - using delay prop directly */}
      <Callout
        text="Color: Navy Blue"
        x={200}
        y={350}
        delay={60}
        color="#1976D2"
      />
      <Callout
        text="Material: Polyester"
        x={200}
        y={420}
        delay={90}
        color="#7B1FA2"
      />
      <Callout
        text="Pattern: Abstract"
        x={200}
        y={490}
        delay={120}
        color="#F57C00"
      />
      <Callout
        text='Tags: "Winter Sports", "Outdoor"'
        x={200}
        y={560}
        delay={150}
        color="#388E3C"
      />

      {/* Main text at top */}
      <TopTextOverlay delay={20} />

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <AnimatedText
          text="All generated automatically from your product images"
          fontSize={28}
          color="#8B9DC3"
          animation="slideUp"
          delay={250}
        />
      </div>
    </AbsoluteFill>
  );
};
